/** @format */
import { CocoSocket, OnConnect, OnDisconnect, SocketEvent, SocketNamespace } from '@utils/socket-decorators'
import { AudioFlag, JoinResponse, ResponseEvent, ResponseFlag } from '@interface/IAgent'
import { auth } from '@middlewares/socket-auth.middleware'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { AudioResponse, AuthType, CoCoNamespace } from '@interface/ICommon'
import { getLogger, Logger } from '@utils/Logger'
import { TTSBaseService } from '../libs/voice/TTSBaseService'
import { TTSFactory } from '../libs/voice/TTSFactory'
import { VOICE_TTS_FORMAT, VOICE_TTS_SAMPLE_RATE } from '../libs/voice/volcengine/config-volcengine'
import { Buffer } from 'buffer'
import { env } from '@config/env'
import { AudioRequestEvent, AudioResponseEvent, STTRequest, STTResponse, TTSRequest } from '@interface/IAgentAudio'
import { STTFactory } from '../libs/voice/STTFactory'
import { ChatBuffer } from '@service/dto/IAgent.dto'

/**
 * TTS 会话接口
 */
interface TTSSession {
    tts: TTSBaseService // TTS 服务实例
    audioIndex: number // 音频块索引
    connectPromise?: Promise<void> // 连接初始化 Promise
}

@SocketNamespace(CoCoNamespace.AgentAudio, [auth])
export class AgentAudioSocket {
    private log: Logger = getLogger(AgentAudioSocket.name)
    /** TTS 会话映射表，key 为 TTSRequest.id */
    private ttsSessionMap: Map<string, TTSSession> = new Map()

    /**
     * 聊天缓冲区映射，key为设备ID，value为缓冲区数据
     * 没有做锁，是因为当为一个特性，多个窗口可以合并输入
     * */
    private buffer: Map<string, ChatBuffer> = new Map()

    @OnConnect()
    async connected(socket: CocoSocket) {
        try {
            const authType = socket.data.authType
            if (authType === AuthType.client) {
                this.log.info(`Device connection with SN: ${socket.data.device?.deviceSN}`)
                socket.join(socket.data.device!.deviceSN)

                SocketCommonResponse.success<JoinResponse>({
                    socket,
                    event: AudioResponseEvent.JOIN,
                    data: null,
                    msg: `${authType} 设备连接成功`
                })
            }
        } catch (e) {
            SocketCommonResponse.error({ socket, event: AudioResponseEvent.CONNECT, msg: (e as Error).message })
            this.log.error('Error processing Socket.IO connect message:', e)
        }
    }

    @OnDisconnect()
    async disconnect(socket: CocoSocket, reason: string) {
        const deviceSN = socket.data.device?.deviceSN
        if (deviceSN) {
            this.cleanupTTSSession(deviceSN)
        }
        this.log.warn(`【断连】[${socket.data.authType}(${socket.id})] disconnected, reason: ${reason}`)
    }

    /**
     * TTS 专用接口：文本转语音，支持流式
     * ✅ Promise存储模式：类似 STT 的 buffer.sttStartTask
     * @param socket - WebSocket连接对象
     * @param req - TTS请求对象
     */
    @SocketEvent(AudioRequestEvent.TTS)
    async tts(socket: CocoSocket, req: TTSRequest) {
        const deviceSN = socket.data.device!.deviceSN

        try {
            // 获取或创建会话
            let session = this.ttsSessionMap.get(req.traceId)

            if (!session) {
                // ========== 新建 TTS 会话 ==========
                this.log.infoMsg(`【TTS】设备 ${deviceSN} 创建新会话`, { traceId: req.traceId })

                // 1. 创建 TTS 实例（同步，快速）
                const tts = TTSFactory.createTTSFromConfig(deviceSN)

                // 2. 创建会话对象（同步，快速）
                session = { tts, audioIndex: 0 }

                // 3. 设置事件监听器（同步，快速）
                tts.on('data', (buffer: Buffer) => {
                    const audioResponse: AudioResponse = {
                        id: req.traceId,
                        audio: {
                            id: req.traceId,
                            index: session!.audioIndex,
                            flag: session!.audioIndex === 0 ? AudioFlag.START : AudioFlag.CHUNK,
                            base64: env.IS_BYTE ? buffer : buffer.toString('base64'),
                            format: VOICE_TTS_FORMAT,
                            sampleRate: VOICE_TTS_SAMPLE_RATE
                        }
                    }
                    session!.audioIndex++

                    SocketCommonResponse.success<AudioResponse>({
                        socket,
                        event: AudioResponseEvent.TTS,
                        data: audioResponse,
                        msg: 'TTS audio chunk'
                    })
                })

                tts.on('error', async (error: Error) => {
                    this.log.errorMsg(`【TTS】设备 ${deviceSN} TTS 错误`, { traceId: req.traceId, errorMsg: error })
                    // ✅ 关键修复：错误时断开连接
                    await tts.disconnect().catch(() => {})
                    this.ttsSessionMap.delete(req.traceId)
                    SocketCommonResponse.error({
                        socket,
                        event: AudioResponseEvent.TTS,
                        msg: error.message
                    })
                })

                // 4. ✅ 立即存入 Map（关键！防止竞态条件）
                this.ttsSessionMap.set(req.traceId, session)

                // 5. 启动异步连接（存储 Promise）
                session.connectPromise = (async () => {
                    await tts.connect()
                    await tts.start(
                        req.traceId,
                        req.speaker,
                        req.emotion,
                        req.language,
                        req.loudness_rate,
                        req.speech_rate
                    )
                    this.log.infoMsg(`【TTS】设备 ${deviceSN} 连接建立完成`, { traceId: req.traceId })
                })()
            }

            // ✅ 等待连接完成（如果还在连接中）
            if (session.connectPromise) {
                await session.connectPromise
                session.connectPromise = undefined // 连接完成后清除
            }

            // 推送文本
            if (req.text) {
                const text = req.flag === ResponseFlag.START ? req.text.trimStart() : req.text
                await session.tts.push(req.traceId, text)
                this.log.infoMsg(`【TTS】设备 ${deviceSN} 推送文本: ${text}`)
            }

            // 结束会话
            if (req.flag === ResponseFlag.END) {
                await session.tts.close(req.traceId)

                const audioResponse: AudioResponse = {
                    id: req.traceId,
                    audio: {
                        id: req.traceId,
                        index: session.audioIndex,
                        flag: AudioFlag.END,
                        base64: env.IS_BYTE ? Buffer.alloc(0) : '',
                        format: VOICE_TTS_FORMAT,
                        sampleRate: VOICE_TTS_SAMPLE_RATE
                    }
                }

                SocketCommonResponse.success<AudioResponse>({
                    socket,
                    event: AudioResponseEvent.TTS,
                    data: audioResponse,
                    msg: ''
                })

                await session.tts.disconnect()
                this.ttsSessionMap.delete(req.traceId)
                this.log.infoMsg(`【TTS】设备 ${deviceSN} TTS 会话结束`, { traceId: req.traceId })
            }
        } catch (e) {
            this.log.errorMsg(`【TTS】设备 ${deviceSN} 处理 TTS 请求错误`, { traceId: req.traceId, errorMsg: e })

            // ✅ 错误处理：清理连接
            const session = this.ttsSessionMap.get(req.traceId)
            if (session?.tts) {
                await session.tts.disconnect().catch(() => {})
            }
            this.ttsSessionMap.delete(req.traceId)

            SocketCommonResponse.error({
                socket,
                event: AudioResponseEvent.TTS,
                msg: (e as Error).message
            })
        }
    }

    @SocketEvent(AudioRequestEvent.STT)
    async stt(socket: CocoSocket, req: STTRequest) {
        try {
            // 获取设备信息
            const deviceSN = socket.data.device!.deviceSN

            // 调用 AgentService 处理 STT
            await this.processSTTOnly(socket, req, deviceSN)
        } catch (e) {
            this.log.errorMsg(`STT error for device:`, { errorMsg: e })
            SocketCommonResponse.error({
                socket,
                event: ResponseEvent.CHAT,
                msg: (e as Error).message
            })
        }
    }

    /**
     * 清理设备的所有 TTS 会话
     */
    private cleanupTTSSession(deviceSN: string) {
        for (const [sessionId, session] of this.ttsSessionMap.entries()) {
            session.tts.disconnect().catch(error => {
                this.log.errorMsg(`【TTS】清理会话 ${sessionId} 时断开连接失败:`, { errorMsg: error })
            })
            this.ttsSessionMap.delete(sessionId)
        }
        this.log.infoMsg(`【TTS】设备 ${deviceSN} 所有 TTS 会话已清理`)
    }

    /**
     * 处理纯 STT 请求（不涉及 LLM）
     * 实时将转录文本通过 Socket.IO 流式输出
     * @param socket Socket 连接对象
     * @param req STT 请求对象
     * @param deviceSN 设备序列号
     */
    async processSTTOnly(socket: CocoSocket, req: STTRequest, deviceSN: string): Promise<void> {
        const bufferKey = `stt_${deviceSN}`

        try {
            // 获取或创建 STT 专用缓冲区
            let buffer = this.buffer.get(bufferKey)

            if (!buffer) {
                buffer = {
                    id: deviceSN,
                    text: '',
                    audio: [],
                    image: [],
                    stateImage: [],
                    endtime: 0,
                    sttText: ''
                }
                this.buffer.set(bufferKey, buffer)
            }

            // 处理音频输入
            if (req.audio) {
                const audioData = Array.isArray(req.audio) ? req.audio : [req.audio]

                // 如果还没有 STT 实例，创建新的 STT 服务
                if (!buffer.stt) {
                    buffer.stt = STTFactory.createSTTFromConfig(deviceSN)
                        .on('starting', () => {
                            this.log.infoMsg(`STT starting for device: ${deviceSN}`)
                        })
                        .on('connecting', (uid, url) => {
                            this.log.infoMsg(`STT connecting ${url} for device: ${uid}`)
                        })
                        .on('connected', (uid, url) => {
                            this.log.infoMsg(`STT connected ${url} for device: ${uid}`)
                        })
                        .on('started', () => {
                            this.log.infoMsg(`STT started for device: ${deviceSN}`)
                        })
                        .on('closing', () => {
                            this.log.infoMsg(`STT closing for device: ${deviceSN}`)
                        })
                        .on('closed', () => {
                            this.log.infoMsg(`STT closed for device: ${deviceSN}`)
                        })
                        .on('disconnecting', uid => {
                            this.log.infoMsg(`STT disconnecting for device: ${uid}`)
                        })
                        .on('disconnected', (uid, code, reason) => {
                            this.log.infoMsg(`STT disconnected for device: ${uid}, code: ${code}, reason: ${reason}`)
                        })
                        .on('error', (error: Error) => {
                            this.log.errorMsg(`STT error for device ${deviceSN}:`, { errorMsg: error })
                            // STT 错误后自动清理缓冲区中 STT 实例
                            if (buffer.stt) {
                                buffer.stt.removeAllListeners()
                                buffer.stt.sttError = error
                            }
                        })
                        .on('data', (text: string) => {
                            // 实时更新 STT 识别结果
                            buffer.sttText = text

                            // 🔑 关键：将转录文本实时通过 Socket.IO 发送给客户端
                            SocketCommonResponse.success<STTResponse>({
                                socket,
                                event: AudioResponseEvent.STT,
                                data: {
                                    traceId: req.traceId,
                                    text: text,
                                    flag: ResponseFlag.CHUNK,
                                    timestamp: Date.now()
                                },
                                msg: 'STT transcription in progress'
                            })

                            this.log.infoMsg(`STT transcription update for device ${deviceSN}: "${text}"`)
                        })

                    // 启动 STT 服务
                    buffer.sttStartTask = buffer.stt.start(audioData[0].format).catch(error => {
                        this.log.errorMsg(`STT start failed for device ${deviceSN}:`, { errorMsg: error })
                        if (buffer.stt) {
                            buffer.stt.sttError = error
                        }
                        return buffer.stt!
                    })
                }

                // 处理音频数据
                buffer.audio.push(...audioData)

                // 将音频数据发送给 STT 进行识别
                for (let i = 0; i < audioData.length; i++) {
                    const audio = audioData[i]

                    // 检查是否有错误
                    const sttError = buffer.stt?.sttError
                    if (sttError) {
                        this.log.errorMsg(`设备 ${deviceSN} STT 错误:`, { errorMsg: sttError })
                        this.buffer.delete(bufferKey)
                        buffer.stt.disconnect()
                        buffer.stt.removeAllListeners()
                        throw sttError
                    }

                    if (audio.base64) {
                        if (Buffer.isBuffer(audio.base64)) {
                            buffer.stt.push(audio.base64)
                        } else {
                            buffer.stt.push(Buffer.from(audio.base64, 'base64'))
                        }
                    }
                }
            }

            // 如果是结束标志，关闭 STT 服务并发送最终结果
            if (req.end && buffer.stt) {
                // 等待 STT 服务启动完成
                await buffer.sttStartTask
                // 等待 STT 服务完成
                await buffer.stt.close()

                // 发送最终转录结果
                SocketCommonResponse.success<STTResponse>({
                    socket,
                    event: AudioResponseEvent.STT,
                    data: {
                        traceId: req.traceId,
                        text: buffer.sttText,
                        flag: ResponseFlag.END,
                        timestamp: Date.now()
                    },
                    msg: 'STT transcription completed'
                })

                this.log.infoMsg(`Final STT transcription for device ${deviceSN}: "${buffer.sttText}"`)

                // 清理资源
                buffer.stt.disconnect()
                buffer.stt.removeAllListeners()
                this.buffer.delete(bufferKey)
            }
        } catch (error) {
            // 统一错误处理
            this.log.errorMsg(`Error in processSTTOnly for device ${deviceSN}:`, { errorMsg: error })

            // 清理资源
            const buffer = this.buffer.get(bufferKey)
            if (buffer?.stt) {
                buffer.stt.disconnect()
                buffer.stt.removeAllListeners()
            }
            this.buffer.delete(bufferKey)

            // 重新抛出错误
            throw error
        }
    }
}
