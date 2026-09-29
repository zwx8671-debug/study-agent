/** @format */

import WebSocket, { type Data } from 'ws'
import { AudioFormatEnum, STTStreamOptions } from '@interface/ISTT'
import { STTBaseService, STTState } from './STTBaseService'

export interface STTWsConnectOptions {
    url: string
    headers: Record<string, string>
    timeoutMs: number
}

/**
 * WebSocket 流式识别的共用生命周期，与 Socket.IO 会话一一对应：
 *
 *   stt:start  → start()  → Starting → Started
 *   stt:audio  → push()
 *   data       → stt:data
 *   stt:end    → close()  → Closing → finalize → Closed
 *   error      → stt:error
 *
 * 子类只实现协议：建连参数、就绪握手、发包、收尾。
 */
export abstract class STTWsStreamService extends STTBaseService {
    protected ws?: WebSocket
    protected queue: Buffer[] = []
    protected options?: STTStreamOptions
    protected loopTask?: Promise<void>
    private readyWaiters: Array<() => void> = []
    private closedWaiters: Array<() => void> = []
    private readyNotified = false

    protected constructor(uid: string, options?: STTStreamOptions) {
        super(uid)
        this.options = options
        this.setState(STTState.Created)
    }

    protected abstract getConnectOptions(): STTWsConnectOptions
    protected abstract waitReady(ws: WebSocket, format: AudioFormatEnum): Promise<void>
    protected abstract handleUpstreamMessage(data: Data): void
    protected abstract sendAudio(ws: WebSocket, audio: Buffer): void
    protected abstract finalize(ws: WebSocket): Promise<void>
    protected abstract getReadyTimeoutMs(): number
    protected abstract getCloseTimeoutMs(): number
    protected finishSession(_ws: WebSocket): void {}

    public async start(format: AudioFormatEnum = AudioFormatEnum.PCM): Promise<STTBaseService> {
        if (this.getState() >= STTState.Starting) return this
        this.setState(STTState.Starting)

        const ws = await this.connect()
        await this.waitReady(ws, format)

        this.setState(STTState.Started)
        this.loopTask = this.loop(ws).catch(error => this.fail(error as Error))
        return this
    }

    public push(audioData: Buffer): void {
        if (this.getState() >= STTState.Closing) return
        this.queue.push(audioData)
        this.emit('add')
    }

    public async close(): Promise<STTBaseService> {
        if (this.getState() === STTState.Closed) return this
        if (this.getState() >= STTState.Closing) {
            await this.waitUntilClosed(this.getCloseTimeoutMs())
            return this
        }

        this.setState(STTState.Closing)
        this.emit('closing')

        const ws = this.ws
        if (ws && ws.readyState === WebSocket.OPEN) {
            await this.loopTask
            if (this.sttError) throw this.sttError

            await this.finalize(ws)
            if (this.sttError) throw this.sttError
            if (this.getState() === STTState.Closed) return this

            this.finishSession(ws)
            await this.waitUntilClosed(this.getCloseTimeoutMs())
        } else {
            this.markClosed()
        }

        return this
    }

    public disconnect(): void {
        const ws = this.ws
        if (!ws) return
        ws.removeAllListeners('message')
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'ASR finished')
        }
        this.ws = undefined
    }

    protected async connect(): Promise<WebSocket> {
        if (this.ws) return this.ws

        const { url, headers, timeoutMs } = this.getConnectOptions()

        const ws = new WebSocket(url, {
            headers,
            handshakeTimeout: timeoutMs
        })
        this.ws = ws

        ws.on('error', (error: Error) => {
            this.emit('error', error)
        })

        ws.on('close', (code, reason) => {
            if (this.getState() === STTState.Starting) {
                this.fail(new Error(`upstream closed during start: ${code} ${reason.toString()}`))
                return
            }
            if (this.getState() === STTState.Started) {
                this.fail(new Error(`upstream closed unexpectedly: ${code} ${reason.toString()}`))
                this.markClosed()
                return
            }
            if (this.getState() === STTState.Closing) {
                this.markClosed()
            }
        })

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`WebSocket connection timeout after ${timeoutMs}ms`))
            }, timeoutMs)
            const cleanup = () => {
                clearTimeout(timeout)
                ws.off('open', onOpen)
                ws.off('error', onError)
            }
            const onOpen = () => {
                cleanup()
                resolve()
            }
            const onError = (error: Error) => {
                cleanup()
                reject(new Error(`WebSocket connection failed: ${error.message}`))
            }
            ws.once('open', onOpen)
            ws.once('error', onError)
        })

        ws.on('message', data => {
            try {
                this.handleUpstreamMessage(data)
            } catch (error) {
                this.fail(error as Error)
            }
        })

        return ws
    }

    protected notifyReady(): void {
        if (this.readyNotified) return
        this.readyNotified = true
        const waiters = this.readyWaiters.splice(0)
        waiters.forEach(resolve => resolve())
    }

    protected markClosed(): void {
        if (this.getState() === STTState.Closed) return
        this.disconnect()
        this.setState(STTState.Closed)
        const waiters = this.closedWaiters.splice(0)
        waiters.forEach(resolve => resolve())
    }

    protected fail(error: Error): void {
        this.sttError = error
        this.emit('innerError', error)
        this.emit('error', error)
    }

    protected waitForReady(timeoutMessage: string): Promise<void> {
        if (this.readyNotified) return Promise.resolve()
        return this.waitFor(this.readyWaiters, this.getReadyTimeoutMs(), timeoutMessage)
    }

    private async waitUntilClosed(timeoutMs: number): Promise<void> {
        if (this.getState() === STTState.Closed) return
        try {
            await this.waitFor(this.closedWaiters, timeoutMs, 'STT session finalization timeout')
        } catch (error) {
            this.disconnect()
            this.setState(STTState.Closed)
            throw error
        }
    }

    private waitFor(waiters: Array<() => void>, timeoutMs: number, timeoutMessage: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error(timeoutMessage))
            }, timeoutMs)

            const onReady = () => {
                cleanup()
                resolve()
            }
            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }
            const cleanup = () => {
                clearTimeout(timeout)
                this.off('innerError', onError)
                const index = waiters.indexOf(onReady)
                if (index >= 0) waiters.splice(index, 1)
            }

            waiters.push(onReady)
            this.once('innerError', onError)
        })
    }

    private async loop(ws: WebSocket): Promise<void> {
        while (this.getState() < STTState.Closed) {
            if (this.queue.length === 0) {
                if (this.getState() >= STTState.Closing) break
                await new Promise<void>(resolve => {
                    const onAdd = () => {
                        this.off('closing', onClosing).off('add', onAdd)
                        resolve()
                    }
                    const onClosing = () => {
                        this.off('closing', onClosing).off('add', onAdd)
                        resolve()
                    }
                    this.once('add', onAdd)
                    this.once('closing', onClosing)
                })
                continue
            }

            const data = this.queue.shift()
            if (!data || ws.readyState !== WebSocket.OPEN) continue
            this.sendAudio(ws, data)
        }
    }
}
