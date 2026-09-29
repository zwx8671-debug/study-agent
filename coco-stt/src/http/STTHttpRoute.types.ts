/** @format */

import type { VolcFileRecognizeResult } from '@stt/volcengine/STTVolcengineBigmodelAucHttpService'

/** POST /stt/recognize 的查询参数 */
export interface RecognizeQuerystring {
    /** 识别语言代码，默认 zh-CN，支持 en-US、ja-JP 等 Azure 语言标识 */
    language?: string
    /** 调用方自定义追踪 ID，不传时服务端自动生成 UUID */
    traceId?: string
    /** 指定提供商：volcengine / azure / qwen / mock，缺省用环境变量 */
    provider?: string
}

/** GET /stt/providers 中单个可调参数 */
export interface ProviderParamOption {
    value: string
    label: string
}

export interface ProviderParamField {
    key: string
    label: string
    type: 'select' | 'boolean'
    options?: ProviderParamOption[]
    defaultValue?: string | boolean
}

/** GET /stt/providers 中的单个提供商 */
export interface ProviderCatalog {
    id: string
    name: string
    format: string
    sampleRate: number
    configured: boolean
    stream: boolean
    http: boolean
    file: boolean
    params: ProviderParamField[]
}

/** GET /stt/providers 响应 data */
export interface ProvidersData {
    current: string
    format: string
    sampleRate: number
    socketioPort: number
    pathPrefix: string
    providers: ProviderCatalog[]
}

/** POST /stt/recognize 返回 data */
export interface RecognizeData {
    text: string
    traceId: string
}

// ==================== 录音文件同步识别（火山引擎极速版）====================

/** POST /stt/file/recognize 请求体 */
export interface FileRecognizeBody {
    /** 音频文件 URL（与 audioData 二选一） */
    url?: string
    /** 音频 base64 数据（与 url 二选一） */
    audioData?: string
    /** 音频格式，默认 wav */
    audioFormat?: string
    /** 识别语言，默认 zh-CN */
    language?: string
    /** 调用方自定义追踪 ID */
    traceId?: string
}

/** POST /stt/file/recognize 返回 data */
export interface FileRecognizeData {
    /** 请求 ID（即 X-Api-Request-Id） */
    taskId: string
    /** 识别全文 */
    text?: string
    /** 逐句识别结果 */
    utterances?: VolcFileRecognizeResult['utterances']
    traceId: string
}
