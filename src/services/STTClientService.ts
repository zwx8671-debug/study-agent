/** @format */

import { io, Socket } from 'socket.io-client'
import { EventEmitter } from 'events'
import { getLogger } from '@utils/Logger'
import { AudioFormatEnum, STTEventData, STTRequest, STTResponse } from '@interface/ISTT'
import { env } from '@config/env'
import msgpackParser from 'socket.io-msgpack-parser'
import { traceContext } from '@utils/TraceContext'

const log = getLogger('STTClientService')

/**
 * STTClientService 事件接口定义
 */
export interface STTClientServiceEvents {
    /**
     * STT 会话启动成功事件
     * @param response STT 响应数据
     */
    started(response: STTResponse): void
    /**
     * 接收到 STT 识别文本数据事件
     * @param text 识别的文本
     * @param isFinal 是否为最终结果
     */
    data(text: string, isFinal: boolean): void
    /**
     * STT 错误事件
     * @param error 错误对象
     */
    error(error: Error): void
    /**
     * STT 会话结束事件
     * @param response STT 响应数据
     */
    ended(response: STTResponse): void
    /**
     * 与 STT 服务断开连接事件
     * @param reason 断开原因
     */
    disconnect(reason: string): void
}

/**
 * Socket.IO 服务端发送事件类型定义
 */
export interface ServerToClientEvents {
    'stt:started': (response: STTResponse) => void
    'stt:data': (data: STTEventData) => void
    'stt:ended': (response: STTResponse) => void
    'stt:error': (response: STTResponse) => void
}

/**
 * Socket.IO 客户端发送事件类型定义
 */
export interface ClientToServerEvents {
    'stt:start': (data: STTRequest) => void
    'stt:audio': (data: STTRequest) => void
    'stt:end': (data: STTRequest) => void
}

/**
 * STT 客户端服务
 * 封装与独立 STT 服务的 Socket.IO 连接
 */
export class STTClientService extends EventEmitter {
    private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
    private sessionId: string
    private deviceSN: string
    private connected: boolean = false
    private reconnectAttempts: number = 0
    private readonly maxReconnectAttempts: number = 3
    private readonly reconnectDelay: number = 1000

    constructor(sessionId: string, deviceSN: string) {
        super()
        this.sessionId = sessionId
        this.deviceSN = deviceSN
    }

    /**
     * 连接到 STT 服务
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const sttServerUrl = env.STT_SERVER_URL || 'http://localhost:4000'

                log.infoMsg('Connecting to STT service', {
                    sessionId: this.sessionId,
                    deviceSN: this.deviceSN
                })

                // TODO 连接优化
                this.socket = io(sttServerUrl, {
                    transports: ['websocket'],
                    reconnection: false, // 我们手动处理重连
                    parser: msgpackParser,
                    timeout: 10000
                })

                // 连接成功
                this.socket.on('connect', () => {
                    this.connected = true
                    this.reconnectAttempts = 0
                    log.infoMsg('Connected to STT service', {
                        sessionId: this.sessionId
                    })
                    resolve()
                })

                // 连接错误
                this.socket.on('connect_error', (error: Error) => {
                    log.errorMsg('Failed to connect to STT service', {
                        errorMsg: error,
                        sessionId: this.sessionId,
                        attempt: this.reconnectAttempts
                    })

                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++
                        setTimeout(() => {
                            this.socket?.connect()
                        }, this.reconnectDelay * this.reconnectAttempts)
                    } else {
                        reject(
                            new Error(
                                `Failed to connect to STT service after ${this.maxReconnectAttempts} attempts: ${error.message}`
                            )
                        )
                    }
                })

                // 监听 STT 服务的响应事件
                this.setupEventListeners()
            } catch (error) {
                log.errorMsg('Error creating STT socket connection', {
                    errorMsg: error,
                    sessionId: this.sessionId
                })
                reject(error)
            }
        })
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        if (!this.socket) return

        // STT 开始成功
        this.socket.on('stt:started', (response: STTResponse) => {
            log.infoMsg('STT session started', {
                sessionId: response.sessionId,
                success: response.success
            })
            this.emit('started', response)
        })

        // STT 识别数据
        this.socket.on('stt:data', (data: STTEventData) => {
            log.infoMsg('STT data received', {
                sessionId: data.sessionId,
                text: data.text,
                isFinal: data.isFinal
            })
            this.emit('data', data.text, data.isFinal)
        })

        // STT 错误
        this.socket.on('stt:error', (response: STTResponse) => {
            log.errorMsg('STT error received', {
                sessionId: response.sessionId,
                error: response.error
            })
            this.emit('error', new Error(response.error || 'Unknown STT error'))
        })

        // STT 结束
        this.socket.on('stt:ended', (response: STTResponse) => {
            log.infoMsg('STT session ended', {
                sessionId: response.sessionId,
                success: response.success
            })
            this.emit('ended', response)
        })

        // 断开连接
        this.socket.on('disconnect', (reason: string) => {
            this.connected = false
            log.warnMsg('Disconnected from STT service', {
                reason,
                sessionId: this.sessionId
            })
            this.emit('disconnect', reason)
        })
    }

    /**
     * 启动 STT 会话
     */
    async start(format: AudioFormatEnum = AudioFormatEnum.PCM): Promise<void> {
        if (!this.socket || !this.connected) {
            throw new Error('Not connected to STT service')
        }

        const request: STTRequest = {
            deviceSN: this.deviceSN,
            sessionId: this.sessionId,
            format,
            traceId: traceContext.getTraceId()
        }

        log.infoMsg('Starting STT session', {
            sessionId: this.sessionId,
            deviceSN: this.deviceSN,
            format
        })

        this.socket.emit('stt:start', request)
    }

    /**
     * 推送音频数据
     */
    pushAudio(audio: Buffer | Buffer[]): void {
        if (!this.socket || !this.connected) {
            throw new Error('Not connected to STT service')
        }

        const request: STTRequest = {
            deviceSN: this.deviceSN,
            sessionId: this.sessionId,
            format: AudioFormatEnum.PCM, // 默认 PCM 格式
            audio,
            traceId: traceContext.getTraceId()
        }

        this.socket.emit('stt:audio', request)
    }

    /**
     * 结束 STT 会话
     */
    async end(traceId?: string): Promise<void> {
        if (!this.socket || !this.connected) {
            log.warnMsg('Cannot end STT session: not connected', {
                sessionId: this.sessionId
            })
            return
        }

        const request: STTRequest = {
            deviceSN: this.deviceSN,
            sessionId: this.sessionId,
            format: AudioFormatEnum.PCM,
            end: true,
            traceId
        }

        log.infoMsg('Ending STT session', {
            sessionId: this.sessionId,
            deviceSN: this.deviceSN
        })

        this.socket.emit('stt:end', request)
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.socket) {
            log.infoMsg('Disconnecting from STT service', {
                sessionId: this.sessionId
            })

            this.socket.removeAllListeners()
            this.socket.disconnect()
            this.socket = null
            this.connected = false
        }
    }

    /**
     * 检查是否已连接
     */
    isConnected(): boolean {
        return this.connected && this.socket !== null
    }

    /**
     * 获取会话ID
     */
    getSessionId(): string {
        return this.sessionId
    }

    // 类型安全的事件方法重写
    override on<K extends keyof STTClientServiceEvents>(event: K, listener: STTClientServiceEvents[K]): this {
        return super.on(event, listener)
    }

    override once<K extends keyof STTClientServiceEvents>(event: K, listener: STTClientServiceEvents[K]): this {
        return super.once(event, listener)
    }

    override emit<K extends keyof STTClientServiceEvents>(
        event: K,
        ...args: Parameters<STTClientServiceEvents[K]>
    ): boolean {
        return super.emit(event, ...args)
    }

    override off<K extends keyof STTClientServiceEvents>(event: K, listener?: STTClientServiceEvents[K]): this {
        if (listener) return super.off(event, listener)
        else return this.removeAllListeners(event)
    }
}
