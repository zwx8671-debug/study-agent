/** @format */

import axios from 'axios'
import readline from 'readline'
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/IAgent'
import type { VoiceAttr } from '../azure/TTSAzureService'
import type { TTSHttpAudioResult, TTSHttpSseHandlers, TTSHttpSseResult } from '../TTSHttp.types'

const log = getLogger('TTSQwenHttpService')

interface QwenAudioObject {
    data?: string
    url?: string
    format?: string
    sample_rate?: number
}

interface QwenSsePayload {
    code?: number
    message?: string
    output?: {
        audio?: string | QwenAudioObject
        audio_url?: string
        text?: string
        [key: string]: unknown
    }
    usage?: unknown
    [key: string]: unknown
}

export interface QwenHttpResult {
    audio: string
    format: AudioFormatEnum
    chunks: number
}

export class TTSQwenHttpService {
    private static get apiKey(): string {
        return env.QWEN_API_KEY || ''
    }

    private static get url(): string {
        return env.QWEN_TTS_HTTP_URL || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    }

    private static get model(): string {
        return env.QWEN_TTS_HTTP_MODEL || 'qwen3-tts-flash'
    }

    private static get defaultSpeaker(): string {
        return env.QWEN_TTS_HTTP_DEFAULT_SPEAKER || 'Cherry'
    }

    /**
     * HTTP 一次性合成（不启用 SSE）
     */
    public static async synthesizeHttp(text: string, voiceAttr: VoiceAttr): Promise<TTSHttpAudioResult | null> {
        const trimmed = text.trim()
        if (!trimmed) {
            return { audio: Buffer.alloc(0), format: AudioFormatEnum.WAV, sampleRate: env.QWEN_TTS_SAMPLE_RATE, chunks: 0 }
        }
        this.assertApiKey()

        const response = await axios.post(this.url, this.buildBody(trimmed, voiceAttr), {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000,
            validateStatus: () => true
        })

        if (response.status >= 400) {
            throw new Error(`Qwen HTTP ${response.status}: ${stringifyBody(response.data) || response.statusText}`)
        }

        const payload = response.data as QwenSsePayload
        assertPayloadOk(payload)
        const audio = await extractAudio(payload, { downloadUrl: true })
        if (!audio) {
            throw new Error('Qwen HTTP 响应中没有音频数据')
        }

        const meta = audioMetaOf(payload, AudioFormatEnum.WAV)
        return {
            audio,
            format: meta.format,
            sampleRate: meta.sampleRate,
            chunks: 1
        }
    }

    /**
     * HTTP+SSE 流式合成
     */
    public static async synthesizeHttpSse(
        text: string,
        voiceAttr: VoiceAttr,
        handlers: TTSHttpSseHandlers
    ): Promise<TTSHttpSseResult | null> {
        const trimmed = text.trim()
        let format = AudioFormatEnum.PCM
        let sampleRate = env.QWEN_TTS_SAMPLE_RATE
        if (!trimmed) {
            if (handlers.onStart) await handlers.onStart({ format, sampleRate })
            return { format, sampleRate, size: 0, chunks: 0 }
        }
        this.assertApiKey()

        const response = await axios.post(this.url, this.buildBody(trimmed, voiceAttr), {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'X-DashScope-SSE': 'enable'
            },
            responseType: 'stream',
            timeout: 120000,
            validateStatus: () => true
        })

        if (response.status >= 400) {
            const textBody = await streamToText(response.data)
            throw new Error(`Qwen HTTP ${response.status}: ${textBody || response.statusText}`)
        }

        let started = false
        let chunks = 0
        let size = 0
        let lastPayload: QwenSsePayload | undefined
        let done = false

        const rl = readline.createInterface({ input: response.data, crlfDelay: Infinity })
        for await (const line of rl) {
            const raw = String(line).trim()
            if (!raw) continue
            if (raw.startsWith(':')) continue
            if (raw === '[DONE]' || raw === 'data: [DONE]') {
                done = true
                break
            }
            if (!raw.startsWith('data:')) continue

            const data = raw.slice(5).trim()
            if (!data) continue
            try {
                const parsed = JSON.parse(data) as QwenSsePayload
                lastPayload = parsed
                assertPayloadOk(parsed)
                const meta = audioMetaOf(parsed, AudioFormatEnum.PCM)
                format = meta.format
                sampleRate = meta.sampleRate
                if (!started) {
                    started = true
                    if (handlers.onStart) await handlers.onStart({ format, sampleRate })
                }
                const audio = await extractAudio(parsed, { downloadUrl: false })
                if (audio) {
                    const index = chunks++
                    size += audio.length
                    await handlers.onChunk(audio, index)
                }
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('Qwen')) throw error
                log.warn('解析 Qwen SSE 响应失败，忽略该行', { line: data, errorMsg: error })
            }
        }

        if (!started && handlers.onStart) await handlers.onStart({ format, sampleRate })

        if (!done && lastPayload) {
            assertPayloadOk(lastPayload)
        }

        return { format, sampleRate, size, chunks }
    }

    /** 兼容 TTSFactory：走 HTTP 一次性合成 */
    public static async synthesizeSpeech(text: string, voiceAttr: VoiceAttr): Promise<QwenHttpResult> {
        const result = await this.synthesizeHttp(text, voiceAttr)
        return {
            audio: result?.audio.toString('base64') || '',
            format: (result?.format as AudioFormatEnum) || AudioFormatEnum.WAV,
            chunks: result?.chunks || 0
        }
    }

    private static assertApiKey(): void {
        if (!this.apiKey) {
            throw new Error('缺少 QWEN_API_KEY，请先配置阿里云百炼 API Key')
        }
    }

    private static buildBody(text: string, voiceAttr: VoiceAttr) {
        return {
            model: this.model,
            input: {
                text,
                voice: voiceAttr.speaker || this.defaultSpeaker,
                language_type: mapLanguageType(voiceAttr.language)
            }
        }
    }
}

function assertPayloadOk(payload: QwenSsePayload): void {
    if (payload.code && payload.code !== 0 && payload.code !== 20000000) {
        throw new Error(payload.message || `Qwen request failed with code ${payload.code}`)
    }
}

function audioMetaOf(
    payload: QwenSsePayload,
    fallback: AudioFormatEnum
): { format: AudioFormatEnum; sampleRate: number } {
    const audio = payload.output?.audio
    const formatRaw = audio && typeof audio === 'object' ? String(audio.format || '').toLowerCase() : ''
    const format =
        formatRaw === AudioFormatEnum.PCM ||
        formatRaw === AudioFormatEnum.WAV ||
        formatRaw === AudioFormatEnum.MP3
            ? (formatRaw as AudioFormatEnum)
            : fallback
    const sampleRate =
        audio && typeof audio === 'object' && typeof audio.sample_rate === 'number' && audio.sample_rate > 0
            ? audio.sample_rate
            : env.QWEN_TTS_SAMPLE_RATE
    return { format, sampleRate }
}

async function extractAudio(
    payload: QwenSsePayload,
    options: { downloadUrl: boolean }
): Promise<Buffer | undefined> {
    const audio = payload.output?.audio
    if (typeof audio === 'string' && audio) {
        return Buffer.from(audio, 'base64')
    }
    if (audio && typeof audio === 'object') {
        if (typeof audio.data === 'string' && audio.data) {
            return Buffer.from(audio.data, 'base64')
        }
        const url = audio.url || payload.output?.audio_url
        if (options.downloadUrl && typeof url === 'string' && url) {
            const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 60000 })
            return Buffer.from(res.data)
        }
    }
    return undefined
}

function stringifyBody(data: unknown): string {
    if (typeof data === 'string') return data
    try {
        return JSON.stringify(data)
    } catch {
        return ''
    }
}

async function streamToText(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ''
        stream.setEncoding('utf8')
        stream.on('data', chunk => (body += chunk))
        stream.on('end', () => resolve(body))
        stream.on('error', reject)
    })
}

function mapLanguageType(language?: string): string {
    const value = (language || '').trim().toLowerCase()
    if (!value) return 'Chinese'
    if (value.includes('en')) return 'English'
    if (value.includes('zh') || value.includes('ch') || value.includes('中文') || value.includes('汉')) return 'Chinese'
    return language || 'Chinese'
}
