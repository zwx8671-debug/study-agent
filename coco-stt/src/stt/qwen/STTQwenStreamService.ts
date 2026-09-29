/** @format */

import WebSocket, { type Data } from 'ws'
import { randomUUID } from 'crypto'
import { AudioFormatEnum, STTStreamOptions } from '@interface/ISTT'
import { STTWsConnectOptions, STTWsStreamService } from '../STTWsStreamService'
import { getLogger } from '@utils/Logger'
import {
    QWEN_ASR_API_KEY,
    QWEN_ASR_ENABLE_SERVER_VAD,
    QWEN_ASR_LANGUAGE,
    QWEN_ASR_STREAM_MODEL,
    QWEN_ASR_SAMPLE_RATE,
    QWEN_ASR_TIMEOUT,
    QWEN_ASR_VAD_SILENCE_DURATION_MS,
    QWEN_ASR_VAD_THRESHOLD,
    QWEN_ASR_WS_URL,
    validateQwenAsrConfig
} from './config-qwen'

interface QwenRealtimeEvent {
    type?: string
    event_id?: string
    transcript?: string
    delta?: string
    text?: string
    stash?: string
    error?: {
        message?: string
        code?: string
        type?: string
    }
    [key: string]: unknown
}

/**
 * 阿里云百炼 Qwen3-ASR-Flash-Realtime 流式识别。
 * 生命周期由 STTWsStreamService 与 Socket.IO 对齐，这里只处理 Realtime 协议。
 */
export class STTQwenStreamService extends STTWsStreamService {
    private log = getLogger(STTQwenStreamService.name)

    constructor(uid: string, options?: STTStreamOptions) {
        super(uid, options)
    }
    private finishSent = false
    private transcriptCompletedWaiters: Array<() => void> = []
    private utteranceOpen = false
    private bytesSinceLastCompleted = 0
    private confirmedText = ''
    private currentPreview = ''

    protected getConnectOptions(): STTWsConnectOptions {
        validateQwenAsrConfig()
        const separator = QWEN_ASR_WS_URL.includes('?') ? '&' : '?'
        return {
            url: `${QWEN_ASR_WS_URL}${separator}model=${encodeURIComponent(QWEN_ASR_STREAM_MODEL)}`,
            headers: {
                Authorization: `Bearer ${QWEN_ASR_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
            },
            timeoutMs: QWEN_ASR_TIMEOUT
        }
    }

    protected getReadyTimeoutMs(): number {
        return QWEN_ASR_TIMEOUT
    }

    protected getCloseTimeoutMs(): number {
        return QWEN_ASR_TIMEOUT
    }

    protected async waitReady(ws: WebSocket, format: AudioFormatEnum): Promise<void> {
        if (format !== AudioFormatEnum.PCM) {
            this.log.warn(`Qwen realtime ASR requires PCM input, received ${format}; sending as pcm`)
        }
        this.sendSessionUpdate(ws)
        await this.waitForReady('Qwen ASR start timeout: session.updated not received')
    }

    protected sendAudio(ws: WebSocket, audio: Buffer): void {
        ws.send(JSON.stringify({
            event_id: `event_${randomUUID()}`,
            type: 'input_audio_buffer.append',
            audio: audio.toString('base64')
        }))
        this.bytesSinceLastCompleted += audio.length
    }

    protected async finalize(ws: WebSocket): Promise<void> {
        if (ws.readyState !== WebSocket.OPEN) return

        if (!this.isVadEnabled()) {
            ws.send(JSON.stringify({
                event_id: `event_${randomUUID()}`,
                type: 'input_audio_buffer.commit'
            }))
            return
        }

        const pending = this.utteranceOpen || this.bytesSinceLastCompleted > 0
        if (!pending) return

        const silenceBytes = Math.max(1, Math.ceil((QWEN_ASR_SAMPLE_RATE * 2 * QWEN_ASR_VAD_SILENCE_DURATION_MS) / 1000))
        ws.send(JSON.stringify({
            event_id: `event_${randomUUID()}`,
            type: 'input_audio_buffer.append',
            audio: Buffer.alloc(silenceBytes).toString('base64')
        }))
        this.bytesSinceLastCompleted += silenceBytes
        this.log.info(`VAD finalize: appended ${silenceBytes}B silence, waiting for last completed`)

        await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
                cleanup()
                this.log.warn('VAD finalize timeout: last transcript.completed not received')
                resolve()
            }, QWEN_ASR_VAD_SILENCE_DURATION_MS + 1500)

            const onCompleted = () => {
                cleanup()
                resolve()
            }
            const cleanup = () => {
                clearTimeout(timeout)
                const index = this.transcriptCompletedWaiters.indexOf(onCompleted)
                if (index >= 0) this.transcriptCompletedWaiters.splice(index, 1)
            }

            this.transcriptCompletedWaiters.push(onCompleted)
        })
    }

    protected finishSession(ws: WebSocket): void {
        if (this.finishSent || ws.readyState !== WebSocket.OPEN) return
        this.finishSent = true
        ws.send(JSON.stringify({
            event_id: `event_${randomUUID()}`,
            type: 'session.finish'
        }))
    }

    protected handleUpstreamMessage(message: Data): void {
        const raw = Buffer.isBuffer(message) ? message.toString('utf8') : message.toString()
        const data = JSON.parse(raw) as QwenRealtimeEvent
        this.log.debug(`Qwen ASR event: ${raw}`)

        if (data.type === 'session.updated') {
            this.notifyReady()
        }

        if (data.type === 'input_audio_buffer.speech_started') {
            this.utteranceOpen = true
            this.log.info('Qwen ASR speech_started')
        }

        if (data.type === 'input_audio_buffer.speech_stopped') {
            this.log.info('Qwen ASR speech_stopped')
        }

        if (data.type === 'conversation.item.input_audio_transcription.delta'
            || data.type === 'conversation.item.input_audio_transcription.text') {
            this.applyDelta(data)
            return
        }

        if (data.type === 'conversation.item.input_audio_transcription.completed') {
            this.applyCompleted(data)
            return
        }

        if (data.type === 'error' || data.error) {
            const messageText = data.error?.message || raw
            throw new Error(`Qwen ASR error: ${messageText}`)
        }

        const transcript = this.extractTranscript(data)
        if (transcript) {
            this.log.info(`Qwen ASR transcript (${data.type}): ${transcript}`)
            this.emitTranscript(transcript)
        } else if (data.type && data.type !== 'session.created') {
            this.log.info(`Qwen ASR event: ${data.type}`)
        }

        if (data.type === 'session.finished') {
            this.markClosed()
        }
    }

    private isVadEnabled(): boolean {
        if (this.options?.enableVad !== undefined) return this.options.enableVad
        return QWEN_ASR_ENABLE_SERVER_VAD
    }

    private resolveLanguage(): string {
        const lang = this.options?.language || QWEN_ASR_LANGUAGE
        if (!lang || lang.toLowerCase() === 'auto') return ''
        const lower = lang.replace('_', '-').toLowerCase()
        if (lower.startsWith('zh')) return 'zh'
        if (lower.startsWith('en')) return 'en'
        if (lower.startsWith('ja')) return 'ja'
        return lower.split('-')[0]
    }

    private sendSessionUpdate(ws: WebSocket): void {
        const session: Record<string, unknown> = {
            modalities: ['text'],
            input_audio_format: 'pcm',
            sample_rate: QWEN_ASR_SAMPLE_RATE,
            turn_detection: this.isVadEnabled()
                ? {
                      type: 'server_vad',
                      threshold: QWEN_ASR_VAD_THRESHOLD,
                      silence_duration_ms: QWEN_ASR_VAD_SILENCE_DURATION_MS
                  }
                : null
        }

        const language = this.resolveLanguage()
        if (language) {
            session.input_audio_transcription = { language }
        }

        ws.send(JSON.stringify({
            event_id: `event_${randomUUID()}`,
            type: 'session.update',
            session
        }))
    }

    private applyDelta(data: QwenRealtimeEvent): void {
        const text = typeof data.text === 'string' ? data.text : ''
        const stash = typeof data.stash === 'string' ? data.stash : (typeof data.delta === 'string' ? data.delta : '')
        this.currentPreview = `${text}${stash}`
        const full = this.fullTranscript()
        this.log.info(`Qwen ASR delta: ${full}`)
        this.emitTranscript(full)
    }

    private applyCompleted(data: QwenRealtimeEvent): void {
        const sentence = (typeof data.transcript === 'string' && data.transcript)
            || this.currentPreview
        this.confirmedText = this.joinText(this.confirmedText, sentence)
        this.currentPreview = ''
        this.utteranceOpen = false
        this.bytesSinceLastCompleted = 0
        const pending = this.transcriptCompletedWaiters.splice(0)
        pending.forEach(resolve => resolve())
        const full = this.fullTranscript()
        this.log.info(`Qwen ASR completed: ${full}`)
        this.emitTranscript(full)
    }

    private fullTranscript(): string {
        return this.joinText(this.confirmedText, this.currentPreview)
    }

    private joinText(left: string, right: string): string {
        const a = left.trim()
        const b = right.trim()
        if (!a) return b
        if (!b) return a
        return `${a}${b}`
    }

    private emitTranscript(text: string): void {
        if (!text) return
        this.emit('data', text)
    }

    private extractTranscript(data: QwenRealtimeEvent): string {
        if (typeof data.transcript === 'string') return data.transcript
        if (typeof data.delta === 'string') return data.delta

        const candidates = [data.item, data.response, data.output, data.result]
        for (const candidate of candidates) {
            const text = this.findStringByKey(candidate, ['transcript', 'text'])
            if (text) return text
        }
        return ''
    }

    private findStringByKey(value: unknown, keys: string[]): string {
        if (!value || typeof value !== 'object') return ''
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = this.findStringByKey(item, keys)
                if (found) return found
            }
            return ''
        }

        const record = value as Record<string, unknown>
        for (const key of keys) {
            if (typeof record[key] === 'string') return record[key] as string
        }
        for (const child of Object.values(record)) {
            const found = this.findStringByKey(child, keys)
            if (found) return found
        }
        return ''
    }
}
