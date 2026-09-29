/** @format */

/**
 * 合成请求体（POST /tts/synthesize、POST /tts/synthesize/stream 共用）
 */
export interface SynthesizeBody {
    /** 待合成文本；传数组时拼接为完整文本后走 HTTP / HTTP+SSE */
    text?: string | string[]
    /** 音色，缺省用当前 provider 的默认音色 */
    speaker?: string
    /** 情感 */
    emotion?: string
    /** 语言 */
    language?: string
    /** 音量倍率 */
    loudness_rate?: string
    /** 语速倍率 */
    speech_rate?: string
    /** 会话ID，缺省自动生成 */
    sessionId?: string
    /** 设备序列号（上游 uid） */
    deviceSN?: string
    /** 链路追踪ID */
    traceId?: string
    /** 指定提供商：volcengine / azure / qwen / mock，缺省用环境变量 */
    provider?: string
}

/**
 * 合成查询参数
 */
export interface SynthesizeQuerystring {
    /** 返回音频格式：pcm（默认，原始 PCM）或 wav（补 WAV 头，可直接播放） */
    format?: 'pcm' | 'wav'
}

/**
 * POST /tts/synthesize 响应数据
 */
export interface SynthesizeData {
    /** base64 编码的音频 */
    audio: string
    /** 音频格式：pcm | wav */
    format: string
    /** 采样率 */
    sampleRate: number
    /** 音频字节数 */
    size: number
    /** 上游返回的音频块数量 */
    chunks: number
    /** 合成耗时（毫秒） */
    duration: number
    /** 会话ID */
    sessionId: string
    /** 链路追踪ID */
    traceId: string
}

/**
 * GET /tts/status 响应数据
 */
export interface StatusData {
    ttsServiceType: string
    format: string
    sampleRate: number
    defaultSpeaker: string
    available: boolean
}

/**
 * 单条音色
 */
export interface VoiceItem {
    name: string
    speaker: string
    language: string
    emotions: string[]
    /** 分组，如 Qwen 的 realtime / http */
    group?: string
}

/**
 * 单个提供商的音色目录
 */
export interface ProviderCatalog {
    id: string
    name: string
    format: string
    sampleRate: number
    defaultSpeaker: string
    configured: boolean
    voices: VoiceItem[]
}

/**
 * GET /tts/voices 响应数据
 */
export interface VoicesData {
    current: string
    providers: ProviderCatalog[]
}
