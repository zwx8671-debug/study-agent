/** @format */

import { randomUUID } from 'crypto'
import { STTHttpBaseService } from '../STTHttpBaseService'
import { getLogger } from '@utils/Logger'
import {
    VOICE_STT_ACCESS_TOKEN,
    VOICE_STT_API_KEY,
    VOICE_STT_FILE_RESOURCE_ID,
    VOICE_STT_FILE_USER_UID,
    VOICE_FILE_BIGMODEL_FLASH_URL,
    VOICE_FILE_RECOGNIZE_TIMEOUT_MS
} from './config-volcengine'

const log = getLogger('STTVolcengineBigmodelAucHttpService')

// ==================== 文档约定（v3 AUC bigmodel 极速版）====================
// https://docs.volcengine.com/docs/6561/2608628?lang=zh
/** flash 成功 */
const HEADER_OK = '20000000'
/** 静音音频，视为成功但无文本 */
const HEADER_SILENT = '20000003'

// ==================== 请求 / 响应类型 ====================

/** 同步识别请求体：/api/v3/auc/bigmodel/recognize/flash */
export interface VolcBigmodelFlashBody {
    user: { uid: string }
    audio: {
        url?: string
        data?: string
        format: string
        codec: string
        rate: number
        bits: number
        channel: number
    }
    request: {
        model_name: string
        enable_itn: boolean
        enable_punc: boolean
        enable_ddc: boolean
        enable_speaker_info: boolean
        enable_channel_split: boolean
        show_utterances: boolean
        vad_segment: boolean
        sensitive_words_filter: string
    }
}

export interface VolcUtterance {
    text: string
    start_time: number
    end_time: number
    definite: boolean
    words?: Array<{
        text: string
        start_time: number
        end_time: number
    }>
}

/** 同步识别结果（供路由使用） */
export interface VolcFileRecognizeResult {
    /** 请求头 X-Api-Request-Id */
    id: string
    text?: string
    utterances?: VolcUtterance[]
    /** 响应头 X-Api-Status-Code */
    apiStatusCode?: string
    /** 响应头 X-Tt-Logid */
    logId?: string
}

/** flash 接口 JSON body */
interface VolcBigmodelFlashJsonBody {
    audio_info?: { duration?: number }
    result?:
        | {
              text?: string
              utterances?: VolcUtterance[]
              additions?: unknown
              words?: unknown[]
          }
        | VolcUtterance[]
}

/**
 * 火山引擎录音文件识别 — v3 AUC 大模型极速版 HTTP（同步）
 * 文档：https://docs.volcengine.com/docs/6561/2608628?lang=zh
 */
export class STTVolcengineBigmodelAucHttpService extends STTHttpBaseService {
    private getApiKey(): string {
        return VOICE_STT_API_KEY || VOICE_STT_ACCESS_TOKEN
    }

    private ensureConfig(): void {
        const key = this.getApiKey()
        if (!key) {
            throw new Error(
                '火山引擎 v3 文件识别配置缺失：请设置 VOICE_STT_API_KEY 或 VOICE_STT_ACCESS_TOKEN（.env）'
            )
        }
    }

    private static header(response: Response, name: string): string {
        return response.headers.get(name) ?? response.headers.get(name.toLowerCase()) ?? ''
    }

    private flashHeaders(requestId: string): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.getApiKey(),
            'X-Api-Resource-Id': VOICE_STT_FILE_RESOURCE_ID,
            'X-Api-Request-Id': requestId,
            'X-Api-Sequence': '-1'
        }
    }

    /**
     * 同步识别录音文件，一次请求即返回结果
     */
    public async recognizeFile(params: {
        url?: string
        audioData?: string
        audioFormat?: string
        language?: string
    }): Promise<VolcFileRecognizeResult> {
        const { url, audioData, audioFormat = 'wav', language = 'zh-CN' } = params

        if (!url && !audioData) {
            throw new Error('recognizeFile 需要提供 url 或 audioData 其中一个')
        }

        this.ensureConfig()

        const requestId = randomUUID()

        const body: VolcBigmodelFlashBody = {
            user: { uid: VOICE_STT_FILE_USER_UID },
            audio: {
                format: audioFormat,
                codec: 'raw',
                rate: 16000,
                bits: 16,
                channel: 1
            },
            request: {
                model_name: 'bigmodel',
                enable_itn: true,
                enable_punc: false,
                enable_ddc: false,
                enable_speaker_info: false,
                enable_channel_split: false,
                show_utterances: true,
                vad_segment: false,
                sensitive_words_filter: ''
            }
        }

        if (url) body.audio.url = url
        else body.audio.data = audioData

        log.info(
            `同步识别 v3 bigmodel flash: format=${audioFormat}, language=${language}, hasUrl=${!!url}, requestId=${requestId}`
        )

        const response = await fetch(VOICE_FILE_BIGMODEL_FLASH_URL, {
            method: 'POST',
            headers: this.flashHeaders(requestId),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(VOICE_FILE_RECOGNIZE_TIMEOUT_MS)
        })

        const apiStatusCode = STTVolcengineBigmodelAucHttpService.header(response, 'X-Api-Status-Code')
        const apiMessage = STTVolcengineBigmodelAucHttpService.header(response, 'X-Api-Message')
        const logId = STTVolcengineBigmodelAucHttpService.header(response, 'X-Tt-Logid')

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(
                `同步识别失败: HTTP ${response.status}, X-Api-Status-Code=${apiStatusCode}, X-Api-Message=${apiMessage}, body=${errText}`
            )
        }

        const rawText = await response.text()
        let payload: VolcBigmodelFlashJsonBody | undefined
        if (rawText.trim()) {
            try {
                payload = JSON.parse(rawText) as VolcBigmodelFlashJsonBody
            } catch {
                log.warn(`flash 响应体 JSON 解析失败: ${rawText.slice(0, 300)}`)
            }
        }

        if (apiStatusCode !== HEADER_OK && apiStatusCode !== HEADER_SILENT) {
            throw new Error(
                `同步识别失败: X-Api-Status-Code=${apiStatusCode}, X-Api-Message=${apiMessage || '(empty)'}, logId=${logId || '(none)'}`
            )
        }

        const { text: resultText, utterances } = this.extractResult(payload)

        log.info(
            `同步识别完成: requestId=${requestId}, X-Api-Status-Code=${apiStatusCode}, logId=${logId || '(none)'}, text="${resultText?.substring(0, 100) || ''}"`
        )

        return {
            id: requestId,
            text: resultText,
            utterances,
            apiStatusCode,
            logId
        }
    }

    private extractResult(payload: VolcBigmodelFlashJsonBody | undefined): {
        text?: string
        utterances?: VolcUtterance[]
    } {
        if (!payload?.result) {
            return {}
        }
        const r = payload.result
        if (Array.isArray(r)) {
            const texts = r.map(u => u.text).filter(Boolean)
            return {
                text: texts.join(''),
                utterances: r
            }
        }
        return {
            text: r.text,
            utterances: r.utterances
        }
    }

    public async recognize(audio: Buffer, language: string = 'zh-CN'): Promise<string> {
        log.info(`recognize: v3 bigmodel flash, audioSize=${audio.length} bytes, language=${language}`)
        const result = await this.recognizeFile({
            audioData: audio.toString('base64'),
            audioFormat: 'wav',
            language
        })
        return result.text || ''
    }
}
