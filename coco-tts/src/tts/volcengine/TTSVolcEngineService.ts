/** @format */

import { getLogger } from '@utils/Logger'
import {
    VOICE_TTS_ACCESS_TOKEN,
    VOICE_TTS_APP_ID,
    VOICE_TTS_RESOURCE_ID,
    VOICE_TTS_SAMPLE_RATE,
    VOLC_VOICE_TTS_DEFAULT_SPEAKER
} from './config-volcengine'
import axios, { AxiosResponse } from 'axios'
import readline from 'readline'
import { v7 } from 'uuid'
import { TTSResult } from '../TTSFactory'
import { AudioFormatEnum } from '@interface/IAgent'
import { Readable } from 'stream'
import $ from '@utils/util'
import { VoiceAttr } from '@tts/azure/TTSAzureService'
import type { TTSHttpAudioResult, TTSHttpSseHandlers, TTSHttpSseResult } from '../TTSHttp.types'

interface VolcData {
    code: number
    message: string
    data: string
    sentence: string
}

/**
 * 火山引擎 HTTP / HTTP+SSE（单向流）合成。
 * WebSocket 双向流式走 TTSVolcengineStreamService，不在此调用。
 */
export class TTSVolcEngineService {
    private static log = getLogger(TTSVolcEngineService.name)

    /**
     * 上游 HTTP 单向流（NDJSON），作为本实现的 HTTP+SSE 通道。
     */
    public static async synthesizeSpeechStream(
        text: string,
        voiceAttr: VoiceAttr,
        fileType: AudioFormatEnum
    ): Promise<Readable> {
        const ttsId = v7()
        const data = JSON.stringify({
            user: {
                uid: ttsId
            },
            req_params: {
                text: text,
                speaker: voiceAttr.speaker || VOLC_VOICE_TTS_DEFAULT_SPEAKER,
                audio_params: {
                    format: fileType,
                    sample_rate: VOICE_TTS_SAMPLE_RATE,
                    emotion: voiceAttr.emotion,
                    speech_rate: Number(voiceAttr.speech_rate),
                    loudness_rate: Number(voiceAttr.loudness_rate)
                },
                additions: $.stringify({
                    // 是否开启markdown解析过滤，
                    // 为true时，解析并过滤markdown语法，例如，**你好**，会读为“你好”，
                    // 为false时，不解析不过滤，例如，**你好**，会读为“星星‘你好’星星”
                    disable_markdown_filter: true,
                    // 开启emoji表情在文本中不过滤显示，默认为false，建议搭配时间戳参数一起使用。
                    disable_emoji_filter: true,
                    // 自动识别语种
                    enable_language_detector: true,
                    // 是否过滤括号内的部分，0为不过滤，100为过滤
                    max_length_to_filter_parenthesis: 100,
                    // 是否可以播报latex公式，需将disable_markdown_filter设为true
                    enable_latex_tn: false
                })
            }
        })

        const res: AxiosResponse = await axios({
            method: 'post' as const,
            url: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
            headers: {
                'X-Api-App-Key': VOICE_TTS_APP_ID, // 应用ID
                'X-Api-Access-Key': VOICE_TTS_ACCESS_TOKEN, // 访问令牌
                'X-Api-Resource-Id': VOICE_TTS_RESOURCE_ID // 资源ID
            },
            data: data,
            responseType: 'stream' as const // 改为 stream 模式
        })

        return res.data // 返回可读流
    }

    /**
     * HTTP+SSE：边收上游分片边回调
     */
    public static async synthesizeHttpSse(
        text: string,
        voiceAttr: VoiceAttr,
        handlers: TTSHttpSseHandlers,
        fileType: AudioFormatEnum = AudioFormatEnum.PCM
    ): Promise<TTSHttpSseResult | null> {
        const format = fileType
        const sampleRate = VOICE_TTS_SAMPLE_RATE
        const stream = await this.synthesizeSpeechStream(text, voiceAttr, fileType)
        if (handlers.onStart) await handlers.onStart({ format, sampleRate })

        let chunks = 0
        let size = 0
        let lastError: string | undefined

        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
        for await (const line of rl) {
            const raw = String(line).trim()
            if (!raw) continue

            let data: VolcData
            try {
                data = JSON.parse(raw) as VolcData
            } catch (error) {
                this.log.warn('解析火山 HTTP 流失败，忽略该行', { line: raw, errorMsg: error })
                continue
            }

            if (data.code === 0 && data.data) {
                const chunk = Buffer.from(data.data, 'base64')
                const index = chunks++
                size += chunk.length
                await handlers.onChunk(chunk, index)
            } else if (data.code === 20000000) {
                // 流结束
            } else if (data.code > 0) {
                lastError = data.message || `volcengine error code ${data.code}`
            }
        }

        if (lastError) throw new Error(lastError)
        return { format, sampleRate, size, chunks }
    }

    /**
     * HTTP 一次性合成
     */
    public static async synthesizeHttp(
        text: string,
        voiceAttr: VoiceAttr,
        fileType: AudioFormatEnum = AudioFormatEnum.PCM
    ): Promise<TTSHttpAudioResult | null> {
        const buffers: Buffer[] = []
        const meta = await this.synthesizeHttpSse(
            text,
            voiceAttr,
            {
                onChunk: chunk => {
                    buffers.push(chunk)
                }
            },
            fileType
        )
        if (!meta) return null
        return {
            audio: Buffer.concat(buffers),
            format: meta.format,
            sampleRate: meta.sampleRate,
            chunks: meta.chunks
        }
    }

    public static async synthesizeSpeech(
        text: string,
        voiceAttr: VoiceAttr,
        fileType: AudioFormatEnum
    ): Promise<TTSResult> {
        const result = await this.synthesizeHttp(text, voiceAttr, fileType)
        return {
            audio: result?.audio.toString('base64') || '',
            format: fileType
        }
    }
}
