/** @format */

import { randomUUID } from 'crypto'
import { TTSFactory, TTSServiceType } from './TTSFactory'
import { TTSQwenHttpService } from './qwen/TTSQwenHttpService'
import { TTSVolcEngineService } from './volcengine/TTSVolcEngineService'
import { TTSAzureService, VoiceAttr } from './azure/TTSAzureService'
import { MockTTSService } from './mock/MockTTSService'
import { getLogger } from '@utils/Logger'
import { saveDebugWav } from '@utils/pcmToWav'
import { findProviderVoice } from '../http/TTSVoiceCatalog'
import type { TTSHttpAudioResult, TTSHttpSseHandlers, TTSHttpSseResult } from './TTSHttp.types'

const log = getLogger('TTSHttpService')

export class TTSHttpBadRequestError extends Error {
    public readonly status = 400
}

/**
 * 合成参数
 */
export interface SynthesizeParams {
    /** 待合成文本；传数组时拼接为完整文本后走 HTTP / HTTP+SSE */
    text: string | string[]
    /** 音色 */
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
    /** 上游 uid，缺省由 sessionId 派生 */
    deviceSN?: string
    /** 指定提供商，缺省用环境变量 TTS_SERVICE_TYPE */
    provider?: string
}

/**
 * 音频元信息，在上游连接建立后即可确定
 */
export interface AudioMeta {
    sessionId: string
    /** 音频格式，如 pcm */
    format: string
    /** 采样率，如 16000 */
    sampleRate: number
}

/**
 * 合成结果统计
 */
export interface SynthesizeMeta extends AudioMeta {
    /** 音频字节数 */
    size: number
    /** 音频块数量 */
    chunks: number
    /** 合成耗时（毫秒） */
    duration: number
}

export interface StreamHandlers {
    /** 上游就绪、开始产出音频前回调，可用于写 HTTP 响应头 */
    onStart?: (meta: AudioMeta) => void | Promise<void>
    /** 每产出一块音频回调一次，返回 Promise 可用于处理写入背压 */
    onChunk: (chunk: Buffer, index: number) => void | Promise<void>
}

/**
 * HTTP 一次性 / HTTP+SSE 流式合成服务
 *
 * 只调用各提供商的 HTTP、HTTP+SSE 实现，不走 WebSocket 流式事件。
 * 提供商没有对应通道时实现返回空，此处抛出明确错误。
 */
export class TTSHttpService {
    public static supportsHttp(type: TTSServiceType): boolean {
        return type === TTSServiceType.Volcengine || type === TTSServiceType.Azure || type === TTSServiceType.Qwen
    }

    public static supportsHttpSse(type: TTSServiceType): boolean {
        return type === TTSServiceType.Volcengine || type === TTSServiceType.Qwen
    }

    /**
     * HTTP+SSE 流式合成：音频产出即回调
     */
    public static async synthesizeStream(params: SynthesizeParams, handlers: StreamHandlers): Promise<SynthesizeMeta> {
        const sessionId = params.sessionId || randomUUID()
        const startTime = Date.now()
        const provider = TTSFactory.resolveType(params.provider)
        const text = joinText(params.text)
        const voiceAttr = toVoiceAttr(params, provider)
        assertHttpSpeaker(provider, voiceAttr.speaker)
        const fallback = TTSFactory.getAudioMetaFor(provider)

        let format = fallback.format
        let sampleRate = fallback.sampleRate
        let size = 0
        let chunks = 0

        const result = await dispatchHttpSse(provider, text, voiceAttr, {
            onStart: async meta => {
                format = meta.format
                sampleRate = meta.sampleRate
                if (handlers.onStart) await handlers.onStart({ sessionId, format, sampleRate })
            },
            onChunk: async (chunk, index) => {
                chunks += 1
                size += chunk.length
                await handlers.onChunk(chunk, index)
            }
        })

        if (!result) {
            throw new Error(`${provider} 不支持 HTTP+SSE 合成`)
        }

        return {
            sessionId,
            format: result.format || format,
            sampleRate: result.sampleRate || sampleRate,
            size: result.size || size,
            chunks: result.chunks || chunks,
            duration: Date.now() - startTime
        }
    }

    /**
     * HTTP 一次性合成：等全部音频产出后合并返回
     */
    public static async synthesize(params: SynthesizeParams): Promise<SynthesizeMeta & { audio: Buffer }> {
        const sessionId = params.sessionId || randomUUID()
        const startTime = Date.now()
        const provider = TTSFactory.resolveType(params.provider)
        const text = joinText(params.text)
        const voiceAttr = toVoiceAttr(params, provider)
        assertHttpSpeaker(provider, voiceAttr.speaker)

        const result = await dispatchHttp(provider, text, voiceAttr)
        if (!result) {
            throw new Error(`${provider} 不支持 HTTP 合成`)
        }

        if (result.format === 'pcm') {
            saveDebugWav(result.audio, `http-${sessionId}.wav`, result.sampleRate)
        }

        return {
            sessionId,
            audio: result.audio,
            format: result.format,
            sampleRate: result.sampleRate,
            size: result.audio.length,
            chunks: result.chunks,
            duration: Date.now() - startTime
        }
    }
}

function joinText(text: string | string[]): string {
    return (Array.isArray(text) ? text.join('') : text).trim()
}

function assertHttpSpeaker(provider: TTSServiceType, speaker?: string): void {
    if (provider !== TTSServiceType.Qwen || !speaker) return
    const voice = findProviderVoice(provider, speaker)
    if (voice?.group === 'realtime') {
        throw new TTSHttpBadRequestError(
            `Qwen 音色 ${speaker}（${voice.name}）仅支持 Socket.IO 实时合成，HTTP 请改用 Cherry / Serena 等 HTTP 音色`
        )
    }
}

function toVoiceAttr(params: SynthesizeParams, _provider: TTSServiceType): VoiceAttr {
    return {
        speaker: params.speaker || '',
        emotion: params.emotion || '',
        language: params.language || '',
        loudness_rate: params.loudness_rate || '',
        speech_rate: params.speech_rate || ''
    }
}

async function dispatchHttp(
    provider: TTSServiceType,
    text: string,
    voiceAttr: VoiceAttr
): Promise<TTSHttpAudioResult | null> {
    switch (provider) {
        case TTSServiceType.Volcengine:
            return TTSVolcEngineService.synthesizeHttp(text, voiceAttr)
        case TTSServiceType.Azure:
            return TTSAzureService.synthesizeHttp(text, voiceAttr)
        case TTSServiceType.Qwen:
            return TTSQwenHttpService.synthesizeHttp(text, voiceAttr)
        case TTSServiceType.Mock:
            return MockTTSService.synthesizeHttp(text, voiceAttr)
        default:
            log.warn(`未知提供商，HTTP 合成为空: ${provider}`)
            return null
    }
}

async function dispatchHttpSse(
    provider: TTSServiceType,
    text: string,
    voiceAttr: VoiceAttr,
    handlers: TTSHttpSseHandlers
): Promise<TTSHttpSseResult | null> {
    switch (provider) {
        case TTSServiceType.Volcengine:
            return TTSVolcEngineService.synthesizeHttpSse(text, voiceAttr, handlers)
        case TTSServiceType.Azure:
            return TTSAzureService.synthesizeHttpSse(text, voiceAttr, handlers)
        case TTSServiceType.Qwen:
            return TTSQwenHttpService.synthesizeHttpSse(text, voiceAttr, handlers)
        case TTSServiceType.Mock:
            return MockTTSService.synthesizeHttpSse(text, voiceAttr, handlers)
        default:
            log.warn(`未知提供商，HTTP+SSE 合成为空: ${provider}`)
            return null
    }
}
