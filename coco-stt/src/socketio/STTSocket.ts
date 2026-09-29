/** @format */

import {Server} from 'socket.io'
import {
    ClientToServerEvents,
    InterServerEvents,
    ServerToClientEvents,
    SocketData,
    STTEventData,
    STTRequest,
    STTResponse,
    STTSocket,
    STTStreamOptions
} from '@interface/ISTT'
import {STTFactory} from '@stt/STTFactory'
import {STTBaseService} from '@stt/STTBaseService'
import {getLogger} from '@utils/Logger'
import {TraceContext} from '@utils/TraceContext'

const log = getLogger('STTSocket')

/**
 * 会话信息接口
 */
export interface SessionInfo {
    sessionId: string              // 业务ID，用于追踪
    sttService: STTBaseService     // STT服务实例
    lastActivityTime: number       // 最后活动时间
    idleTimer?: NodeJS.Timeout     // 空闲计时器
    // 时间戳记录
    sessionStartTime: number       // 会话开始时间
    firstAudioTime?: number        // 首包时间
    lastAudioTime?: number         // 尾包时间
    firstRecognitionTime?: number  // 首次识别时间
}

/**
 * Socket.IO 会话生命周期，与 STTWsStreamService 状态机对齐：
 *   stt:start → start() → Started → stt:started
 *   stt:audio → push()
 *   data      → stt:data
 *   stt:end   → close() → Closed → stt:ended
 *   error     → stt:error
 */
export class STTSocketHandler {
    private io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
    // 使用 socketId 作为键来管理会话
    private activeSessions: Map<string, SessionInfo> = new Map()
    // 空闲超时时间：30秒
    private readonly IDLE_TIMEOUT = 30000

    constructor(io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
        this.io = io
    }

    public register() {
        this.io.on('connection', (socket: STTSocket) => {
            log.info(`Client connected: ${socket.id}`)

            // STT 开始事件 - 在注册时设置 TraceContext
            socket.on('stt:start', (data: STTRequest) => {
                TraceContext.run({
                    sessionId: data.sessionId,
                    traceId: data.traceId,
                    socketId: socket.id,
                    deviceSN: data.deviceSN
                }, () => {
                    this.handleSTTStart(socket, data)
                })
            })

            // STT 音频数据事件 - 在注册时设置 TraceContext
            socket.on('stt:audio', (data: STTRequest) => {
                TraceContext.run({
                    sessionId: data.sessionId,
                    traceId: data.traceId,
                    socketId: socket.id,
                    deviceSN: data.deviceSN
                }, () => {
                    this.handleSTTAudio(socket, data)
                })
            })

            // STT 结束事件 - 在注册时设置 TraceContext
            socket.on('stt:end', (data: STTRequest) => {
                TraceContext.run({
                    sessionId: data.sessionId,
                    traceId: data.traceId,
                    socketId: socket.id,
                    deviceSN: data.deviceSN
                }, () => {
                    this.handleSTTEnd(socket, data)
                })
            })

            // 断开连接事件
            socket.on('disconnect', () => this.handleDisconnect(socket))
        })
    }

    private async handleSTTStart(socket: STTSocket, data: STTRequest) {
        const {deviceSN, sessionId, traceId, provider} = data

        try {
            // TraceContext 已在 register() 中设置，这里直接使用
            log.infoMsg(`STT session starting${provider ? `, provider=${provider}` : ''}`)

            // 检查是否已存在会话
            const existingSession = this.activeSessions.get(socket.id)
            if (existingSession) {
                const errorMsg = `一次链接只能请求一个会话，上个会话没有结束，你可以继续emit data`
                log.errorMsg('Cannot start new session, active session exists', {
                    existingSessionId: existingSession.sessionId,
                    newSessionId: sessionId
                })

                const response: STTResponse = {
                    success: false,
                    sessionId,
                    error: errorMsg,
                    traceId
                }
                socket.emit('stt:error', response)
                return
            }

            // 创建STT服务实例（请求指定供应商优先，否则用环境变量）
            const resolvedProvider = STTFactory.resolveType(provider)
            const options = resolveStreamOptions(data)
            const sttService = STTFactory.create(sessionId, provider, options)

            // 记录会话开始时间
            const sessionStartTime = Date.now()

            // 创建会话信息并保存（使用 socketId 作为键）
            const sessionInfo: SessionInfo = {
                sessionId,
                sttService,
                lastActivityTime: sessionStartTime,
                sessionStartTime
            }
            this.activeSessions.set(socket.id, sessionInfo)
            this.bindServiceLifecycle(socket, sessionInfo, traceId)

            try {
                await sttService.start(data.format)
            } catch (error) {
                this.activeSessions.delete(socket.id)
                sttService.disconnect()
                this.cleanupSTTServiceListeners(sttService)
                throw error
            }

            // 启动空闲计时器
            this.resetIdleTimer(socket)

            const response: STTResponse = {
                success: true,
                sessionId,
                provider: resolvedProvider,
                traceId
            }
            socket.emit('stt:started', response)

            log.infoMsg(`STT session started, provider=${resolvedProvider}`)
        } catch (error) {
            log.errorMsg('Failed to start STT session', {
                errorMsg: error
            })
            const response: STTResponse = {
                success: false,
                sessionId,
                error: error instanceof Error ? 'Failed to start STT ' + error.message : 'Unknown error',
                traceId
            }
            socket.emit('stt:error', response)
        }
    }

    private bindServiceLifecycle(socket: STTSocket, sessionInfo: SessionInfo, traceId?: string) {
        const { sessionId, sttService } = sessionInfo

        sttService.on('data', (text: string) => {
            const currentSessionInfo = this.activeSessions.get(socket.id)
            if (currentSessionInfo && !currentSessionInfo.firstRecognitionTime) {
                currentSessionInfo.firstRecognitionTime = Date.now()
            }

            sttService.setAccumulatedText(text)

            const eventData: STTEventData = {
                sessionId,
                text,
                traceId
            }
            socket.emit('stt:data', eventData)
        })

        sttService.on('error', (error: Error) => {
            log.errorMsg('STT service error', {
                errorMsg: error
            })
            const response: STTResponse = {
                success: false,
                sessionId,
                error: error.message,
                traceId
            }
            socket.emit('stt:error', response)
        })
    }

    private handleSTTAudio(socket: STTSocket, data: STTRequest) {
        const {sessionId, audio, traceId} = data

        try {
            const sessionInfo = this.activeSessions.get(socket.id)
            if (!sessionInfo) {
                throw new Error(`No active STT session found for socket: ${socket.id}`)
            }

            // 验证 sessionId 是否匹配（可选的安全检查）
            if (sessionInfo.sessionId !== sessionId) {
                log.warnMsg('SessionId mismatch', {
                    socketId: socket.id,
                    expectedSessionId: sessionInfo.sessionId,
                    receivedSessionId: sessionId,
                    traceId
                })
            }

            // 推送音频数据（浏览器请发 { type: 'Buffer', data: number[] }，与 Node Buffer JSON 一致）
            if (audio) {
                if (!sessionInfo.firstAudioTime) {
                    sessionInfo.firstAudioTime = Date.now()
                }
                sessionInfo.lastAudioTime = Date.now()
                const chunks = Array.isArray(audio) ? audio : [audio]
                for (const chunk of chunks) {
                    const buf = toAudioBuffer(chunk)
                    if (buf) sessionInfo.sttService.push(buf)
                }
            }

            // 重置空闲计时器
            this.resetIdleTimer(socket)
        } catch (error) {
            log.errorMsg('Failed to process STT audio', {
                socketId: socket.id,
                sessionId,
                errorMsg: error,
                traceId
            })
            const response: STTResponse = {
                success: false,
                sessionId,
                error: error instanceof Error ? error.message : 'Unknown error',
                traceId
            }
            socket.emit('stt:error', response)
        }
    }

    private async handleSTTEnd(socket: STTSocket, data: STTRequest) {
        const {deviceSN, sessionId, traceId} = data
        const sessionInfo = this.activeSessions.get(socket.id)
        if (!sessionInfo) {
            log.warnMsg('No active STT session to end')
            return
        }

        try {
            // TraceContext 已在 register() 中设置，这里直接使用
            log.infoMsg('Ending STT session')

            // 清除空闲计时器
            if (sessionInfo.idleTimer) {
                clearTimeout(sessionInfo.idleTimer)
            }

            // 关闭STT服务
            await sessionInfo.sttService.close()

            // 获取最终识别文本
            const finalText = sessionInfo.sttService.getAccumulatedText()

            // 记录会话结束时间
            const sessionEndTime = Date.now()

            // 移除会话
            this.activeSessions.delete(socket.id)

            // 发送结束响应，包含最终识别结果
            const response: STTResponse = {
                success: true,
                sessionId,
                text: finalText, // 包含最终识别文本
                traceId
            }
            socket.emit('stt:ended', response)

            // 打印STT识别时间统计 - 表格格式
            const timingTable = log.formatTimingTable(sessionInfo, sessionEndTime, finalText)
            log.infoMsg(timingTable)
        } catch (error) {
            log.errorMsg('Failed to end STT session', {
                errorMsg: error
            })
            // close 失败后该会话已不可复用，立即摘除并强制断开上游连接。
            this.activeSessions.delete(socket.id)
            sessionInfo.sttService.disconnect()
            const response: STTResponse = {
                success: false,
                sessionId,
                error: error instanceof Error ? error.message : 'Unknown error',
                traceId
            }
            socket.emit('stt:error', response)
        } finally {
            // 移除所有事件监听器
            this.cleanupSTTServiceListeners(sessionInfo.sttService)
        }
    }

    private async handleDisconnect(socket: STTSocket) {
        log.info(`Client disconnected: ${socket.id}`)

        // 清理该 socket 的会话
        const sessionInfo = this.activeSessions.get(socket.id)
        if (sessionInfo) {
            try {
                // 清除空闲计时器
                if (sessionInfo.idleTimer) {
                    clearTimeout(sessionInfo.idleTimer)
                }

                // 关闭STT服务
                await sessionInfo.sttService.close()

                // 移除会话
                this.activeSessions.delete(socket.id)

                log.infoMsg('Cleaned up STT session on disconnect', {
                    socketId: socket.id,
                    sessionId: sessionInfo.sessionId
                })
            } catch (error) {
                log.errorMsg('Failed to cleanup STT session', {
                    socketId: socket.id,
                    sessionId: sessionInfo.sessionId,
                    errorMsg: error
                })
            } finally {
                this.activeSessions.delete(socket.id)
                sessionInfo.sttService.disconnect()
                // 移除所有事件监听器
                this.cleanupSTTServiceListeners(sessionInfo.sttService)
            }
        }
    }


    /**
     * 清理 STT 服务的所有事件监听器
     * 防止内存泄漏
     */
    private cleanupSTTServiceListeners(sttService: STTBaseService) {
        // 移除所有事件监听器
        sttService.removeAllListeners()
        // WebSocket 的异步回调可能在清理后才到达；保留 error 兜底，避免
        // EventEmitter 在没有 error listener 时直接终止 Node 进程。
        sttService.on('error', error => {
            log.errorMsg('Late STT service error after session cleanup', {
                errorMsg: error
            })
        })
    }

    /**
     * 重置空闲计时器
     * 在每次有活动时调用，重置30秒的空闲超时
     */
    private resetIdleTimer(socket: STTSocket) {
        const sessionInfo = this.activeSessions.get(socket.id)
        if (!sessionInfo) return

        // 清除旧的计时器
        if (sessionInfo.idleTimer) {
            clearTimeout(sessionInfo.idleTimer)
        }

        // 更新最后活动时间
        sessionInfo.lastActivityTime = Date.now()

        // 设置新的计时器
        sessionInfo.idleTimer = setTimeout(() => {
            log.warnMsg('Session idle timeout, closing connection', {
                socketId: socket.id,
                sessionId: sessionInfo.sessionId,
                idleTime: Date.now() - sessionInfo.lastActivityTime
            })
            socket.disconnect(true)
        }, this.IDLE_TIMEOUT)
    }
}

function resolveStreamOptions(data: STTRequest): STTStreamOptions {
    return {
        language: data.language || data.options?.language,
        enableItn: data.options?.enableItn,
        enablePunc: data.options?.enablePunc,
        resultType: data.options?.resultType,
        enableVad: data.options?.enableVad
    }
}

/**
 * 将浏览器 / Node 传来的音频块规范为 Buffer。
 * 浏览器 msgpack 请发 { type: 'Buffer', data: number[] }。
 */
function toAudioBuffer(audio: unknown): Buffer | null {
    if (!audio) return null
    if (Buffer.isBuffer(audio)) return audio
    if (audio instanceof Uint8Array) return Buffer.from(audio)
    if (audio instanceof ArrayBuffer) return Buffer.from(audio)
    if (ArrayBuffer.isView(audio)) {
        const view = audio as ArrayBufferView
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
    }
    if (typeof audio === 'object' && audio !== null) {
        const maybe = audio as { type?: string; data?: number[] }
        if (maybe.type === 'Buffer' && Array.isArray(maybe.data)) {
            return Buffer.from(maybe.data)
        }
    }
    return null
}
