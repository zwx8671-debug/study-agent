/** @format */

import { Server } from 'socket.io'
import {
    AudioFlag,
    ClientToServerEvents,
    InterServerEvents,
    ServerToClientEvents,
    SocketData,
    TTSCloseRequest,
    TTSConnectRequest,
    TTSConnectResponse,
    TTSDataResponse,
    TTSDisconnectRequest,
    TTSEndResponse,
    TTSErrorResponse,
    TTSInterruptRequest,
    TTSPushRequest,
    TTSSocket,
    TTSStartRequest,
    TTSStartResponse
} from '@interface/ITTSSocket'
import { TTSBaseService, TTSState } from '@tts/TTSBaseService'
import { TTSFactory } from '@tts/TTSFactory'
import { getLogger } from '@utils/Logger'
import { TraceContext } from '@utils/TraceContext'

const log = getLogger('TTSSocket')

/**
 * 连接级会话信息
 *
 * 一个 Socket 连接对应一个上游 TTS 连接，连接上可串行开启多个音频会话（sessionId）
 */
export interface SessionInfo {
    /** 设备序列号 */
    deviceSN: string
    /** 上游资源ID */
    resourceId: string
    /** TTS 服务实例 */
    tts: TTSBaseService
    /** 连接级 traceId */
    traceId?: string
    /** 当前活跃会话ID，close 后置空 */
    currentSessionId: string
    /** 当前会话实际生效的音色 */
    speaker?: string
    /** 当前会话已下发的音频块数量 */
    audioIndex: number
    /** 连接建立时间 */
    connectTime: number
    /** 当前会话开始时间 */
    sessionStartTime?: number
    /** 当前会话首次推送文本时间 */
    firstPushTime?: number
    /** 当前会话首个音频包时间 */
    firstAudioTime?: number
    /** 当前会话累计推送的文本长度 */
    textLength: number
    /** 本次上游使用的提供商 */
    provider?: string
}

export class TTSSocketHandler {
    private io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
    // 使用 socketId 作为键来管理连接
    private sessions: Map<string, SessionInfo> = new Map()

    constructor(io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
        this.io = io
    }

    public register() {
        this.io.on('connection', (socket: TTSSocket) => {
            log.info(`Client connected: ${socket.id}`)

            // 建立上游 TTS 连接
            socket.on('tts:connect', (req: TTSConnectRequest) => {
                TraceContext.run(
                    { traceId: req?.traceId, socketId: socket.id, deviceSN: req?.deviceSN },
                    () => {
                        this.handleConnect(socket, req)
                    }
                )
            })

            // 开启会话
            socket.on('tts:start', (req: TTSStartRequest) => {
                TraceContext.run(this.traceOf(socket, req?.traceId, req?.sessionId), () => {
                    this.handleStart(socket, req)
                })
            })

            // 增量推送文本（流式文本输入）
            socket.on('tts:push', (req: TTSPushRequest) => {
                TraceContext.run(this.traceOf(socket, req?.traceId, req?.sessionId), () => {
                    this.handlePush(socket, req)
                })
            })

            // 关闭会话
            socket.on('tts:close', (req: TTSCloseRequest) => {
                TraceContext.run(this.traceOf(socket, req?.traceId, req?.sessionId), () => {
                    this.handleClose(socket, req)
                })
            })

            // 断开上游 TTS 连接
            socket.on('tts:disconnect', (req?: TTSDisconnectRequest) => {
                TraceContext.run(this.traceOf(socket, req?.traceId), () => {
                    this.handleDisconnect(socket)
                })
            })

            // 强制中断
            socket.on('tts:interrupt', (req?: TTSInterruptRequest) => {
                TraceContext.run(this.traceOf(socket, req?.traceId), () => {
                    this.handleInterrupt(socket)
                })
            })

            socket.on('disconnect', () => this.handleSocketDisconnect(socket))
            socket.on('error', (error: Error) => {
                log.errorMsg('Socket error', { socketId: socket.id, errorMsg: error })
            })
        })
    }

    /**
     * 组装 TraceContext，缺省字段从连接级会话补齐
     */
    private traceOf(socket: TTSSocket, traceId?: string, sessionId?: string) {
        const session = this.sessions.get(socket.id)
        return {
            traceId: traceId || session?.traceId,
            sessionId: sessionId || session?.currentSessionId,
            socketId: socket.id,
            deviceSN: session?.deviceSN
        }
    }

    private async handleConnect(socket: TTSSocket, req: TTSConnectRequest) {
        const { deviceSN, resourceId, traceId, provider } = req || ({} as TTSConnectRequest)
        const type = TTSFactory.resolveType(provider)

        // 同一连接重复 connect 时直接复用，避免上游连接泄漏
        const existing = this.sessions.get(socket.id)
        if (existing && existing.provider === type) {
            if (existing.tts.getState() === TTSState.Disconnected) {
                log.infoMsg('Upstream websocket already gone, reconnect on same Socket.IO session')
                try {
                    await existing.tts.connect()
                } catch (error) {
                    log.errorMsg('Failed to reconnect upstream TTS', { errorMsg: error })
                    const response: TTSConnectResponse = {
                        success: false,
                        deviceSN,
                        resourceId: existing.resourceId,
                        error: this.errorMessage(error),
                        traceId
                    }
                    socket.emit('tts:connected', response)
                    return
                }
            } else {
                log.warnMsg('TTS already connected, reuse existing upstream connection')
            }
            socket.emit('tts:connected', this.connectedResponse(existing, traceId))
            return
        }
        if (existing) {
            log.infoMsg(`TTS provider changed ${existing.provider} -> ${type}, reconnect upstream`)
            this.sessions.delete(socket.id)
            await existing.tts.disconnect().catch(error => {
                log.errorMsg('Failed to disconnect old upstream before provider switch', { errorMsg: error })
            })
            existing.tts.removeAllListeners()
        }

        let tts: TTSBaseService | undefined
        try {
            log.infoMsg(`TTS connecting provider=${type}`)

            tts = TTSFactory.createTTS(type, deviceSN)

            const session: SessionInfo = {
                deviceSN,
                resourceId: resourceId || tts.getResourceId(),
                tts,
                traceId,
                currentSessionId: '',
                audioIndex: 0,
                connectTime: Date.now(),
                textLength: 0,
                provider: type
            }
            this.sessions.set(socket.id, session)
            this.setupTTSListeners(socket, session)

            await tts.connect(resourceId)
            session.resourceId = tts.getResourceId()

            socket.emit('tts:connected', this.connectedResponse(session, traceId))
            log.infoMsg('TTS connected')
        } catch (error) {
            log.errorMsg('Failed to connect TTS', { errorMsg: error })

            // 连接失败要清理半成品会话，允许客户端重试
            this.sessions.delete(socket.id)
            tts?.removeAllListeners()

            const response: TTSConnectResponse = {
                success: false,
                deviceSN,
                resourceId: resourceId || '',
                error: this.errorMessage(error),
                traceId
            }
            socket.emit('tts:connected', response)
        }
    }

    private connectedResponse(session: SessionInfo, traceId?: string): TTSConnectResponse {
        return {
            success: true,
            deviceSN: session.deviceSN,
            resourceId: session.resourceId,
            format: session.tts.getAudioFormat(),
            sampleRate: session.tts.getSampleRate(),
            traceId: traceId || session.traceId
        }
    }

    /**
     * 挂载上游 TTS 事件到 Socket 下发
     *
     * 注意：监听器在连接级挂载一次，跨会话复用
     */
    private setupTTSListeners(socket: TTSSocket, session: SessionInfo) {
        const { tts } = session

        tts.on('connected', (uid: string, resourceId: string) => {
            log.infoMsg(`Upstream TTS connected: uid=${uid}, resourceId=${resourceId}`)
        })

        tts.on('started', (sessionId: string, speaker: string) => {
            session.speaker = speaker
            log.infoMsg(`Upstream TTS session started: ${sessionId}, speaker=${speaker}`)
        })

        tts.on('data', (buffer: Buffer) => {
            const sessionId = session.currentSessionId
            if (!sessionId) {
                log.warnMsg('Received TTS audio but no active session, dropped')
                return
            }

            if (!session.firstAudioTime) {
                session.firstAudioTime = Date.now()
            }

            const index = session.audioIndex++
            const response: TTSDataResponse = {
                sessionId,
                index,
                flag: index === 0 ? AudioFlag.START : AudioFlag.CHUNK,
                buffer,
                format: tts.getAudioFormat(),
                sampleRate: tts.getSampleRate(),
                traceId: session.traceId
            }
            socket.emit('tts:data', response)
        })

        tts.on('closed', (sessionId: string) => {
            const response: TTSEndResponse = {
                success: true,
                sessionId,
                index: session.audioIndex,
                traceId: session.traceId
            }

            this.logSessionTiming(session, sessionId)
            this.resetSession(session)
            socket.emit('tts:end', response)
        })

        tts.on('disconnected', (uid: string, resourceId: string, code: number, reason: string) => {
            log.infoMsg(`Upstream TTS disconnected: uid=${uid}, code=${code}, reason=${reason}`)
            this.resetSession(session)
            socket.emit('tts:disconnected', { deviceSN: uid, resourceId, code, reason, traceId: session.traceId })
        })

        tts.on('error', (error: Error) => {
            log.errorMsg('Upstream TTS error', { errorMsg: error })
            this.sendError(socket, this.errorMessage(error), session.currentSessionId, session.traceId, error.stack)
        })
    }

    private async handleStart(socket: TTSSocket, req: TTSStartRequest) {
        const { sessionId, speaker, emotion, language, loudness_rate, speech_rate, traceId } =
            req || ({} as TTSStartRequest)

        const session = this.sessions.get(socket.id)
        if (!session) {
            this.sendError(socket, '尚未建立 TTS 连接，请先发送 tts:connect', sessionId, traceId)
            return
        }

        try {
            if (session.currentSessionId && session.currentSessionId !== sessionId) {
                throw new Error(
                    `上一个会话[${session.currentSessionId}]尚未关闭，无法开启新会话[${sessionId}]，请先发送 tts:close`
                )
            }

            log.infoMsg(`TTS session starting: speaker=${speaker || 'default'}`)

            if (session.tts.getState() === TTSState.Disconnected) {
                log.infoMsg('Upstream websocket disconnected, reconnect before start')
                await session.tts.connect()
            }

            session.currentSessionId = sessionId
            session.audioIndex = 0
            session.textLength = 0
            session.sessionStartTime = Date.now()
            session.firstPushTime = undefined
            session.firstAudioTime = undefined

            await session.tts.start(sessionId, speaker, emotion, language, loudness_rate, speech_rate)

            const response: TTSStartResponse = {
                success: true,
                sessionId,
                speaker: session.speaker,
                traceId
            }
            socket.emit('tts:started', response)
            log.infoMsg('TTS session started')
        } catch (error) {
            log.errorMsg('Failed to start TTS session', { errorMsg: error })

            // 启动失败要回滚活跃会话，否则后续会话无法开启
            if (session.currentSessionId === sessionId) {
                this.resetSession(session)
            }

            const response: TTSStartResponse = {
                success: false,
                sessionId,
                error: this.errorMessage(error),
                traceId
            }
            socket.emit('tts:started', response)
        }
    }

    private async handlePush(socket: TTSSocket, req: TTSPushRequest) {
        const { sessionId, text, traceId } = req || ({} as TTSPushRequest)

        const session = this.sessions.get(socket.id)
        if (!session) {
            this.sendError(socket, '尚未建立 TTS 连接，请先发送 tts:connect', sessionId, traceId)
            return
        }

        try {
            if (session.currentSessionId !== sessionId) {
                throw new Error(`会话[${sessionId}]未开启或已关闭，无法推送文本`)
            }
            if (!text) return

            if (!session.firstPushTime) {
                session.firstPushTime = Date.now()
            }
            session.textLength += text.length

            await session.tts.push(sessionId, text)
        } catch (error) {
            log.errorMsg('Failed to push text', { errorMsg: error })
            this.sendError(socket, this.errorMessage(error), sessionId, traceId)
        }
    }

    private async handleClose(socket: TTSSocket, req: TTSCloseRequest) {
        const { sessionId, traceId } = req || ({} as TTSCloseRequest)

        const session = this.sessions.get(socket.id)
        if (!session) {
            this.sendError(socket, '尚未建立 TTS 连接，请先发送 tts:connect', sessionId, traceId)
            return
        }

        // 会话已关闭时保持幂等，直接回 end，避免客户端一直等待
        if (session.currentSessionId !== sessionId) {
            log.warnMsg(`Session[${sessionId}] not active, respond tts:end directly`)
            socket.emit('tts:end', { success: true, sessionId, index: session.audioIndex, traceId })
            return
        }

        try {
            log.infoMsg('TTS session closing')
            // tts:end 由上游 'closed' 事件统一下发，保证音频全部发完后才通知客户端
            await session.tts.close(sessionId)
        } catch (error) {
            log.errorMsg('Failed to close TTS session', { errorMsg: error })

            const stillActive = session.currentSessionId === sessionId
            if (stillActive) {
                const index = session.audioIndex
                this.resetSession(session)
                socket.emit('tts:end', {
                    success: false,
                    sessionId,
                    index,
                    error: this.errorMessage(error),
                    traceId
                })
            }
        }
    }

    private async handleDisconnect(socket: TTSSocket) {
        const session = this.sessions.get(socket.id)
        if (!session) return

        // 先摘除注册表，避免断开过程中被重复处理
        this.sessions.delete(socket.id)

        try {
            log.infoMsg('TTS disconnecting')
            await session.tts.disconnect()
        } catch (error) {
            log.errorMsg('Failed to disconnect TTS', { errorMsg: error })
        } finally {
            session.tts.removeAllListeners()
        }
    }

    private handleInterrupt(socket: TTSSocket) {
        const session = this.sessions.get(socket.id)
        if (!session) return

        try {
            log.infoMsg('TTS interrupting upstream websocket, Socket.IO session kept')
            session.tts.interrupt()
        } catch (error) {
            log.errorMsg('Failed to interrupt TTS', { errorMsg: error })
        } finally {
            this.resetSession(session)
        }
    }

    private handleSocketDisconnect(socket: TTSSocket) {
        log.info(`Client disconnected: ${socket.id}`)

        const session = this.sessions.get(socket.id)
        if (!session) return

        this.sessions.delete(socket.id)

        // 客户端已经走了，尽量优雅释放上游连接，失败则强制中断
        session.tts
            .disconnect()
            .catch(error => {
                log.errorMsg('Graceful disconnect failed on socket disconnect, force interrupt', {
                    deviceSN: session.deviceSN,
                    errorMsg: error
                })
                try {
                    session.tts.interrupt()
                } catch {
                    // 已经断开，忽略
                }
            })
            .finally(() => {
                session.tts.removeAllListeners()
            })
    }

    /**
     * 会话级状态复位（连接与监听器保持不变）
     */
    private resetSession(session: SessionInfo) {
        session.currentSessionId = ''
        session.audioIndex = 0
        session.textLength = 0
        session.sessionStartTime = undefined
        session.firstPushTime = undefined
        session.firstAudioTime = undefined
    }

    private sendError(socket: TTSSocket, error: string, sessionId?: string, traceId?: string, details?: any) {
        const response: TTSErrorResponse = {
            success: false,
            error,
            sessionId,
            traceId,
            details
        }
        socket.emit('tts:error', response)
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    /**
     * 打印单个会话的合成耗时统计
     */
    private logSessionTiming(session: SessionInfo, sessionId: string) {
        const { sessionStartTime, firstPushTime, firstAudioTime, audioIndex, textLength } = session
        if (!sessionStartTime) return

        const endTime = Date.now()
        const firstAudioLatency = firstAudioTime && firstPushTime ? firstAudioTime - firstPushTime : null

        log.infoMsg(
            [
                `TTS session ended: ${sessionId}`,
                `文本长度=${textLength}`,
                `音频块=${audioIndex}`,
                `首包延迟=${firstAudioLatency !== null ? firstAudioLatency + 'ms' : 'N/A'}`,
                `会话总时长=${endTime - sessionStartTime}ms`
            ].join(' | ')
        )
    }
}
