/** @format */

import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import { getLogger } from '@utils/Logger'
import { TTSBaseService, TTSState, WS_TIMEOUT } from '../TTSBaseService'
import {
    QWEN_TTS_API_KEY,
    QWEN_TTS_DEFAULT_SPEAKER,
    QWEN_TTS_FORMAT,
    QWEN_TTS_MODEL,
    QWEN_TTS_PITCH,
    QWEN_TTS_RATE,
    QWEN_TTS_SAMPLE_RATE,
    QWEN_TTS_VOLUME,
    QWEN_TTS_WS_URL
} from './config-qwen'

interface QwenMessage {
    header?: {
        event?: string
        error_code?: string
        error_message?: string
        [key: string]: unknown
    }
    payload?: unknown
}

/**
 * 阿里云百炼 / Qwen 实时语音合成（中国区，北京）
 * 模型：qwen-audio-3.0-tts-flash
 */
export class TTSQwenStreamService extends TTSBaseService {
    private ws?: WebSocket
    private readonly log = getLogger(TTSQwenStreamService.name)
    private taskId = uuid()
    private activeSessionId = ''

    constructor(uid: string) {
        super(uid, 'qwen')
        this.log.infoMsg(`【Qwen】TTSQwenStreamService init: ${this.uid}`)
    }

    public override getAudioFormat(): string {
        return QWEN_TTS_FORMAT
    }

    public override getSampleRate(): number {
        return QWEN_TTS_SAMPLE_RATE
    }

    public async connect(resourceId?: string): Promise<void> {
        if (this.ws?.readyState === WebSocket.OPEN) return
        if (resourceId) this.resourceId = resourceId
        this.discardSocket()

        if (!QWEN_TTS_API_KEY) {
            throw new Error('缺少 QWEN_API_KEY，请在 .env 中配置阿里云百炼 API Key')
        }
        if (!QWEN_TTS_WS_URL) {
            throw new Error('缺少 QWEN_TTS_WS_URL，请配置中国区 WebSocket 地址')
        }

        this.ws = new WebSocket(QWEN_TTS_WS_URL, {
            headers: {
                Authorization: `bearer ${QWEN_TTS_API_KEY}`,
                'X-DashScope-DataInspection': 'enable'
            },
            handshakeTimeout: WS_TIMEOUT
        })

        this.ws.on('error', (error: Error) => {
            this.log.errorMsg(`Qwen WebSocket error for uid ${this.uid}:`, { errorMsg: error })
            if (this.isTearingDown()) return
            this.emit('error', error)
        })

        this.setState(TTSState.Connecting)
        this.emit('connecting')

        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                if (timeout) clearTimeout(timeout)
                this.ws?.off('open', onOpen)
                this.ws?.off('error', onError)
                this.ws?.off('close', onClose)
                this.ws?.off('unexpected-response', onUnexpected)
            }
            const onOpen = () => {
                cleanup()
                resolve()
            }
            const onError = (error: Error) => {
                cleanup()
                reject(new Error(`Qwen WebSocket connection failed: ${error.message}`))
            }
            const onClose = (code: number, reason: Buffer) => {
                cleanup()
                reject(new Error(`Qwen WebSocket closed during handshake: ${code} ${reason.toString()}`))
            }
            const onUnexpected = (_: WebSocket, res: import('http').IncomingMessage) => {
                cleanup()
                let body = ''
                res.setEncoding('utf8')
                res.on('data', chunk => (body += chunk))
                res.on('end', () => reject(new Error(`Qwen HTTP ${res.statusCode}: ${body || res.statusMessage}`)))
                res.on('error', reject)
            }
            const timeout = setTimeout(() => {
                cleanup()
                if (this.ws && this.ws.readyState < WebSocket.CLOSING) this.ws.terminate()
                reject(new Error(`Qwen WebSocket connection timeout after ${WS_TIMEOUT}ms`))
            }, WS_TIMEOUT)

            this.ws?.once('open', onOpen)
            this.ws?.once('error', onError)
            this.ws?.once('close', onClose)
            this.ws?.once('unexpected-response', onUnexpected)
        })

        this.setState(TTSState.Connected)
        this.ws.on('close', (code: number, reason: Buffer) => {
            this.onSocketClose(code, reason.toString())
        })
        this.emit('connected', this.uid, this.resourceId)
    }

    public async start(
        sessionId: string,
        speaker: string = QWEN_TTS_DEFAULT_SPEAKER,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        emotion?: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        language?: string,
        loudness_rate?: string,
        speech_rate?: string
    ): Promise<string> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log.warnMsg('Qwen 上游 WebSocket 未就绪，先重连再开会话')
            await this.connect()
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Qwen 上游 WebSocket 重连失败')
        }
        if (this.getState() === TTSState.Started) return sessionId

        this.taskId = sessionId || uuid()
        this.activeSessionId = sessionId

        const runTaskMessage = {
            header: {
                action: 'run-task',
                task_id: this.taskId,
                streaming: 'duplex'
            },
            payload: {
                task_group: 'audio',
                task: 'tts',
                function: 'SpeechSynthesizer',
                model: QWEN_TTS_MODEL,
                parameters: {
                    text_type: 'PlainText',
                    voice: speaker,
                    format: QWEN_TTS_FORMAT,
                    sample_rate: QWEN_TTS_SAMPLE_RATE,
                    volume: toNumber(loudness_rate, QWEN_TTS_VOLUME),
                    rate: toNumber(speech_rate, QWEN_TTS_RATE),
                    pitch: QWEN_TTS_PITCH,
                    enable_ssml: false
                },
                input: {}
            }
        }

        this.ws.send(JSON.stringify(runTaskMessage))

        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                if (timeout) clearTimeout(timeout)
                this.ws?.off('message', onMessage)
                this.off('error', onError)
            }
            const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
                if (isBinary) return
                const message = parseQwenMessage(data)
                if (message.header?.event === 'task-started') {
                    cleanup()
                    resolve()
                } else if (message.header?.event === 'task-failed') {
                    cleanup()
                    reject(new Error(message.header.error_message || message.header.error_code || 'Qwen task failed'))
                }
            }
            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error(`Timeout waiting for Qwen task-started after ${WS_TIMEOUT}ms`))
            }, WS_TIMEOUT)

            this.ws?.on('message', onMessage)
            this.once('error', onError)
        })

        this.setState(TTSState.Started)
        this.emit('started', sessionId, speaker)
        this.loop(sessionId)
        return sessionId
    }

    public async push(sessionId: string, text: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit('error', new Error('Qwen 上游 WebSocket 已断开'))
            return
        }
        if (this.getState() !== TTSState.Started) {
            this.emit('error', new Error(`Qwen TTS session[${sessionId}] not started`))
            return
        }
        if (!text) return

        this.ws.send(
            JSON.stringify({
                header: {
                    action: 'continue-task',
                    task_id: this.taskId,
                    streaming: 'duplex'
                },
                payload: {
                    input: { text }
                }
            })
        )
    }

    public async close(sessionId: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (this.getState() === TTSState.Started || this.getState() === TTSState.Closing) {
                this.setState(TTSState.Closed)
                this.emit('closed', sessionId)
            }
            return
        }
        const state = this.getState()
        if (state === TTSState.Closed || state === TTSState.Closing) return
        if (state !== TTSState.Started) return

        this.emit('closing')
        this.setState(TTSState.Closing)
        this.ws.send(
            JSON.stringify({
                header: {
                    action: 'finish-task',
                    task_id: this.taskId,
                    streaming: 'duplex'
                },
                payload: { input: {} }
            })
        )

        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                if (timeout) clearTimeout(timeout)
                this.off('closed', onClosed)
                this.off('error', onError)
            }
            const onClosed = () => {
                cleanup()
                resolve()
            }
            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error(`Timeout waiting for Qwen task-finished after ${WS_TIMEOUT * 6}ms`))
            }, WS_TIMEOUT * 6)

            this.once('closed', onClosed)
            this.once('error', onError)
        })
        this.setState(TTSState.Closed)
    }

    public async disconnect(): Promise<void> {
        if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) {
            const already = this.getState() === TTSState.Disconnected
            this.ws = undefined
            this.setState(TTSState.Disconnected)
            if (!already) this.emit('disconnected', this.uid, this.resourceId, 0, 'already closed')
            return
        }

        this.setState(TTSState.Disconnecting)
        this.emit('disconnecting')
        this.ws.close()

        const { code, reason } = await new Promise<{ code: number; reason: string }>(resolve => {
            const timeout = setTimeout(() => resolve({ code: 0, reason: 'close timeout' }), WS_TIMEOUT)
            this.ws?.once('close', (code: number, reason: Buffer) => {
                clearTimeout(timeout)
                resolve({ code, reason: reason.toString() })
            })
        })

        this.ws.removeAllListeners()
        this.ws = undefined
        this.setState(TTSState.Disconnected)
        this.emit('disconnected', this.uid, this.resourceId, code, reason)
    }

    public interrupt(): void {
        this.setState(TTSState.Disconnected)
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.ws = undefined
            this.emit('disconnected', this.uid, this.resourceId, 0, 'interrupted')
            return
        }
        const ws = this.ws
        this.ws = undefined
        ws.once('close', () => ws.removeAllListeners())
        ws.terminate()
        this.emit('disconnected', this.uid, this.resourceId, 0, 'interrupted')
    }

    private isTearingDown(): boolean {
        const state = this.getState()
        return state === TTSState.Disconnecting || state === TTSState.Disconnected
    }

    private discardSocket(): void {
        const ws = this.ws
        if (!ws) return
        this.ws = undefined
        ws.removeAllListeners()
        if (ws.readyState < WebSocket.CLOSING) ws.terminate()
    }

    /**
     * 上游主动断开时同步状态。Socket.IO 连接仍由客户端保持，下一轮 start/connect 再拉起 WebSocket。
     */
    private onSocketClose(code: number, reason: string): void {
        const state = this.getState()
        if (this.isTearingDown()) return

        this.ws = undefined
        this.setState(TTSState.Disconnected)
        this.log.warnMsg(`Qwen 上游 WebSocket 已断开: code=${code} reason=${reason || 'closed'}`)

        if (state === TTSState.Started || state === TTSState.Closing) {
            this.emit('error', new Error(`Qwen 上游 WebSocket 已断开: ${code} ${reason || 'closed'}`))
        }
        this.emit('disconnected', this.uid, this.resourceId, code, reason || 'closed')
    }

    private loop(sessionId: string): void {
        const ws = this.ws
        if (!ws) return

        const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
            try {
                if (isBinary) {
                    this.emit('data', Buffer.from(data as Buffer))
                    return
                }

                const message = parseQwenMessage(data)
                switch (message.header?.event) {
                    case 'result-generated':
                        break
                    case 'task-finished':
                        ws.off('message', onMessage)
                        this.emit('closed', sessionId)
                        break
                    case 'task-failed':
                        ws.off('message', onMessage)
                        this.emit('error', new Error(message.header.error_message || message.header.error_code || 'Qwen task failed'))
                        break
                    default:
                        break
                }
            } catch (error) {
                ws.off('message', onMessage)
                this.emit('error', error as Error)
            }
        }

        ws.on('message', onMessage)
    }
}

function parseQwenMessage(data: WebSocket.RawData): QwenMessage {
    return JSON.parse(Buffer.from(data as Buffer).toString('utf8')) as QwenMessage
}

function toNumber(value: string | undefined, defaultValue: number): number {
    if (value === undefined || value === '') return defaultValue
    const num = Number(value)
    return Number.isFinite(num) ? num : defaultValue
}
