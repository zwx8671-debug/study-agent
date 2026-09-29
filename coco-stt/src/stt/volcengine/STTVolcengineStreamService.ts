/** @format */

import WebSocket, { type Data } from 'ws'
import zlib from 'zlib'
import {
    VOICE_STT_ACCESS_TOKEN,
    VOICE_STT_API,
    VOICE_STT_APP_ID,
    VOICE_STT_MODEL,
    VOICE_STT_MODEL_VER,
    VOICE_STT_RESOURCE_ID,
    VOICE_STT_SAMPLE_RATE,
    VOICE_STT_TIMEOUT
} from './config-volcengine'
import { randomUUID } from 'crypto'
import { AudioFormatEnum, STTStreamOptions } from '@interface/ISTT'
import { STTWsConnectOptions, STTWsStreamService } from '../STTWsStreamService'

export interface STTWord {
    blank_duration: number
    end_time: number
    start_time: number
    text: string
}

export interface STTUtterance {
    definite: boolean
    end_time: number
    text: string
    start_time?: number
    words?: STTWord[]
    additions?: {
        source: string
        all_matched_hotwords?: string
        fixed_prefix_result?: string
    }
}

export interface STTResult {
    text?: string
    utterances?: STTUtterance[]
    prefetch?: boolean
    additions?: {
        log_id: string
    }
}

export interface STTAudioInfo {
    duration: number
}

export interface STTResponseMessage {
    code: number
    event: number
    is_last_package: boolean
    payload_sequence: number
    payload_size: number
    payload_msg: {
        result?: STTResult
        audio_info?: STTAudioInfo
        message?: string
    }
}

const ProtocolVersion = {
    V1: 0x01
}

const MessageType = {
    CLIENT_FULL_REQUEST: 0x01,
    CLIENT_AUDIO_ONLY_REQUEST: 0x02,
    SERVER_FULL_RESPONSE: 0x09,
    SERVER_ERROR_RESPONSE: 0x0f
}

const MessageTypeSpecificFlags = {
    NO_SEQUENCE: 0x00,
    POS_SEQUENCE: 0x01,
    NEG_SEQUENCE: 0x02,
    NEG_WITH_SEQUENCE: 0x03
}

const SerializationType = {
    NO_SERIALIZATION: 0x00,
    JSON: 0x01
}

const CompressionType = {
    NO_COMPRESSION: 0x00,
    GZIP: 0x01
}

export class STTVolcengineStreamService extends STTWsStreamService {
    private seq = 0

    constructor(uid: string, options?: STTStreamOptions) {
        super(uid, options)
    }

    protected getConnectOptions(): STTWsConnectOptions {
        return {
            url: VOICE_STT_API,
            headers: {
                'X-Api-App-Key': VOICE_STT_APP_ID,
                'X-Api-Access-Key': VOICE_STT_ACCESS_TOKEN,
                'X-Api-Resource-Id': VOICE_STT_RESOURCE_ID,
                'X-Api-Request-Id': randomUUID().toString()
            },
            timeoutMs: VOICE_STT_TIMEOUT
        }
    }

    protected getReadyTimeoutMs(): number {
        return VOICE_STT_TIMEOUT
    }

    protected getCloseTimeoutMs(): number {
        return VOICE_STT_TIMEOUT
    }

    protected async waitReady(ws: WebSocket, format: AudioFormatEnum): Promise<void> {
        const data = {
            user: { uid: this.uid },
            audio: {
                format,
                rate: VOICE_STT_SAMPLE_RATE
            },
            request: {
                model_name: VOICE_STT_MODEL,
                model_version: VOICE_STT_MODEL_VER,
                enable_nonstream: true,
                // 默认为true。
                // 文本规范化 (ITN) 是自动语音识别 (ASR) 后处理管道的一部分。 ITN 的任务是将 ASR 模型的原始语音输出转换为书面形式，以提高文本的可读性。
                // 例如，“一九七零年”->“1970年”和“一百二十三美元”->“$123”。
                enable_itn: this.options?.enableItn ?? true,
                // 启用顺滑
                enable_ddc: true,
                // 启用情绪检测
                enable_emotion_detection: false,
                // 启用性别检测
                enable_gender_detection: false,
                // 如果设为"True"，则会尽量加速首字返回，但会降低首字准确率。
                // 默认 "False"
                enable_accelerate_text: true,
                // 首字返回加速率 配合 enable_accelerate_text 参数使用，默认为0，表示不加速，取值范围[0-20]，值越大，首字出字越快
                accelerate_score: 15,
                // 启用标点 默认true
                enable_punc: this.options?.enablePunc ?? true,
                // 默认为"full",全量返回。
                // 设置为"single"则为增量结果返回，即不返回之前分句的结果。
                result_type: this.options?.resultType === 'single' ? 'single' : 'full'
            }
        }

        ws.send(this.createFullClientRequest(++this.seq, JSON.stringify(data)))
        await this.waitForReady('火山 STT start timeout: no response from server')
    }

    protected sendAudio(ws: WebSocket, audio: Buffer): void {
        ws.send(this.createAudioOnlyRequest(++this.seq, audio))
    }

    protected async finalize(ws: WebSocket): Promise<void> {
        ws.send(this.createAudioOnlyRequest(-++this.seq, Buffer.alloc(0)))
    }

    protected handleUpstreamMessage(data: Data): void {
        const response = this.parseResponse(data)
        if (!response) return

        if (response.code !== 0) {
            const errorDetails = this.getErrorCodeDescription(response.code)
            const errorMsg = response.payload_msg?.message || `STT Error: ${response.code} - ${errorDetails}`
            throw new Error(errorMsg)
        }

        this.notifyReady()

        if (response.payload_msg?.result?.text) {
            this.emit('data', response.payload_msg.result.text)
        }

        if (response.is_last_package) this.markClosed()
    }

    /**
     * 获取STT错误码说明
     * @param code 错误码
     * @returns 错误说明
     */
    private getErrorCodeDescription(code: number): string {
        const errorCodes: Record<number, string> = {
            20000000: '成功',
            45000001: '请求参数无效',
            45000002: '空音频',
            45000081: '等包超时',
            45000151: '音频格式不正确',
            55000031: '服务器繁忙'
        }
        return errorCodes[code] || '服务内部处理错误'
    }

    // 创建完整客户端请求 - 与Python版本保持一致
    private createFullClientRequest(seq: number, data: string): Buffer {
        const payloadBytes = Buffer.from(data, 'utf8')
        const compressedPayload = zlib.gzipSync(payloadBytes)

        // 构建请求头
        const header = Buffer.alloc(4)
        header[0] = (ProtocolVersion.V1 << 4) | 0x01 // protocol version + header size
        header[1] = (MessageType.CLIENT_FULL_REQUEST << 4) | MessageTypeSpecificFlags.POS_SEQUENCE
        header[2] = (SerializationType.JSON << 4) | CompressionType.GZIP
        header[3] = 0x00 // reserved

        // 序列号 (大端序)
        const seqBuffer = Buffer.alloc(4)
        seqBuffer.writeInt32BE(seq, 0)

        // 负载大小 (大端序)
        const sizeBuffer = Buffer.alloc(4)
        sizeBuffer.writeUInt32BE(compressedPayload.length, 0)

        return Buffer.concat([header, seqBuffer, sizeBuffer, compressedPayload])
    }

    // 创建仅音频请求 - 与Python版本保持一致
    private createAudioOnlyRequest(seq: number, audioData: Buffer): Buffer {
        const compressedAudio = zlib.gzipSync(audioData)

        // 构建请求头
        const header = Buffer.alloc(4)
        header[0] = (ProtocolVersion.V1 << 4) | 0x01 // protocol version + header size

        if (seq < 0)
            header[1] = (MessageType.CLIENT_AUDIO_ONLY_REQUEST << 4) | MessageTypeSpecificFlags.NEG_WITH_SEQUENCE
        else header[1] = (MessageType.CLIENT_AUDIO_ONLY_REQUEST << 4) | MessageTypeSpecificFlags.POS_SEQUENCE

        header[2] = (SerializationType.NO_SERIALIZATION << 4) | CompressionType.GZIP
        header[3] = 0x00 // reserved

        // 序列号 (大端序)
        const seqBuffer = Buffer.alloc(4)
        seqBuffer.writeInt32BE(seq, 0)

        // 负载大小 (大端序)
        const sizeBuffer = Buffer.alloc(4)
        sizeBuffer.writeUInt32BE(compressedAudio.length, 0)

        return Buffer.concat([header, seqBuffer, sizeBuffer, compressedAudio])
    }

    // 解析响应 - 与Python版本保持一致
    private parseResponse(msg: Data): STTResponseMessage | null {
        if (!Buffer.isBuffer(msg)) {
            if (typeof msg === 'string') return JSON.parse(msg)
            return null
        }

        const buffer = msg as Buffer

        if (buffer.length < 12) throw new Error('Invalid response: too short')

        const response: STTResponseMessage = {
            code: 0,
            event: 0,
            is_last_package: false,
            payload_sequence: 0,
            payload_size: 0,
            payload_msg: {}
        }

        // 解析头部
        const headerSize = buffer[0] & 0x0f
        const messageType = (buffer[1] >> 4) & 0x0f
        const messageTypeSpecificFlags = buffer[1] & 0x0f
        const serializationMethod = (buffer[2] >> 4) & 0x0f
        const messageCompression = buffer[2] & 0x0f

        let payload = buffer.subarray(headerSize * 4)

        // 解析 message_type_specific_flags
        if (messageTypeSpecificFlags & 0x01) {
            response.payload_sequence = payload.readInt32BE(0)
            payload = payload.subarray(4)
        }
        if (messageTypeSpecificFlags & 0x02) {
            response.is_last_package = true
        }
        if (messageTypeSpecificFlags & 0x04) {
            response.event = payload.readInt32BE(0)
            payload = payload.subarray(4)
        }

        // 解析 message_type
        if (messageType === MessageType.SERVER_FULL_RESPONSE) {
            response.payload_size = payload.readUInt32BE(0)
            payload = payload.subarray(4)
        } else if (messageType === MessageType.SERVER_ERROR_RESPONSE) {
            response.code = payload.readInt32BE(0)
            response.payload_size = payload.readUInt32BE(4)
            payload = payload.subarray(8)
        }

        if (payload.length === 0) return response

        // 解压缩
        if (messageCompression === CompressionType.GZIP) payload = zlib.gunzipSync(payload)

        // 解析payload
        if (serializationMethod === SerializationType.JSON) response.payload_msg = JSON.parse(payload.toString('utf8'))

        return response
    }
}
