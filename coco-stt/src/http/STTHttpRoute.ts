/** @format */

import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { STTFactory } from '@stt/STTFactory'
import { STTHttpFactory } from '@stt/STTHttpFactory'
import { getLogger } from '@utils/Logger'
import type { CommonResult } from '../types/CommonResult'
import { getProviderCatalog, resolveAsset } from './STTCatalog'
import type {
    FileRecognizeBody,
    FileRecognizeData,
    ProvidersData,
    RecognizeData,
    RecognizeQuerystring
} from './STTHttpRoute.types'


const log = getLogger('STTHttpRoute')

function ok<T>(data: T, msg = 'ok'): CommonResult<T> {
    return { code: 200, msg, data }
}

function fail<T>(code: number, msg: string, data?: T): CommonResult<T> {
    return { code, msg, data }
}

/**
 * STT HTTP 路由插件
 *
 * 注册端点：
 *   GET  /                        — 浏览器测试页
 *   GET  /test                    — 测试页别名
 *   GET  /stt/providers           — 各提供商目录
 *   POST /stt/recognize
 *     Content-Type: application/octet-stream
 *     请求体:   WAV 格式音频原始字节（需包含完整 WAV 文件头）
 *     查询参数: language=zh-CN  （可选，默认 zh-CN）
 *               traceId=xxx      （可选，默认自动生成 UUID）
 *               provider=qwen    （可选，缺省用环境变量）
 *     响应体:   { success, text, traceId }
 *   POST /stt/file/recognize
 *     Content-Type: application/json
 *     请求体:   url 或 audioData（火山引擎极速版同步识别）
 *     响应体:   { success, taskId, text, utterances, traceId }
 */
export const sttHttpRoutePlugin: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
    const sendTestPage = async (_request: FastifyRequest, reply: FastifyReply) => {
        const file = resolveAsset('test-ui', 'index.html')
        if (!file) {
            return reply.status(404).type('text/plain; charset=utf-8').send('测试页未找到，请确认 assets/test-ui/index.html 存在')
        }
        return reply.type('text/html; charset=utf-8').send(readFileSync(file, 'utf8'))
    }

    fastify.get('/', sendTestPage)
    fastify.get('/test', sendTestPage)

    fastify.get<{ Reply: CommonResult<ProvidersData> }>('/stt/providers', async () => {
        return ok(getProviderCatalog())
    })

    // 注册 application/octet-stream 内容类型解析器，将请求体解析为原始 Buffer
    fastify.addContentTypeParser(
        'application/octet-stream',
        { parseAs: 'buffer' },
        (_req, body, done) => {
            done(null, body as Buffer)
        }
    )

    fastify.post<{
        Querystring: RecognizeQuerystring
        Body: Buffer
        Reply: CommonResult<RecognizeData>
    }>(
        '/stt/recognize',
        async (
            request: FastifyRequest<{ Querystring: RecognizeQuerystring; Body: Buffer }>,
            reply: FastifyReply
        ) => {
            const { language = 'zh-CN', traceId = randomUUID(), provider } = request.query
            const audioBuffer = request.body

            if (provider) {
                try {
                    STTFactory.resolveType(provider)
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    return reply.status(400).send(fail(400, message, { traceId }))
                }
            }

            // 1. 校验请求体
            if (!audioBuffer || audioBuffer.length === 0) {
                log.warn(`请求体为空: traceId=${traceId}`)
                return reply
                    .status(400)
                    .send(fail(400, '请求体不能为空，需要提供 Content-Type: application/octet-stream 的 WAV 音频数据', { traceId }))
            }

            // 2. 校验文件大小（最大 20MB）
            const MAX_AUDIO_BYTES = 20 * 1024 * 1024
            if (audioBuffer.length > MAX_AUDIO_BYTES) {
                log.warn(`音频文件过大: size=${audioBuffer.length} bytes, max=${MAX_AUDIO_BYTES} bytes, traceId=${traceId}`)
                return reply.status(413).send(
                    fail(
                        413,
                        `音频文件过大。最大限制 ${Math.floor(MAX_AUDIO_BYTES / 1024 / 1024)}MB，当前 ${Math.floor(audioBuffer.length / 1024 / 1024)}MB。请上传 WAV 格式音频。`,
                        { traceId }
                    )
                )
            }

            // 3. 校验 WAV 文件头（前 12 字节应包含 "RIFF" 和 "WAVE"）
            const isValidWav = 
                audioBuffer.length >= 12 &&
                audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
                audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE'

            if (!isValidWav) {
                log.warn(`无效的 WAV 文件格式: traceId=${traceId}`)
                return reply
                    .status(400)
                    .send(fail(400, '仅支持 WAV 格式音频（请确保 Content-Type: application/octet-stream 发送的是有效的 WAV 文件）。', { traceId }))
            }

            log.info(
                `收到有效识别请求: provider=${provider || 'default'}, language=${language}, audioSize=${audioBuffer.length} bytes, traceId=${traceId}`
            )

            // 2. 调用工厂创建 STT 服务并执行识别
            try {
                const sttService = STTHttpFactory.create(provider)
                const text = await sttService.recognize(audioBuffer, language)

                log.info(`识别完成: text="${text}", traceId=${traceId}`)

                return reply.status(200).send(ok({ text, traceId }))
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                log.error(`识别失败: ${message}, traceId=${traceId}`)

                return reply.status(500).send(fail(500, message || '语音识别失败，请稍后重试', { traceId }))
            }
        }
    )

    // ==================== 录音文件同步识别（火山引擎极速版）====================

    /**
     * POST /stt/file/recognize — 同步识别录音文件
     *
     * Content-Type: application/json
     * 请求体:
     *   url        — 音频文件 URL（与 audioData 二选一）
     *   audioData  — 音频 base64 数据（与 url 二选一）
     *   audioFormat — 音频格式，默认 wav
     *   language   — 识别语言，默认 zh-CN
     *   traceId    — 可选追踪 ID
     * 响应体: { success, taskId, text, utterances, traceId }
     */
    fastify.post<{
        Body: FileRecognizeBody
        Reply: CommonResult<FileRecognizeData>
    }>(
        '/stt/file/recognize',
        async (
            request: FastifyRequest<{ Body: FileRecognizeBody }>,
            reply: FastifyReply
        ) => {
            const { url, audioData, audioFormat = 'wav', language = 'zh-CN', traceId = randomUUID() } = request.body || {}

            // 参数校验
            if (!url && !audioData) {
                log.warn(`识别请求参数缺失: 需要 url 或 audioData, traceId=${traceId}`)
                return reply
                    .status(400)
                    .send(fail(400, '请提供 url（音频文件地址）或 audioData（音频 base64 数据）其中一个', { traceId }))
            }

            log.info(`收到录音文件同步识别请求: hasUrl=${!!url}, hasAudioData=${!!audioData}, format=${audioFormat}, language=${language}, traceId=${traceId}`)

            try {
                const service = STTHttpFactory.createVolcengineFileService()
                const result = await service.recognizeFile({ url, audioData, audioFormat, language })

                log.info(`录音文件识别完成: requestId=${result.id}, text="${result.text?.substring(0, 80)}...", traceId=${traceId}`)

                return reply.status(200).send(
                    ok({
                        taskId: result.id,
                        text: result.text,
                        utterances: result.utterances,
                        traceId
                    })
                )
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                log.error(`录音文件识别失败: ${message}, traceId=${traceId}`)

                return reply.status(500).send(fail(500, message || '录音文件识别失败，请稍后重试', { traceId }))
            }
        }
    )
}

