/** @format */

/**
 * 各提供商 HTTP / HTTP+SSE 合成的共用类型。
 * 不支持的通道由实现返回 null（为空），调用方不得回退到 WebSocket 流式事件。
 */

export interface TTSHttpAudioResult {
    audio: Buffer
    format: string
    sampleRate: number
    chunks: number
}

export interface TTSHttpSseMeta {
    format: string
    sampleRate: number
}

export interface TTSHttpSseHandlers {
    onStart?: (meta: TTSHttpSseMeta) => void | Promise<void>
    onChunk: (chunk: Buffer, index: number) => void | Promise<void>
}

export interface TTSHttpSseResult {
    format: string
    sampleRate: number
    size: number
    chunks: number
}
