/** @format */

import { STTBaseService, STTState } from '../STTBaseService'
import { AudioFormatEnum } from '@interface/IAgent'
import { STTClientService } from '@service/STTClientService'
import { getLogger } from '@utils/Logger'
import { v7 as uuidv7 } from 'uuid'

const log = getLogger('STTSocketIOService')

/**
 * STT Socket.IO 服务适配器
 * 将 STTClientService 适配为 STTBaseService 接口
 */
export class STTSocketIOService extends STTBaseService {
    private client: STTClientService
    private sessionId: string
    private format: AudioFormatEnum = AudioFormatEnum.PCM

    // 音频缓冲队列
    private audioBuffer: Buffer[] = []
    private readonly MERGE_THRESHOLD = 10 // 合并阈值：当缓冲区≥10个块时合并发送
    private isConnected: boolean = false
    private isFlushing: boolean = false

    constructor(deviceSN: string) {
        super(deviceSN)
        this.sessionId = uuidv7()
        this.client = new STTClientService(this.sessionId, deviceSN)
        this.setupClientListeners()
    }

    /**
     * 设置客户端事件监听器
     */
    private setupClientListeners() {
        // 连接成功
        this.client.on('started', response => {
            this.setState(STTState.Started)
            this.isConnected = true
            this.emit('started')
            log.infoMsg('STT session started via Socket.IO', {
                sessionId: response.sessionId
            })

            // 连接成功后，刷新缓冲区
            this.flushAudioBuffer()
        })

        // 接收识别数据
        this.client.on('data', (text: string, isFinal: boolean) => {
            this.emit('data', text)
            log.infoMsg('STT data received via Socket.IO', {
                sessionId: this.sessionId,
                text,
                isFinal
            })
        })

        // 错误处理
        this.client.on('error', (error: Error) => {
            this.sttError = error
            this.emit('error', error)
            log.errorMsg('STT error via Socket.IO', {
                sessionId: this.sessionId,
                errorMsg: error
            })
        })

        // 会话结束
        this.client.on('ended', response => {
            this.setState(STTState.Closed)
            this.emit('closed')
            log.infoMsg('STT session ended via Socket.IO', {
                sessionId: response.sessionId
            })
        })

        // 断开连接
        this.client.on('disconnect', reason => {
            this.isConnected = false
            this.clearAudioBuffer() // 断开时清空缓冲区
            this.emit('disconnected', this.uid, 0, reason)
            log.warnMsg('STT disconnected via Socket.IO', {
                sessionId: this.sessionId,
                reason
            })
        })
    }

    /**
     * 刷新音频缓冲区（将缓冲的音频数据发送到STT服务）
     * 使用 isFlushing 标志防止并发执行
     */
    private async flushAudioBuffer() {
        // 防止重入：如果正在刷新，直接返回
        if (this.isFlushing) {
            return
        }

        // 如果缓冲区为空或未连接，无需刷新
        if (this.audioBuffer.length === 0 || !this.isConnected) {
            return
        }

        this.isFlushing = true

        try {
            while (this.audioBuffer.length > 0 && this.isConnected) {
                let dataToSend: Buffer

                // 原子性地从队列取数据
                if (this.audioBuffer.length >= this.MERGE_THRESHOLD) {
                    const chunksToMerge = this.audioBuffer.splice(0, this.MERGE_THRESHOLD)
                    dataToSend = Buffer.concat(chunksToMerge)

                    log.infoMsg('Merging and sending audio chunks', {
                        sessionId: this.sessionId,
                        chunkCount: chunksToMerge.length,
                        totalSize: dataToSend.length,
                        remainingBuffer: this.audioBuffer.length
                    })
                } else {
                    // 逐个发送
                    dataToSend = this.audioBuffer.shift()!
                }

                // 发送数据（Socket.IO 的 emit 是同步操作）
                this.client.pushAudio(dataToSend)
            }
        } catch (error) {
            // 捕获错误但不重抛，避免异步调用时导致进程崩溃
            log.errorMsg('Error flushing audio buffer', {
                errorMsg: error,
                sessionId: this.sessionId,
                remainingBuffer: this.audioBuffer.length
            })

            // 通过事件机制通知上层错误
            this.sttError = error as Error
            this.emit('error', error as Error)

            // 不要 throw，让方法正常结束，保持服务可用
        } finally {
            this.isFlushing = false

            // 如果在刷新期间又有新数据进来，使用 setImmediate 触发下一次刷新
            // setImmediate 确保让出事件循环，避免深度递归
            if (this.audioBuffer.length > 0 && this.isConnected) {
                setImmediate(() => this.flushAudioBuffer())
            }
        }
    }

    /**
     * 清空音频缓冲区
     */
    private clearAudioBuffer() {
        const bufferSize = this.audioBuffer.length
        if (bufferSize > 0) {
            log.warnMsg('Clearing audio buffer', {
                sessionId: this.sessionId,
                droppedChunks: bufferSize
            })
            this.audioBuffer = []
        }
    }

    /**
     * 启动 STT 会话
     */
    async start(format: AudioFormatEnum = AudioFormatEnum.PCM): Promise<STTBaseService> {
        try {
            this.setState(STTState.Starting)
            this.emit('starting')
            this.format = format

            log.infoMsg('Starting STT session via Socket.IO', {
                sessionId: this.sessionId,
                format
            })

            // 连接到 STT 服务
            this.emit('connecting', this.uid, 'STT Socket.IO Service')
            await this.client.connect()
            this.emit('connected', this.uid, 'STT Socket.IO Service')

            // 启动 STT 会话并等待 started 事件
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('STT start timeout: waiting for started event'))
                }, 10000) // 10秒超时

                const onStarted = () => {
                    clearTimeout(timeout)
                    this.client.off('started', onStarted)
                    this.client.off('error', onError)
                    resolve()
                }

                const onError = (error: Error) => {
                    clearTimeout(timeout)
                    this.client.off('started', onStarted)
                    this.client.off('error', onError)
                    reject(error)
                }

                // 先注册监听器
                this.client.once('started', onStarted)
                this.client.once('error', onError)

                // 再发送 start 请求
                this.client.start().catch(reject)
            })

            return this
        } catch (error) {
            this.sttError = error as Error
            this.emit('error', error as Error)
            throw error
        }
    }

    /**
     * 推送音频数据（统一使用缓冲队列机制，避免并发问题）
     * 所有音频数据都先进入队列，然后由 flushAudioBuffer 统一处理
     */
    push(audioData: Buffer): void {
        try {
            // 统一将所有数据加入缓冲队列，避免直接发送和缓冲发送混乱
            this.audioBuffer.push(audioData)
            this.emit('add')

            // 如果已连接且没有在刷新，则触发刷新
            if (this.isConnected && !this.isFlushing) {
                // 使用 setImmediate 避免阻塞当前调用栈
                setImmediate(() => this.flushAudioBuffer())
            }
        } catch (error) {
            log.errorMsg('Error pushing audio data', {
                errorMsg: error,
                sessionId: this.sessionId
            })
            this.sttError = error as Error
            this.emit('error', error as Error)
        }
    }

    /**
     * 关闭 STT 会话
     */
    async close(): Promise<STTBaseService> {
        try {
            this.setState(STTState.Closing)
            this.emit('closing')

            log.infoMsg('Closing STT session via Socket.IO', {
                sessionId: this.sessionId
            })

            if (this.client.isConnected()) {
                // 1. 先刷新缓冲区，确保所有音频数据都发送完毕
                try {
                    await this.flushAudioBuffer()
                    log.infoMsg('Audio buffer flushed, sending end signal', {
                        sessionId: this.sessionId
                    })
                } catch (error) {
                    // flush 失败不应该阻止 close 操作
                    log.warnMsg('Failed to flush buffer during close, continuing anyway', {
                        errorMsg: error,
                        sessionId: this.sessionId
                    })
                }

                // 2. 先注册监听器，再发送结束请求
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('STT close timeout'))
                    }, 10000) // 10秒超时

                    const cleanup = () => {
                        clearTimeout(timeout)
                        this.client.off('ended', onEnded)
                        this.client.off('error', onError)
                    }

                    const onEnded = () => {
                        cleanup()
                        resolve()
                    }

                    const onError = (error: Error) => {
                        cleanup()
                        reject(error)
                    }

                    // 先注册监听器
                    this.client.once('ended', onEnded)
                    this.client.once('error', onError)

                    // 再发送结束请求（尾包）- 这会触发 ended 事件
                    this.client.end()
                })
            }

            return this
        } catch (error) {
            this.sttError = error as Error
            this.emit('error', error as Error)
            throw error
        }
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        try {
            this.emit('disconnecting', this.uid)

            log.infoMsg('Disconnecting STT via Socket.IO', {
                sessionId: this.sessionId
            })

            this.isConnected = false
            this.clearAudioBuffer() // 断开前清空缓冲区
            this.client.disconnect()
            this.setState(STTState.Closed)
        } catch (error) {
            log.errorMsg('Error disconnecting STT via Socket.IO', {
                errorMsg: error
            })
        }
    }

    /**
     * 获取会话ID
     */
    getSessionId(): string {
        return this.sessionId
    }
}
