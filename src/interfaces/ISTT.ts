/** @format */

/**
 * 音频格式枚举
 */
export enum AudioFormatEnum {
    PCM = 'pcm',
    WAV = 'wav',
    MP3 = 'mp3',
    OPUS = 'opus'
}

/**
 * STT请求接口
 */
export interface STTRequest {
    deviceSN: string
    sessionId: string
    format: AudioFormatEnum
    audio?: Buffer | Buffer[]
    end?: boolean
    traceId?: string
}

/**
 * STT响应接口
 */
export interface STTResponse {
    success: boolean
    sessionId: string
    text?: string
    error?: string
    traceId?: string
}

/**
 * STT事件接口
 */
export interface STTEventData {
    sessionId: string
    text: string
    isFinal: boolean
    traceId?: string
}
