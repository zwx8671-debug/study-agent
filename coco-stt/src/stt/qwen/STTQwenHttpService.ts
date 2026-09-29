/** @format */

import { STTHttpBaseService } from '../STTHttpBaseService'
import { getLogger } from '@utils/Logger'
import {
    QWEN_ASR_API_KEY,
    QWEN_ASR_COMPATIBLE_BASE_URL,
    QWEN_ASR_ENABLE_ITN,
    QWEN_ASR_LANGUAGE,
    QWEN_ASR_HTTP_MODEL,
    QWEN_ASR_TIMEOUT,
    validateQwenAsrConfig
} from './config-qwen'

const log = getLogger('STTQwenHttpService')

interface OpenAIChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
}

export class STTQwenHttpService extends STTHttpBaseService {
    private ensureConfig(): void {
        validateQwenAsrConfig()
        if (!QWEN_ASR_API_KEY) {
            throw new Error('QWEN_ASR_API_KEY is required')
        }
    }

    private buildAudioDataUrl(audio: Buffer): string {
        return `data:audio/wav;base64,${audio.toString('base64')}`
    }

    public async recognize(audio: Buffer, language: string = 'zh-CN'): Promise<string> {
        this.ensureConfig()

        const normalizedLanguage = QWEN_ASR_LANGUAGE || language.replace('_', '-').toLowerCase()
        const body = {
            model: QWEN_ASR_HTTP_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: this.buildAudioDataUrl(audio)
                            }
                        }
                    ]
                }
            ],
            stream: false,
            asr_options: {
                language: normalizedLanguage.startsWith('zh') ? 'zh' : normalizedLanguage,
                enable_itn: QWEN_ASR_ENABLE_ITN
            }
        }

        const url = `${QWEN_ASR_COMPATIBLE_BASE_URL}/chat/completions`
        log.info(`开始识别: model=${QWEN_ASR_HTTP_MODEL}, language=${normalizedLanguage}, audioSize=${audio.length} bytes`)

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(new Error(`Qwen ASR HTTP timeout after ${QWEN_ASR_TIMEOUT}ms`)), QWEN_ASR_TIMEOUT)

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${QWEN_ASR_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            })

            const text = await response.text()
            if (!response.ok) {
                throw new Error(`Qwen ASR HTTP ${response.status}: ${text}`)
            }

            const payload = JSON.parse(text) as OpenAIChatCompletionResponse
            const content = payload.choices?.[0]?.message?.content || ''
            log.info(`识别成功: text="${content}"`)
            return content
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`Qwen ASR 识别失败: ${message}`)
            throw error instanceof Error ? error : new Error(message)
        } finally {
            clearTimeout(timeout)
        }
    }
}
