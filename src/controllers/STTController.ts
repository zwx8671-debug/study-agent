/** @format */

import { Controller, GET, POST } from 'fastify-decorators'
import type { FastifyReply, FastifyRequest } from 'fastify'
import axios from 'axios'
import { randomUUID } from 'crypto'
import { getLogger, type Logger } from '@utils/Logger'
import { env } from '@config/env'
import { CommonResult } from '@httpdao/cocoadmin/common/cocoadmin.interface'

interface STTRecognizeQuery {
    language?: string
    traceId?: string
}
interface RecognizeData {
    text: string
    traceId: string
}

interface FileSubmitBody {
    url?: string
    audioData?: string
    audioFormat?: string
    language?: string
    traceId?: string
}

interface FileSubmitData {
    taskId: string
    logId?: string
    traceId: string
}

interface FileQueryQuerystring {
    taskId: string
    logId?: string
    traceId?: string
}

interface FileQueryData {
    code?: number
    message?: string
    text?: string
    utterances?: unknown
    taskId: string
    traceId: string
}

interface FileRecognizeBody {
    url?: string
    audioData?: string
    audioFormat?: string
    language?: string
    traceId?: string
}

interface FileRecognizeData {
    taskId: string
    text?: string
    utterances?: unknown
    traceId: string
}

function ok<T>(data: T, msg = 'ok'): CommonResult<T> {
    return { code: 200, msg, data }
}

function fail<T>(code: number, msg: string, data?: T): CommonResult<T> {
    return { code, msg, data }
}

function getAxiosErrorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) return '请求 STT 服务失败'
    const data = error.response?.data as { msg?: string } | undefined
    return data?.msg ?? error.message ?? '请求 STT 服务失败'
}

function isValidWav(audioBuffer: Buffer): boolean {
    return (
        audioBuffer.length >= 12 &&
        audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE'
    )
}
@Controller('/stt')
export default class STTController {
    private logger: Logger = getLogger(STTController.name)

    @POST({ url: '/recognize' })
    async recognize(req: FastifyRequest<{ Querystring: STTRecognizeQuery; Body: Buffer }>, reply: FastifyReply) {
        const { language = 'zh-CN', traceId = randomUUID() } = req.query || {}
        const sttRecognizeUrl = `${env.STT_HTTP_URL.replace(/\/$/, '')}/stt/recognize`
        const audioBuffer = req.body

        if (!audioBuffer || audioBuffer.length === 0) {
            this.logger.warn(`STT recognize: 请求体为空, traceId=${traceId}`)
            return reply.status(400).send(
                fail(400, '请求体不能为空，需要提供 Content-Type: application/octet-stream 的 WAV 音频数据', {
                    traceId
                })
            )
        }

        const MAX_AUDIO_BYTES = 20 * 1024 * 1024
        if (audioBuffer.length > MAX_AUDIO_BYTES) {
            this.logger.warn(
                `STT recognize: 音频文件过大, size=${audioBuffer.length} bytes, max=${MAX_AUDIO_BYTES} bytes, traceId=${traceId}`
            )
            return reply
                .status(413)
                .send(
                    fail(
                        413,
                        `音频文件过大。最大限制 ${Math.floor(MAX_AUDIO_BYTES / 1024 / 1024)}MB，当前 ${Math.floor(audioBuffer.length / 1024 / 1024)}MB。请上传 WAV 格式音频。`,
                        { traceId }
                    )
                )
        }

        if (!isValidWav(audioBuffer)) {
            this.logger.warn(`STT recognize: 无效的 WAV 文件格式, traceId=${traceId}`)
            return reply
                .status(400)
                .send(
                    fail(
                        400,
                        '仅支持 WAV 格式音频（请确保 Content-Type: application/octet-stream 发送的是有效的 WAV 文件）。',
                        { traceId }
                    )
                )
        }

        try {
            const response = await axios.post<CommonResult<RecognizeData>>(sttRecognizeUrl, audioBuffer, {
                params: { language, traceId },
                headers: { 'Content-Type': 'application/octet-stream' },
                timeout: 30000
            })

            const upstream = response.data
            if (upstream?.data && typeof upstream.data === 'object') {
                ;(upstream.data as { traceId?: string }).traceId = traceId
            }

            this.logger.info(`STT recognize success, traceId=${traceId}`)
            return reply.status(200).send(upstream ?? ok({ text: '', traceId }))
        } catch (error: unknown) {
            const message = getAxiosErrorMessage(error)
            this.logger.error(`STT recognize failed, traceId=${traceId}, status=500, message=${message}`)
            return reply.status(500).send(fail(500, message || '语音识别失败，请稍后重试', { traceId }))
        }
    }

    @POST({ url: '/file/submit' })
    async fileSubmit(req: FastifyRequest<{ Body: FileSubmitBody }>, reply: FastifyReply) {
        const sttUrl = `${env.STT_HTTP_URL.replace(/\/$/, '')}/stt/file/submit`
        const { url, audioData, audioFormat = 'wav', language = 'zh-CN' } = req.body || {}
        const traceId = req.body?.traceId || randomUUID()

        if (!url && !audioData) {
            this.logger.warn(`STT file submit: 参数缺失，需要 url 或 audioData, traceId=${traceId}`)
            return reply
                .status(400)
                .send(fail(400, '请提供 url（音频文件地址）或 audioData（音频 base64 数据）其中一个', { traceId }))
        }

        try {
            const response = await axios.post<CommonResult<FileSubmitData>>(
                sttUrl,
                { url, audioData, audioFormat, language, traceId },
                { timeout: 30000 }
            )

            const upstream = response.data
            if (upstream?.data && typeof upstream.data === 'object') {
                ;(upstream.data as { traceId?: string }).traceId = traceId
            }

            return reply.status(200).send(upstream)
        } catch (error: unknown) {
            const message = getAxiosErrorMessage(error)
            this.logger.error(`STT file submit failed, traceId=${traceId}, status=500, message=${message}`)
            return reply.status(500).send(fail(500, message || '提交录音文件识别任务失败', { traceId }))
        }
    }

    @GET({ url: '/file/query' })
    async fileQuery(req: FastifyRequest<{ Querystring: FileQueryQuerystring }>, reply: FastifyReply) {
        const sttUrl = `${env.STT_HTTP_URL.replace(/\/$/, '')}/stt/file/query`
        const { taskId, logId } = req.query || ({} as FileQueryQuerystring)
        const traceId = req.query?.traceId || randomUUID()

        if (!taskId) {
            return reply.status(400).send(fail(400, '缺少必填参数 taskId', { taskId: '', traceId }))
        }

        try {
            const response = await axios.get<CommonResult<FileQueryData>>(sttUrl, {
                params: { taskId, logId, traceId },
                timeout: 30000
            })

            const upstream = response.data
            if (upstream?.data && typeof upstream.data === 'object') {
                ;(upstream.data as { traceId?: string }).traceId = traceId
                ;(upstream.data as { taskId?: string }).taskId = taskId
            }

            return reply.status(200).send(upstream)
        } catch (error: unknown) {
            const message = getAxiosErrorMessage(error)
            this.logger.error(`STT file query failed, traceId=${traceId}, status=500, message=${message}`)
            return reply.status(500).send(fail(500, message || '查询录音文件识别任务失败', { taskId, traceId }))
        }
    }

    @POST({ url: '/file/recognize' })
    async fileRecognize(req: FastifyRequest<{ Body: FileRecognizeBody }>, reply: FastifyReply) {
        const sttUrl = `${env.STT_HTTP_URL.replace(/\/$/, '')}/stt/file/recognize`
        const { url, audioData, audioFormat = 'wav', language = 'zh-CN' } = req.body || {}
        const traceId = req.body?.traceId || randomUUID()

        if (!url && !audioData) {
            this.logger.warn(`STT file recognize: 参数缺失，需要 url 或 audioData, traceId=${traceId}`)
            return reply
                .status(400)
                .send(fail(400, '请提供 url（音频文件地址）或 audioData（音频 base64 数据）其中一个', { traceId }))
        }

        try {
            const response = await axios.post<CommonResult<FileRecognizeData>>(
                sttUrl,
                { url, audioData, audioFormat, language, traceId },
                { timeout: 600000 }
            )

            const upstream = response.data
            if (upstream?.data && typeof upstream.data === 'object') {
                ;(upstream.data as { traceId?: string }).traceId = traceId
            }

            return reply.status(200).send(upstream)
        } catch (error: unknown) {
            const message = getAxiosErrorMessage(error)
            this.logger.error(`STT file recognize failed, traceId=${traceId}, status=500, message=${message}`)
            return reply.status(500).send(fail(500, message || '录音文件识别失败，请稍后重试', { traceId }))
        }
    }
}
