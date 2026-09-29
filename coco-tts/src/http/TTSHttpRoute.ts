/** @format */

import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { env } from '@config/env'
import { TTSFactory } from '@tts/TTSFactory'
import { TTSHttpBadRequestError, TTSHttpService, SynthesizeParams } from '@tts/TTSHttpService'
import { getLogger } from '@utils/Logger'
import { TraceContext } from '@utils/TraceContext'
import { convertPcmToWavBuffer } from '@utils/pcmToWav'
import { CommonResult, fail, ok } from '../types/CommonResult'
import { getVoiceCatalog, resolveAsset } from './TTSVoiceCatalog'
import { readFileSync } from 'fs'
import type {
    StatusData,
    SynthesizeBody,
    SynthesizeData,
    SynthesizeQuerystring,
    VoicesData
} from './TTSHttpRoute.types'

const log = getLogger('TTSHttpRoute')

/** 单次请求允许合成的最大文本长度 */
const MAX_TEXT_LENGTH = 5000

/**
 * TTS HTTP 路由插件
 *
 * 注册端点：
 *   GET  /                        — 浏览器测试页
 *   GET  /test                    — 测试页别名
 *   GET  /tts/status              — 当前 TTS 实现与音频参数
 *   GET  /tts/voices              — 各提供商音色目录
 *   POST /tts/synthesize          — HTTP 一次性合成，返回 base64 音频
 *   POST /tts/synthesize/stream   — HTTP+SSE 流式合成，chunked 返回音频字节流
 */
export const ttsHttpRoutePlugin: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
    const sendTestPage = async (_request: FastifyRequest, reply: FastifyReply) => {
        const file = resolveAsset('test-ui', 'index.html')
        if (!file) {
            return reply.status(404).type('text/plain; charset=utf-8').send('测试页未找到，请确认 assets/test-ui/index.html 存在')
        }
        return reply.type('text/html; charset=utf-8').send(readFileSync(file, 'utf8'))
    }

    fastify.get('/', sendTestPage)
    fastify.get('/test', sendTestPage)

    fastify.get<{ Reply: CommonResult<StatusData> }>('/tts/status', async () => {
        const { format, sampleRate } = TTSFactory.audioMeta
        let defaultSpeaker = ''
        try {
            defaultSpeaker = TTSFactory.getDefaultSpeaker
        } catch {
            // 未知服务类型时不阻塞状态查询
        }

        return ok({
            ttsServiceType: env.TTS_SERVICE_TYPE,
            format,
            sampleRate,
            defaultSpeaker,
            available: true
        })
    })

    fastify.get<{ Reply: CommonResult<VoicesData> }>('/tts/voices', async () => {
        return ok(getVoiceCatalog())
    })

    /**
     * POST /tts/synthesize — HTTP 一次性合成（不走 WebSocket 流式事件）
     *
     * Content-Type: application/json
     * 请求体:
     *   text          — 文本，字符串或字符串数组（数组会拼接为完整文本）
     *   speaker       — 音色，可选
     *   emotion       — 情感，可选
     *   language      — 语言，可选
     *   loudness_rate — 音量倍率，可选
     *   speech_rate   — 语速倍率，可选
     *   sessionId     — 会话ID，可选
     *   deviceSN      — 设备序列号，可选
     *   traceId       — 追踪ID，可选
     *   provider      — 提供商，可选，缺省用环境变量
     * 查询参数:
     *   format=pcm|wav — 返回音频格式，默认 pcm；wav 会补上 WAV 头便于直接播放
     * 响应体: { code, msg, data: { audio, format, sampleRate, size, chunks, duration, sessionId, traceId } }
     */
    fastify.post<{
        Body: SynthesizeBody
        Querystring: SynthesizeQuerystring
        Reply: CommonResult<SynthesizeData | { traceId: string }>
    }>(
        '/tts/synthesize',
        async (
            request: FastifyRequest<{ Body: SynthesizeBody; Querystring: SynthesizeQuerystring }>,
            reply: FastifyReply
        ) => {
            const body = request.body || {}
            const traceId = body.traceId || randomUUID()
            const wantWav = request.query?.format === 'wav'

            const invalid = validateSynthesize(body)
            if (invalid) {
                log.warn(`合成参数不合法: ${invalid}, traceId=${traceId}`)
                return reply.status(400).send(fail(400, invalid, { traceId }))
            }

            return TraceContext.run({ traceId, deviceSN: body.deviceSN, sessionId: body.sessionId }, async () => {
                const provider = TTSFactory.resolveType(body.provider)
                if (!TTSHttpService.supportsHttp(provider)) {
                    return reply.status(501).send(fail(501, `${provider} 不支持 HTTP 合成`, { traceId }))
                }

                log.infoMsg(
                    `收到一次性合成请求: provider=${provider}, textLength=${textLength(body.text)}, format=${wantWav ? 'wav' : 'pcm'}`
                )

                try {
                    const result = await TTSHttpService.synthesize(toParams(body))
                    const wrapWav = wantWav && result.format === 'pcm'
                    const audio = wrapWav ? convertPcmToWavBuffer(result.audio, result.sampleRate) : result.audio

                    log.infoMsg(`合成完成: size=${audio.length} bytes, chunks=${result.chunks}, cost=${result.duration}ms`)

                    return reply.status(200).send(
                        ok({
                            audio: audio.toString('base64'),
                            format: wrapWav ? 'wav' : result.format,
                            sampleRate: result.sampleRate,
                            size: audio.length,
                            chunks: result.chunks,
                            duration: result.duration,
                            sessionId: result.sessionId,
                            traceId
                        })
                    )
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    log.errorMsg('语音合成失败', { errorMsg: err })
                    const status = err instanceof TTSHttpBadRequestError ? err.status : 500

                    return reply.status(status).send(fail(status, message || '语音合成失败，请稍后重试', { traceId }))
                }
            })
        }
    )

    /**
     * POST /tts/synthesize/stream — HTTP+SSE 流式合成（不走 WebSocket 流式事件）
     *
     * 请求体同 /tts/synthesize；调用各提供商的 HTTP+SSE，再以 chunked 下发音频字节流。
     * 提供商没有 HTTP+SSE 时返回 501。
     *
     * 响应头:
     *   Content-Type: application/octet-stream
     *   X-TTS-Format / X-TTS-Sample-Rate / X-TTS-Session-Id / X-TTS-Trace-Id
     */
    fastify.post<{
        Body: SynthesizeBody
        Reply: CommonResult<{ traceId: string }>
    }>('/tts/synthesize/stream', async (request: FastifyRequest<{ Body: SynthesizeBody }>, reply: FastifyReply) => {
        const body = request.body || {}
        const traceId = body.traceId || randomUUID()

        const invalid = validateSynthesize(body)
        if (invalid) {
            log.warn(`流式合成参数不合法: ${invalid}, traceId=${traceId}`)
            return reply.status(400).send(fail(400, invalid, { traceId }))
        }

        return TraceContext.run({ traceId, deviceSN: body.deviceSN, sessionId: body.sessionId }, async () => {
            const provider = TTSFactory.resolveType(body.provider)
            if (!TTSHttpService.supportsHttpSse(provider)) {
                return reply.status(501).send(fail(501, `${provider} 不支持 HTTP+SSE 合成`, { traceId }))
            }

            log.infoMsg(`收到流式合成请求: provider=${provider}, textLength=${textLength(body.text)}`)

            // 交给底层 raw 响应，自行控制分块写出
            reply.hijack()
            const raw = reply.raw
            let aborted = false
            raw.on('close', () => {
                aborted = true
            })

            try {
                const result = await TTSHttpService.synthesizeStream(toParams(body), {
                    onStart: meta => {
                        raw.writeHead(200, {
                            'Content-Type': 'application/octet-stream',
                            'Transfer-Encoding': 'chunked',
                            'Cache-Control': 'no-cache, no-transform',
                            'X-TTS-Format': meta.format,
                            'X-TTS-Sample-Rate': String(meta.sampleRate),
                            'X-TTS-Session-Id': meta.sessionId,
                            'X-TTS-Trace-Id': traceId,
                            'Access-Control-Expose-Headers':
                                'X-TTS-Format, X-TTS-Sample-Rate, X-TTS-Session-Id, X-TTS-Trace-Id'
                        })
                    },
                    onChunk: chunk => writeChunk(raw, chunk, () => aborted)
                })

                if (!aborted) raw.end()
                log.infoMsg(
                    `流式合成完成: size=${result.size} bytes, chunks=${result.chunks}, cost=${result.duration}ms`
                )
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                log.errorMsg('流式语音合成失败', { errorMsg: err })

                if (aborted) return

                const status = err instanceof TTSHttpBadRequestError ? err.status : 500
                // 响应头未写出时还能返回标准错误体，否则只能中断连接
                if (!raw.headersSent) {
                    raw.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
                    raw.end(JSON.stringify(fail(status, message || '语音合成失败，请稍后重试', { traceId })))
                } else {
                    raw.destroy()
                }
            }
        })
    })
}

function toParams(body: SynthesizeBody): SynthesizeParams {
    return {
        text: body.text!,
        speaker: body.speaker,
        emotion: body.emotion,
        language: body.language,
        loudness_rate: body.loudness_rate,
        speech_rate: body.speech_rate,
        sessionId: body.sessionId,
        deviceSN: body.deviceSN,
        provider: body.provider
    }
}

function textLength(text?: string | string[]): number {
    if (!text) return 0
    return Array.isArray(text) ? text.join('').length : text.length
}

/**
 * 校验合成请求，合法返回 undefined，否则返回错误提示
 */
function validateSynthesize(body: SynthesizeBody): string | undefined {
    if (body.provider) {
        try {
            TTSFactory.resolveType(body.provider)
        } catch (err) {
            return err instanceof Error ? err.message : String(err)
        }
    }
    return validateText(body.text)
}

/**
 * 校验文本参数，合法返回 undefined，否则返回错误提示
 */
function validateText(text?: string | string[]): string | undefined {
    if (text === undefined || text === null) {
        return '缺少必填参数 text（字符串或字符串数组）'
    }
    if (Array.isArray(text) && text.some(item => typeof item !== 'string')) {
        return '参数 text 为数组时，元素必须都是字符串'
    }
    if (!Array.isArray(text) && typeof text !== 'string') {
        return '参数 text 必须是字符串或字符串数组'
    }

    const length = textLength(text)
    if (length === 0) {
        return '参数 text 不能为空'
    }
    if (length > MAX_TEXT_LENGTH) {
        return `参数 text 过长，最大 ${MAX_TEXT_LENGTH} 字符，当前 ${length} 字符`
    }
    return undefined
}

/**
 * 写出一块音频，遵守 TCP 背压
 */
function writeChunk(raw: FastifyReply['raw'], chunk: Buffer, isAborted: () => boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (isAborted()) {
            resolve()
            return
        }

        const flushed = raw.write(chunk, error => {
            if (error && !isAborted()) reject(error)
        })
        if (flushed) resolve()
        else raw.once('drain', resolve)
    })
}
