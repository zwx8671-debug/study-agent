/** @format */

import { CocoSocket, OnConnect, OnDisconnect, SocketEvent, SocketNamespace } from '@utils/socket-decorators'
import { auth } from '@middlewares/socket-auth.middleware'
import { JoinResponse } from '@interface/IAgent'
import { getLogger, Logger } from '@utils/Logger'
import { AudioResponse, AuthType, ChatXml2Result, CoCoNamespace, CODE, SocketResponse } from '@interface/ICommon'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import {
    ChatTriggerReq,
    SyncEnum,
    TriggerListRequest,
    TriggerPromptReq,
    TriggerRequestEvent,
    TriggerResponseEvent,
    TriggerSyncRequest,
    TriggerSyncResponse,
    TriggerXmlRequest
} from '@interface/IAgentTrigger'
import { getInstanceByToken } from 'fastify-decorators'
import { TriggerPromptRedisService } from '@service/redis/TriggerPromptRedisService'
import { pomTriggerHttpdao } from '@httpdao/cocoadmin/PomTriggerHttpdao'
import PomAgentService from '@service/PomAgentService'
import { TriggerService } from '@service/TriggerService'
import { AgentTrigger } from '@service/agent/AgentTrigger'
import { TTSService } from '@service/TTSService'
import { traceContext } from '@utils/TraceContext'

@SocketNamespace(CoCoNamespace.AgentTrigger, [auth])
export default class AgentTriggerSocket {
    private logger: Logger = getLogger(AgentTriggerSocket.name)

    private triggerPrompt: TriggerPromptRedisService =
        getInstanceByToken<TriggerPromptRedisService>(TriggerPromptRedisService)
    private deviceAgentService: PomAgentService = getInstanceByToken<PomAgentService>(PomAgentService)
    private triggerService: TriggerService = getInstanceByToken<TriggerService>(TriggerService)
    private agentTrigger: AgentTrigger = getInstanceByToken<AgentTrigger>(AgentTrigger)
    private pomAgentService: PomAgentService = getInstanceByToken<PomAgentService>(PomAgentService)

    @OnConnect()
    async connected(socket: CocoSocket) {
        try {
            // 检查是否是设备连接（通过请求头中的device-sn判断）
            const authType = socket.data.authType
            // 设备连接处理
            this.logger.info(`Device connection attempt with SN: ${socket.data.device?.deviceSN}`)
            socket.join(socket.data.device!.deviceSN)

            SocketCommonResponse.success<JoinResponse>({
                socket,
                event: TriggerResponseEvent.JOIN,
                data: null,
                msg: `${authType} 设备连接成功`
            })
        } catch (e) {
            SocketCommonResponse.error({ socket, event: TriggerResponseEvent.CONNECT, msg: (e as Error).message })
            this.logger.error('Error processing Socket.IO connect message:', e)
        }
    }

    /**
     * 用户主动输入input创建Trigger
     * @param socket
     * @param req
     */
    @SocketEvent(TriggerRequestEvent.CHAT_TRIGGER)
    public async chatTrigger(socket: CocoSocket, req: ChatTriggerReq): Promise<void> {
        // 获取Agent信息和对话历史
        const deviceSN = socket.data.device!.deviceSN
        const agent = await this.pomAgentService.getAgentAndLatestDialogMessages(deviceSN)
        if (!agent) {
            SocketCommonResponse.error({
                socket,
                event: TriggerRequestEvent.CHAT_TRIGGER,
                msg: 'Agent not found'
            })
            return
        }
        await this.agentTrigger.triggerAgent(deviceSN, agent, req.input)
    }

    /**
     * 用户输入XML返回编译后的信息
     * @param socket
     * @param req
     */
    @SocketEvent(TriggerRequestEvent.CHAT_ONCE)
    async triggerXmlParse(socket: CocoSocket, req: TriggerXmlRequest) {
        const { textFuncTokens, audioFuncTokens } = await TTSService.parseByLoopWithAudio(req.text, false, '', '', '')
        await this.triggerService.sendAudioWithAck(
            socket.data.device!.deviceSN,
            textFuncTokens,
            audioFuncTokens,
            true,
            TriggerResponseEvent.CHAT_ONCE
        )
    }

    /**
     * 设备返回提示词、触发器列表
     * @param socket
     * @param req
     */
    @SocketEvent(TriggerRequestEvent.TRIGGER_PROMPT_UPDATE)
    public async triggerPromptUpdate(socket: CocoSocket, req: TriggerPromptReq): Promise<void> {
        try {
            // 获取设备序列号
            const deviceSN = socket.data.device?.deviceSN
            if (!deviceSN) {
                SocketCommonResponse.error({
                    socket,
                    event: TriggerRequestEvent.TRIGGER_PROMPT_UPDATE,
                    msg: 'Device SN not found'
                })
                this.logger.error('Device SN not found in socket data')
                return
            }

            // 保存提示词到 Redis (使用 Hash 结构，name 作为 field)
            await this.triggerPrompt.setPrompt(deviceSN, req.name, req.prompt)

            // 返回成功响应
            SocketCommonResponse.success({
                socket,
                event: TriggerRequestEvent.TRIGGER_PROMPT_UPDATE,
                data: null,
                msg: 'Trigger prompt updated successfully'
            })

            this.logger.info(`Trigger prompt updated for device: ${deviceSN}, name: ${req.name}`)
        } catch (e) {
            SocketCommonResponse.error({
                socket,
                event: TriggerRequestEvent.TRIGGER_PROMPT_UPDATE,
                msg: (e as Error).message
            })
            this.logger.error('Error updating trigger prompt:', e)
        }
    }

    /**
     * @deprecated 之后网页的trigger删除，这个函数下一个迭代中删除
     *
     * 网页更新trigger，同步给 设备
     * 存储AI触发器同步事件处理函数，俩个ACK一次性返回给客户端
     * @param socket - WebSocket连接对象，包含认证信息和设备数据
     * @param req - 同步请求对象，包含触发器类型、数据和名称
     * @param callback - 回调函数，用于返回处理结果给客户端
     */
    @SocketEvent(TriggerRequestEvent.TRIGGER_SYNC)
    async storeAiTrigger(
        socket: CocoSocket,
        req: TriggerSyncRequest,
        callback: (arg: SocketResponse<boolean>) => void
    ) {
        // 验证设备身份
        if (socket.data.authType !== AuthType.web || !socket.data.device) {
            throw new Error('Only web clients can sync trigger')
        }

        // 组装
        const xml = getXml(req)

        // 解析功能令牌，对于删除和禁用操作跳过解析步骤
        let result: ChatXml2Result = { audioFuncTokens: { id: '', audio: [] }, textFuncTokens: [] }
        if (!(req.type === 'del' || req.type === 'disable')) {
            result = await TTSService.parseByLoopWithAudio(xml, false, '', '', '').catch(e => {
                this.logger.error('Error parsing trigger data:', e)
                return { audioFuncTokens: { id: '', audio: [] }, textFuncTokens: [] }
            })
        }

        // 获取目标设备的WebSocket连接并转发同步请求
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(
            CoCoNamespace.AgentTrigger,
            socket.data.device!.deviceSN
        )

        // 检查设备socket连接状态并触发同步事件
        if (deviceSocket) {
            // 向设备发送同步触发消息，并等待确认响应
            SocketCommonResponse.successEmitWithAck<TriggerSyncResponse>(
                TriggerRequestEvent.TRIGGER_SYNC,
                deviceSocket,
                '转发',
                {
                    id: traceContext.getTraceId(),
                    type: req.type,
                    funcTokens: result.textFuncTokens,
                    name: req.name
                }
            ).then(res => {
                // 处理设备响应结果
                callback(res)
            })

            // chat:audio 发送音频
            if (result.audioFuncTokens && result.audioFuncTokens.audio) {
                SocketCommonResponse.successTo<AudioResponse>({
                    authType: AuthType.client,
                    data: result.audioFuncTokens,
                    ns: CoCoNamespace.AgentTrigger,
                    room: socket.data.device!.deviceSN,
                    event: TriggerResponseEvent.TRIGGER_AUDIO,
                    msg: ''
                })
            }
        } else {
            // 设备未连接时返回错误信息
            callback({
                code: CODE.ERROR,
                msg: '设备未连接',
                data: false
            })
        }
    }

    /**
     * @deprecated 之后网页的trigger删除，这个函数下一个迭代中删除
     *
     * 设备同步触发器到数据库
     * @param socket
     * @param req
     */
    @SocketEvent(TriggerRequestEvent.TRIGGER_LIST)
    async storeAiTrigger2(socket: CocoSocket, req: TriggerListRequest) {
        // 验证设备身份
        if (socket.data.authType !== AuthType.client || !socket.data.device) {
            throw new Error('Only Device clients can sync trigger')
        }

        const agent = await this.deviceAgentService.findAgentByDeviceSN(socket.data.device.deviceSN)

        for (const trigger of req.triggers) {
            pomTriggerHttpdao.updateTrigger(trigger.name, trigger.description, trigger.enable, agent!.id).then(() => {
                this.logger.info(`Updated trigger: ${trigger.name}`)
            })
        }
    }

    @OnDisconnect()
    async disconnect(socket: CocoSocket, reason: string) {
        this.logger.warn(
            `【断连】 [${socket.data.authType}(${socket.id})] disconnected from agent-trigger , reason: ${reason}`
        )

        // 设备下线时删除提示词
        try {
            const deviceSN = socket.data.device?.deviceSN
            if (deviceSN && socket.data.authType === AuthType.client) {
                await this.triggerPrompt.deletePrompt(deviceSN)
                this.logger.info(`Deleted trigger prompt for disconnected device: ${deviceSN}`)
            }
        } catch (e) {
            this.logger.error('Error deleting trigger prompt on disconnect:', e)
        }
    }
}

function getType(type: SyncEnum) {
    let tag = ''
    if (type === SyncEnum.enable) {
        tag = 'start_trigger'
    } else if (type === SyncEnum.disable) {
        tag = 'stop_trigger'
    } else if (type === SyncEnum.add) {
        tag = 'new_trigger'
    } else {
        tag = `${type}_trigger`
    }
    return tag
}
function getXml(request: TriggerSyncRequest) {
    const tag = getType(request.type)
    const startTag = `<${tag} id="${request.name}" desc="${request.desc}">`
    const endTag = `</${tag}>`
    return startTag + request.data + endTag
}
