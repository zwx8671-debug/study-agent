/** @format */
import { getInstanceByToken } from 'fastify-decorators'
import { ChatModel, ChatModelProvider, ChatRoleEnum } from 'uniai'
import AgentService from '@service/AgentService'
import {
    type ChatAssistantResponse,
    type ChatRequest,
    ChatUserResponse,
    DeviceErrorStateNotify,
    DeviceInfoRequest,
    DeviceResourcePromptSyncRequest,
    DeviceStateNotify,
    DeviceStateSyncRequest,
    type DoneRequest,
    DoneResponse,
    FaceRequest,
    InterruptNotifyRequest,
    type JoinRequest,
    NotifyEvent,
    PttRequest,
    RelayEvent,
    RelayRequest,
    RequestEvent,
    ResponseEvent,
    ResponseFlag,
    SingleFace,
    SyncEvent,
    SyncRequest,
    SyncResponse
} from '@interface/IAgent'
import {
    AudioResponse,
    AuthType,
    ChatXml2Result,
    CoCoNamespace,
    CODE,
    ConnectedResponse,
    DisConnectedResponse,
    SocketResponse,
    SpaceUserInfoSyncNotifyEvent
} from '@interface/ICommon'
import { CocoSocket, OnConnect, OnDisconnect, SocketEvent, SocketNamespace } from '@utils/socket-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import $ from '@utils/util'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { DeviceConnectionRedisService } from '@service/redis/DeviceConnectionRedisService'
import { DeviceStateRedisService } from '@service/redis/DeviceStateRedisService'
import { DeviceResourcePromptRedisService } from '@service/redis/DeviceResourcePromptRedisService'
import { auth } from '@middlewares/socket-auth.middleware'
import { DeviceService } from '@service/DeviceService'
import { v7 as uuidv7 } from 'uuid'
import { serverInstance } from '@utils/ServerInstance'
import { DeviceFaceService, FaceData } from '@service/DeviceFaceService'
import { env } from '@config/env'
import { traceContext } from '@utils/TraceContext'
import { ChatBuffer } from '@service/dto/IAgent.dto'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@service/ConfigService'
import { LLMStreamHandler } from '@service/agent/LLMStreamHandler'
import { AudioStreamHandler } from '@service/agent/AudioStreamHandler'
import { metricsLogger } from '@utils/MetricsLogger'
import { TTSService } from '@service/TTSService'

@SocketNamespace(CoCoNamespace.Agent, [auth])
export default class AgentSocket {
    private readonly log: Logger = getLogger(AgentSocket.name)

    private deviceService: DeviceService = getInstanceByToken<DeviceService>(DeviceService)
    private agentService: AgentService = getInstanceByToken<AgentService>(AgentService)
    private deviceConnectionService: DeviceConnectionRedisService =
        getInstanceByToken<DeviceConnectionRedisService>(DeviceConnectionRedisService)
    private deviceFaceService: DeviceFaceService = getInstanceByToken<DeviceFaceService>(DeviceFaceService)
    private deviceState: DeviceStateRedisService = getInstanceByToken<DeviceStateRedisService>(DeviceStateRedisService)
    private deviceResourcePrompt: DeviceResourcePromptRedisService =
        getInstanceByToken<DeviceResourcePromptRedisService>(DeviceResourcePromptRedisService)

    @OnConnect()
    async connected(socket: CocoSocket) {
        try {
            // 连接到这里时，握手鉴权已通过（@Use ConnectionMiddleware）
            SocketCommonResponse.success<ConnectedResponse>({
                socket,
                event: ResponseEvent.CONNECT,
                data: { namespace: socket.nsp.name, socketId: socket.id },
                msg: 'Success to connect to socket'
            })

            this.join(socket, { traceId: traceContext.getTraceId(), device: socket.data.device!.deviceSN }).catch(e => {
                SocketCommonResponse.error({ socket, event: ResponseEvent.JOIN, msg: (e as Error).message })
                this.log.errorMsg('Error processing Socket.IO connect message:', { errorMsg: e })
            })
        } catch (e) {
            SocketCommonResponse.error({ socket, event: ResponseEvent.CONNECT, msg: (e as Error).message })
            this.log.errorMsg('Error processing Socket.IO connect message:', { errorMsg: e })
        }
    }

    /**
     * 计算时延
     * @param socket
     * @param data
     * @param callback
     */
    @SocketEvent(RequestEvent.RTT)
    async rtt(socket: CocoSocket, data: any, callback: () => void) {
        if (callback) {
            callback()
        }

        if (socket.data.authType === AuthType.client && socket.data.device) {
            // 更新设备房间的TTL
            this.deviceConnectionService.updateRoomTTL(socket.data.device.deviceSN).catch(error => {
                this.log.errorMsg('Error updating room TTL:', { errorMsg: error })
            })
        }
    }

    async join(socket: CocoSocket, req: JoinRequest) {
        const authType = socket.data.authType
        // 获取客户端IP地址
        const clientIP = $.getClientIP(socket)
        if (authType == AuthType.web) {
            // 检查设备是否在线
            const roomMaps = serverInstance.getIO().of(socket.nsp.name).adapter.rooms
            if (!roomMaps.has(req.device)) {
                SocketCommonResponse.error({
                    socket,
                    event: ResponseEvent.JOIN,
                    data: socket.data,
                    msg: `NS[${socket.nsp.name}] room[${req.device}] 不存在`
                })
                this.log.warnMsg(`NS[${socket.nsp.name}] room[${req.device}] 不存在`)
                return
            }
            // 更新设备和Socket的关联关系
            await this.deviceConnectionService.addRoomSocket(req.device, socket.id, clientIP)
        }

        if (authType == AuthType.client) {
            const device = socket.data.device!
            if (req.device !== device.deviceSN) {
                throw new Error('Device SN not right')
            }
            // redis 更新设备在线状态
            await this.deviceConnectionService.addRoomSocket(device.deviceSN, socket.id, clientIP)
        }

        // 加入聊天房间
        socket.join(req.device)

        // 获取历史聊天记录
        // const response: JoinResponse = await this.agentService.history(req)
        const msg = `${authType} ${socket.id} joined: ${req.device}，serverName:${env.SERVICE_NAME}`

        SocketCommonResponse.success<boolean>({ socket, event: ResponseEvent.JOIN, data: true, msg })

        this.log.infoMsg(msg)
    }

    /**
     *  TODO 前端和客户端都应该每次请求携带traceId，尤其是STT，每次的STT traceId 都应该相同
     * @param socket
     * @param req
     */
    @SocketEvent(RequestEvent.CHAT)
    async chat(socket: CocoSocket, req: ChatRequest) {
        try {
            const deviceSN = socket.data.device!.deviceSN
            const productId = socket.data.device!.deviceInfo.productId!

            // 方法1：处理输入（文本、图片、音频）阶段
            const buffer = await this.agentService.processInput(req, deviceSN, productId)

            // 如果不是结束标志，直接返回（等待后续音频包）
            if (!buffer) return

            // 发回发件人的请求消息（STT 阶段结束后调用）
            this.receiveMsg(socket, req, buffer)

            // 确定大模型
            req.provider = (req.provider || DEFAULT_PROVIDER) as ChatModelProvider
            req.model = (req.model || DEFAULT_MODEL) as ChatModel

            // 方法2：处理 大模型所需数据 阶段
            const res = await this.agentService.processData(req, buffer, deviceSN)

            // 方法3：提前建立好 大模型所需连接 阶段
            const session = await this.agentService.processConnection(req, deviceSN, res.agent, res.messages)

            if (!session) {
                SocketCommonResponse.error({
                    socket,
                    event: ResponseEvent.CHAT,
                    data: null,
                    msg: `建立模型、TTS链接失败`
                })
                return
            }

            // --------------------- 这里之后不会再有用户输入进来 ---------------------

            // 方法4：在LLM输出前挂载 TTS 监听，监听LLM输出并输出音频
            if (env.ENABLE_TTS) {
                this.agentService.processTTS(deviceSN, session.socketAudioStream, session.socketLlmStream, session.tts!)
            }

            // 方法4：处理 大模型回复 阶段
            this.agentService.processLLM(req, deviceSN, res.agent, res.messages, session).then(text => {
                this.log.infoMsg(`AI assistant response : ${text}`)
            })

            // 发送第一个响应
            const responseData = this.oneMsg(socket)

            // 使用 LLMStreamHandler 处理 llmStream，监听LLM输出并输出socketIO事件
            const llmStreamHandler = new LLMStreamHandler()
            llmStreamHandler.handle(session.socketLlmStream, socket, req, deviceSN, responseData)

            // 使用 AudioStreamHandler 处理 audioStream
            if (env.ENABLE_TTS) {
                const audioStreamHandler = new AudioStreamHandler()
                audioStreamHandler.handle(session.socketAudioStream, socket, deviceSN)
            } else {
                // 当TTS关闭时，在这里调用埋点指标
                // 【埋点】输出完整的 Chat 性能指标
                session.socketLlmStream.once('end', () => {
                    metricsLogger.logChatMetrics(true)
                })

                session.socketLlmStream.once('error', (e: Error) => {
                    metricsLogger.logChatMetrics(false, e.message)
                })
            }
        } catch (e) {
            // 【埋点】输出完整的 Chat 性能指标（异常）
            metricsLogger.logChatMetrics(false, (e as Error).message)
            this.errorMsg(socket, req, e as Error)
        }
    }

    /**
     *  机器人完成请求，或者聊天打断。
     *  针对聊天打断，需要将信息广播给web，方便截取文字。
     *  目前是所有情况都广播
     * @param socket
     * @param req
     * @param callback
     */
    @SocketEvent(RequestEvent.DONE)
    async done(socket: CocoSocket, req: DoneRequest, callback: (arg: SocketResponse<boolean>) => void) {
        const startTime = Date.now()
        this.log.infoMsg(`【Done事件】开始处理,idx${req.idx}interrupt${req.interrupt}reason${req.reason}`)

        const deviceSN = socket.data.device!.deviceSN
        try {
            // 处理机器人执行完成的情况
            // 这代表LLM生成完，机器人执行完（保存完整的）
            if (!req.reason) {
                req.reason = '用户打断'
            }

            this.log.infoMsg(`【Done事件】调用 interrupt 方法`)
            const res = await this.agentService.done(deviceSN, `打断原因：${req.reason}`, req.idx, req.interrupt)
            this.log.infoMsg(
                `【Done事件】interrupt 方法执行完成，耗时: ${Date.now() - startTime}ms hasResult: ${!!res}`
            )

            let data: ChatAssistantResponse[] | null = null
            if (res) {
                data = res
                    // 转为ChatAssistantResponse
                    .filter(item => !item.audio)
                    .map<ChatAssistantResponse>(item => ({
                        id: item.id!,
                        role: ChatRoleEnum.ASSISTANT,
                        image: item.image,
                        name: item.name,
                        pattern: item.pattern,
                        params: item.params,
                        text: item.text,
                        token: item.token,
                        flag: ResponseFlag.END,
                        timestamp: Date.now()
                    }))
            }

            // 响应给（WEB）客户端
            const msg = data ? `Done chat for device: ${deviceSN}` : `No active chat for device: ${deviceSN}`
            SocketCommonResponse.successTo<DoneResponse>({
                authType: AuthType.web,
                ns: CoCoNamespace.Agent,
                event: ResponseEvent.DONE,
                msg,
                room: deviceSN,
                data: {
                    data,
                    interrupt: req.interrupt,
                    reason: req.reason,
                    idx: req.idx
                }
            })

            // ack机制 机器人对接
            if (callback) {
                this.log.infoMsg(`【Done事件】执行 callback，总耗时: ${Date.now() - startTime}ms`)
                callback({ code: CODE.SUCCESS, data: !!data, msg: Date.now().toString() })
            }
        } catch (e) {
            this.log.errorMsg(
                `【Done事件】Error processing Socket.IO done message:duration: ${Date.now() - startTime}ms`,
                { errorMsg: e }
            )

            // ack机制 机器人对接
            if (callback) {
                this.log.errorMsg(`【Done事件】[${deviceSN}] Error in done callback:`, { errorMsg: e })
                callback({ code: CODE.ERROR, msg: (e as Error).message || 'Done processing error', data: true })
            }
        }
    }

    /**
     * web发起打断
     * @param socket
     * @param req
     * @param callback
     */
    @SocketEvent(NotifyEvent.APP_INTERRUPT)
    async appInterruptNotify(
        socket: CocoSocket,
        req: InterruptNotifyRequest,
        callback: (arg: SocketResponse<boolean>) => void
    ) {
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(
            CoCoNamespace.Agent,
            socket.data.device!.deviceSN
        )

        if (deviceSocket) {
            SocketCommonResponse.successEmitWithAck<InterruptNotifyRequest>(
                NotifyEvent.APP_INTERRUPT,
                deviceSocket,
                '转发',
                req
            ).then(res => {
                // 处理设备响应结果
                if (callback) {
                    callback(res)
                }
            })
            this.log.infoMsg(
                `转发 interruptDevice Interrupt device, req: ${JSON.stringify(req)}, socketId: ${socket.id}`
            )
        } else {
            if (callback) {
                callback({ code: CODE.ERROR, msg: '设备未连接', data: false })
            }
        }
    }

    /**
     * 设备同步状态机信息给网页
     * @param socket
     * @param req
     */
    @SocketEvent(NotifyEvent.DEVICE_STATE)
    async deviceStateNotify(socket: CocoSocket, req: DeviceStateNotify) {
        SocketCommonResponse.successTo({
            authType: AuthType.web,
            data: req,
            ns: CoCoNamespace.Agent,
            room: socket.data.device!.deviceSN,
            event: NotifyEvent.DEVICE_STATE,
            msg: '转发'
        })
    }

    /**
     * 设备同步异常信息给网页
     * @param socket
     * @param req
     */
    @SocketEvent(NotifyEvent.DEVICE_ERROR_STATE)
    async deviceErrorStateNotify(socket: CocoSocket, req: DeviceErrorStateNotify) {
        SocketCommonResponse.successTo({
            authType: AuthType.web,
            data: req,
            ns: CoCoNamespace.Agent,
            room: socket.data.device!.deviceSN,
            event: NotifyEvent.DEVICE_ERROR_STATE,
            msg: '转发'
        })
    }

    /**
     * 存储技能同步事件处理函数，俩个ACK一次性返回给客户端
     * @param socket
     * @param req
     * @param callback
     */
    @SocketEvent(SyncEvent.RUNNER_SYNC)
    async storeAiRunner(socket: CocoSocket, req: SyncRequest, callback: (arg: SocketResponse<boolean>) => void) {
        // 验证设备身份
        if (socket.data.authType !== AuthType.web || !socket.data.device) {
            throw new Error('Only web clients can sync runner')
        }

        let result: ChatXml2Result = { audioFuncTokens: { id: '', audio: [] }, textFuncTokens: [] }
        if (!(req.type === 'del' || req.type === 'disable')) {
            result = await TTSService.parseByLoopWithAudio(req.data, false, '', '', '')
        }

        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(
            CoCoNamespace.Agent,
            socket.data.device!.deviceSN
        )

        if (deviceSocket) {
            SocketCommonResponse.successEmitWithAck<SyncResponse>(SyncEvent.RUNNER_SYNC, deviceSocket, '转发', {
                id: traceContext.getTraceId(),
                type: req.type,
                data: result.textFuncTokens,
                name: req.name
            }).then(res => {
                // 处理设备响应结果
                callback(res)
            })

            // chat:audio 发送音频
            if (result.audioFuncTokens && result.audioFuncTokens.audio) {
                SocketCommonResponse.successTo<AudioResponse>({
                    authType: AuthType.client,
                    data: result.audioFuncTokens,
                    ns: CoCoNamespace.Agent,
                    room: socket.data.device!.deviceSN,
                    event: ResponseEvent.CHAT_AUDIO,
                    msg: ''
                })
            }
        } else {
            callback({
                code: CODE.ERROR,
                msg: '设备未连接',
                data: false
            })
        }
    }

    @SocketEvent(SyncEvent.DEVICE_FACE)
    async deviceFace(socket: CocoSocket, req: FaceRequest, callback: (arg: SocketResponse<boolean>) => void) {
        try {
            // 验证设备身份
            if (socket.data.authType !== AuthType.client || !socket.data.device) {
                throw new Error('Only device clients can sync faces')
            }

            const deviceSN = socket.data.device.deviceSN
            this.log.infoMsg(`Syncing faces for device: ${deviceSN}`)

            // 转换数据格式
            const faceData: FaceData[] = req.data.map((face: SingleFace) => ({
                name: face.name,
                threeId: face.id
            }))

            // 调用服务层同步人脸数据
            await this.deviceFaceService.syncDeviceFaces(deviceSN, faceData)

            // 回调确认
            if (callback) {
                callback({ code: CODE.SUCCESS, data: true, msg: 'Faces synced successfully' })
            }
        } catch (error: any) {
            this.log.errorMsg('Error syncing device faces:', { errorMsg: error })
            if (callback) {
                callback({ code: CODE.ERROR, data: false, msg: error.message || 'Failed to sync faces' })
            }
        }
    }

    @SocketEvent(NotifyEvent.PTT)
    async ptt(socket: CocoSocket, req: PttRequest) {
        SocketCommonResponse.successTo<PttRequest>({
            authType: AuthType.client,
            ns: CoCoNamespace.Agent,
            event: NotifyEvent.PTT,
            data: req,
            msg: '',
            room: socket.data.device!.deviceSN
        })
    }

    /**
     * 前端请求设备的 信息，主要是IP信息
     * @param socket
     * @param req
     * @param callback
     */
    @SocketEvent(SyncEvent.DEVICE_INFO)
    async deviceInfo(socket: CocoSocket, req: any, callback: (arg: SocketResponse<DeviceInfoRequest>) => void) {
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(
            CoCoNamespace.Agent,
            socket.data.device!.deviceSN
        )

        if (deviceSocket) {
            SocketCommonResponse.successEmitWithAck<any>(SyncEvent.DEVICE_INFO, deviceSocket, '', req).then(
                (res: SocketResponse<DeviceInfoRequest>) => {
                    if (callback) {
                        // 处理设备响应结果
                        callback(res)
                    }
                }
            )
            this.log.infoMsg(
                `转发 interruptDevice Interrupt device, req: ${JSON.stringify(req)}, socketId: ${socket.id}`
            )
        } else {
            callback({
                code: CODE.ERROR,
                msg: '设备未连接',
                data: {
                    ip: []
                }
            })
        }
    }

    /**
     * 设备状态同步事件处理函数
     * @param socket - WebSocket连接对象，包含认证信息和设备数据
     * @param req - 状态同步请求对象，包含操作类型和状态数据数组
     */
    @SocketEvent(SyncEvent.DEVICE_STATE)
    async syncStateData(socket: CocoSocket, req: DeviceStateSyncRequest) {
        try {
            // 验证设备身份
            if (socket.data.authType !== AuthType.client || !socket.data.device) {
                throw new Error('Only device clients can sync state')
            }

            const deviceSN = socket.data.device.deviceSN
            this.log.infoMsg(`Syncing state for device: ${deviceSN}, type: ${req.type}, count: ${req.stateData.length}`)

            // 根据操作类型处理状态数据
            if (req.type === 'delete') {
                // 删除操作：遍历删除每个状态
                for (const state of req.stateData) {
                    await this.deviceState.deleteState(deviceSN, state.name)
                }
            } else {
                // 添加或更新操作：遍历保存每个状态
                for (const state of req.stateData) {
                    await this.deviceState.setState(deviceSN, state.name, state)
                }
            }

            this.log.infoMsg(`State sync completed for device: ${deviceSN}`)
        } catch (error: any) {
            this.log.errorMsg('Error syncing device state:', { errorMsg: error })
            throw error
        }
    }

    /**
     * 设备提示词同步事件处理函数
     * @param socket - WebSocket连接对象，包含认证信息和设备数据
     * @param req - 提示词同步请求对象，包含操作类型和提示词数据数组
     */
    @SocketEvent(SyncEvent.DEVICE_PROMPT)
    async syncPrompt(socket: CocoSocket, req: DeviceResourcePromptSyncRequest) {
        try {
            // 验证设备身份
            if (socket.data.authType !== AuthType.client || !socket.data.device) {
                throw new Error('Only device clients can sync prompt')
            }

            const deviceSN = socket.data.device.deviceSN
            this.log.infoMsg(`Syncing prompt for device: ${deviceSN}, type: ${req.type}, count: ${req.data.length}`)

            // 根据操作类型处理提示词数据
            if (req.type === 'delete') {
                // 删除操作：遍历删除每个提示词
                for (const prompt of req.data) {
                    await this.deviceResourcePrompt.deletePrompt(deviceSN, prompt.key)
                }
            } else {
                // 更新操作：遍历保存每个提示词
                for (const prompt of req.data) {
                    await this.deviceResourcePrompt.setPrompt(deviceSN, prompt.key, prompt)
                }
            }

            this.log.infoMsg(`Prompt sync completed for device: ${deviceSN}`)
        } catch (error: any) {
            this.log.errorMsg('Error syncing device prompt:', { errorMsg: error })
            throw error
        }
    }

    /**
     * 客户端到网页的透传事件处理函数
     * 机器人（client）调用此事件，广播给所有web端
     * @param socket - WebSocket连接对象
     * @param req - 透传请求对象，包含type和data字段
     */
    @SocketEvent(RelayEvent.CLIENT_TO_WEB)
    async clientToWebRelay(socket: CocoSocket, req: RelayRequest) {
        try {
            // 验证是客户端调用
            if (socket.data.authType !== AuthType.client || !socket.data.device) {
                throw new Error('Only client can relay to web')
            }

            const deviceSN = socket.data.device.deviceSN

            // 构造原始数据
            const relayData: RelayRequest = {
                type: req.type,
                data: req.data,
                timestamp: req.timestamp || Date.now()
            }

            // 获取房间内的所有socket，只广播给web端
            const sockets = await serverInstance.getIO().of(socket.nsp.name).local.in(deviceSN).fetchSockets()

            for (const sock of sockets) {
                if (sock.data.authType === AuthType.web) {
                    sock.emit(RelayEvent.CLIENT_TO_WEB, relayData)
                }
            }

            this.log.infoMsg(`Client relay to web: deviceSN=${deviceSN}, type=${req.type}`)
        } catch (error: any) {
            this.log.errorMsg('Error in client to web relay:', { errorMsg: error })
            throw error
        }
    }

    /**
     * 网页到客户端的透传事件处理函数
     * 网页（web）调用此事件，转发给机器人（client）
     * @param socket - WebSocket连接对象
     * @param req - 透传请求对象，包含type和data字段
     * @param callback - 可选的ACK回调函数
     */
    @SocketEvent(RelayEvent.WEB_TO_CLIENT)
    async webToClientRelay(socket: CocoSocket, req: RelayRequest, callback?: (arg: any) => void) {
        try {
            // 验证是网页端调用
            if (socket.data.authType !== AuthType.web || !socket.data.device) {
                throw new Error('Only web can relay to client')
            }

            const deviceSN = socket.data.device.deviceSN

            // 获取设备socket
            const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.Agent, deviceSN)

            if (deviceSocket) {
                // 构造原始数据
                const relayData: RelayRequest = {
                    type: req.type,
                    data: req.data,
                    timestamp: req.timestamp || Date.now()
                }

                // 如果需要ACK确认
                if (callback) {
                    try {
                        const result = await deviceSocket.timeout(5000).emitWithAck(RelayEvent.WEB_TO_CLIENT, relayData)
                        this.log.infoMsg(`Client relay : ${result}`)
                        callback(result)
                    } catch (error) {
                        this.log.errorMsg('Error in ACK callback:', { errorMsg: error })
                        callback({ error: 'ACK timeout or error' })
                    }
                } else {
                    // 不需要ACK，直接转发
                    deviceSocket.emit(RelayEvent.WEB_TO_CLIENT, relayData)
                }

                this.log.infoMsg(`Web relay to client: deviceSN=${deviceSN}, type=${req.type}`)
            } else {
                if (callback) {
                    callback({ error: '设备未连接' })
                }
                this.log.warnMsg(`Web relay to client failed: device not connected, deviceSN=${deviceSN}`)
            }
        } catch (e) {
            this.log.errorMsg('Error in web to client relay:', { errorMsg: e })
            if (callback) {
                callback({ error: (e as Error).message })
            }
        }
    }

    /**
     * 重置设备
     */
    @SocketEvent(RequestEvent.RESET_DEVICE)
    async resetDevice(socket: CocoSocket, req: { deviceSNs: string[] }) {
        await this.agentService.notifyResetDevice0(req.deviceSNs)
    }

    /**
     * 通知拉取秘钥
     */
    @SocketEvent(SpaceUserInfoSyncNotifyEvent.PULL_AES_KEY)
    async notifyPullAESKey(socket: CocoSocket, req: { spaceId: string; deviceSNs: string[] }) {
        await this.agentService.notifyPullAESKey0(req.spaceId, req.deviceSNs)
    }

    @OnDisconnect()
    async disconnect(socket: CocoSocket, reason: string) {
        try {
            // 设备下线逻辑
            const authType = socket.data.authType
            const device = socket.data.device!
            this.log.infoMsg(`authType[${authType}] [${socket.id}] [${device?.deviceSN}] 断开连接, reason: ${reason}`)

            if (authType === AuthType.client) {
                SocketCommonResponse.success<DisConnectedResponse>({
                    socket,
                    event: ResponseEvent.DEVICE_OFFLINE,
                    data: {
                        timestamp: new Date().toISOString(),
                        reason,
                        deviceSN: device.deviceSN,
                        deviceId: device.deviceInfo.id
                    },
                    msg: 'Device disconnected',
                    room: device.deviceSN
                })

                // 如果是设备下线，则删除设备Socket映射
                await this.deviceConnectionService.delRoomSocketMapping(device.deviceSN)

                // 删除设备的所有状态数据
                await this.deviceState.deleteAllStates(device.deviceSN)

                // 删除设备的所有提示词数据
                await this.deviceResourcePrompt.deleteAllPrompts(device.deviceSN)

                // 【清理整个房间】 当机器人离开后，断开其他房间内的Socket
                serverInstance
                    .getIO()
                    .of(env.PATH_PREFIX + CoCoNamespace.Agent)
                    .socketsLeave(device.deviceSN)
            } else {
                // web 用户下线逻辑
                if (device && device.deviceSN) {
                    await this.deviceConnectionService.removeRoomSocketMapping(
                        device.deviceSN,
                        socket.id,
                        $.getClientIP(socket)
                    )
                }
            }
            this.log.warnMsg(
                `【断连】[${socket.data.authType}(${socket.id})] disconnected from agent, reason: ${reason}`
            )
        } catch (e) {
            this.log.errorMsg(`【断连】Error handling disconnect(${reason}) for socket ${socket.id}:`, { errorMsg: e })
        }
    }

    /**
     * 接收用户消息
     * @param socket
     * @param req
     * @param buffer
     * @private
     */
    private receiveMsg(socket: CocoSocket, req: ChatRequest, buffer: ChatBuffer) {
        SocketCommonResponse.success<ChatUserResponse>({
            socket,
            room: socket.data.device!.deviceSN,
            event: ResponseEvent.CHAT,
            data: {
                id: uuidv7(),
                role: ChatRoleEnum.USER,
                text: buffer.text,
                image: buffer.image,
                flag: ResponseFlag.END,
                timestamp: Date.now()
            },
            msg: 'This is your request message'
        })
    }

    /**
     * 发送第一个响应
     * @param socket
     * @private
     */
    private oneMsg(socket: CocoSocket) {
        const responseData: ChatAssistantResponse = {
            id: traceContext.getTraceId(),
            role: ChatRoleEnum.ASSISTANT,
            flag: ResponseFlag.START,
            timestamp: Date.now()
        }

        SocketCommonResponse.success<ChatAssistantResponse>({
            socket,
            room: socket.data.device!.deviceSN,
            event: ResponseEvent.CHAT,
            data: responseData,
            msg: 'Chat stream started'
        })
        return responseData
    }

    /**
     * 聊天流错误
     * @param socket
     * @param req
     * @param e
     * @private
     */
    private errorMsg(socket: CocoSocket, req: ChatRequest, e: Error) {
        SocketCommonResponse.error({
            socket,
            room: socket.data.device!.deviceSN,
            event: ResponseEvent.CHAT,
            msg: e.message
        })
    }
}
