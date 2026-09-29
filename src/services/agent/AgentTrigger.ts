/** @format */
import { Shell, ShellDeviceInfo } from '../../libs/xml/Shell'
import { FuncToken, Pattern } from '@interface/IAgent'
import { ChatMessage, ChatModelProvider, ChatResponse, ChatRoleEnum } from 'uniai'
import { PomAgentWithDialogsVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { SocketCommonResponse } from '../../common/SocketCommonResponse'
import { getLogger, Logger } from '@utils/Logger'
import { AudioResponse, AuthType, CoCoNamespace, GlobalResponse } from '@interface/ICommon'
import ai from '@utils/uniai'

import { promptManager, PromptManager } from '../../libs/xml/PromptManager'
import { Service } from 'fastify-decorators'
import { SyncEnum, TriggerRequestEvent, TriggerResponseEvent, TriggerSyncResponse } from '@interface/IAgentTrigger'
import { TriggerAttr } from '../../libs/xml/handler/trigger/TriggerInterface'
import { Readable } from 'stream'
import { TTSService } from '@service/TTSService'
import { traceContext } from '@utils/TraceContext'
import { conversationTriggerMessagesHttpdao } from '@httpdao/cocoadmin/ConversationTriggerMessagesHttpdao'
import { v7 } from 'uuid'

@Service()
export class AgentTrigger {
    /** Prompt 管理器，用于管理AI提示词 */
    private promptManager: PromptManager = promptManager
    /** 日志记录器 */
    private log: Logger = getLogger(AgentTrigger.name)

    /**
     * 处理多Agent输出数据
     */
    public shellAgentEvent(shell: Shell, deviceSN: string, agent: PomAgentWithDialogsVO) {
        shell.on('agentTrigger', async (input: string) => {
            await this.triggerAgent(deviceSN, agent, input).catch((err: Error) => {
                this.log.errorMsg(err.message)
            })
        })
    }

    public async triggerAgent(deviceSN: string, agent: PomAgentWithDialogsVO, input: string) {
        const shellDeviceInfo: ShellDeviceInfo = {
            agentId: agent.id,
            sessionId: agent.sessionId,
            deviceSN: deviceSN
        }

        const errorTo = (msg: string, deviceSN: string) => {
            this.log.errorMsg(msg)
            SocketCommonResponse.errorTo<TriggerSyncResponse>({
                authType: AuthType.client,
                data: null,
                ns: CoCoNamespace.AgentTrigger,
                room: deviceSN,
                event: GlobalResponse.ERROR,
                msg: msg
            })
        }

        this.log.infoMsg('[AgentTrigger NS] 获取triggerProm')
        // 获取目标设备的WebSocket连接并转发同步请求
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.AgentTrigger, deviceSN)
        if (!deviceSocket) {
            // 向设备发送Trigger消息
            this.log.warnMsg('[AgentTrigger NS]设备未连接')
            return
        }

        // 请求trigger pe
        const triggerPrompt = await this.promptManager.getTriggerPrompt(
            agent?.deviceSession?.device?.productId,
            agent.id,
            agent.sessionId,
            deviceSN
        )

        if (!triggerPrompt) {
            errorTo(`设备SN: ${deviceSN} 获取triggerPrompt失败`, deviceSN)
        }

        // 将systemPrompt替换为triggerPrompt
        const triggerMessages: ChatMessage[] = []
        triggerMessages.push({
            role: ChatRoleEnum.SYSTEM,
            content: triggerPrompt
        })
        triggerMessages.push({
            role: ChatRoleEnum.USER,
            content: `生成触发器：${input}，不要生成trigger无关的XML，严格禁止生成markdown格式`
        })

        // fs.writeFileSync('./prompt.md', messages[0].content as string)
        // fs.writeFileSync('./message.json', JSON.stringify(messages))

        // 【AI聊天LLM】
        let res: ChatResponse | Readable
        try {
            res = await ai.chat(triggerMessages, {
                stream: false,
                provider: ChatModelProvider.Other,
                model: 'claude-sonnet-4-5-20250929'
            })
        } catch (e) {
            errorTo('LLM Chat error: ' + (e as Error).message, deviceSN)
            return
        }
        res = res as ChatResponse
        this.log.infoMsg(`[AgentTrigger NS] LLM Chat: ${res.content as string}`)

        conversationTriggerMessagesHttpdao
            .createTriggerMessage(
                ChatRoleEnum.USER,
                input,
                ChatModelProvider.Other,
                'claude-sonnet-4-5-20250929',
                v7(),
                res.promptTokens
            )
            .then(() =>
                conversationTriggerMessagesHttpdao.createTriggerMessage(
                    ChatRoleEnum.ASSISTANT,
                    input,
                    ChatModelProvider.Other,
                    'claude-sonnet-4-5-20250929',
                    v7(),
                    res.completionTokens,
                    res.id
                )
            )

        const funcTokens = await TTSService.parseByLoopWithAudio2(res.content, false, shellDeviceInfo).catch(error => {
            // 向设备发送Trigger消息
            errorTo('生成trigger失败', deviceSN)
            this.log.errorMsg('LLM Chat error:', { errorMsg: error })
        })

        if (!funcTokens || !funcTokens.textFuncTokens) {
            errorTo(`设备SN: ${deviceSN} 生成技能列表失败`, deviceSN)
            return
        }

        const removeUnXml: FuncToken[] = []
        let flag = false
        for (const textFuncToken of funcTokens.textFuncTokens) {
            if (textFuncToken.name.toLowerCase().includes('trigger') && textFuncToken.pattern != Pattern.END) {
                flag = true
            }

            if (flag) {
                removeUnXml.push(textFuncToken)
            }

            if (textFuncToken.name.includes('trigger') && textFuncToken.pattern === Pattern.END) {
                flag = false
            }
        }

        funcTokens.textFuncTokens = removeUnXml

        // LLM 默认生成的trigger开闭标签一定在首尾，而不是中间
        const func = funcTokens.textFuncTokens[0]
        const triggerAttr = func.params as unknown as TriggerAttr
        // 向设备发送Trigger消息，并等待确认响应
        SocketCommonResponse.successEmitWithAck<TriggerSyncResponse>(
            TriggerRequestEvent.TRIGGER_SYNC,
            deviceSocket,
            '',
            {
                id: traceContext.getTraceId(),
                type: this.getType(func.name) || '',
                funcTokens: funcTokens.textFuncTokens,
                name: triggerAttr.id || '首标签不是Trigger 标签'
            }
        )
            .then(() => {
                this.log.infoMsg(`设备SN: ${deviceSN} 触发技能成功`)
            })
            .catch(error => {
                errorTo(`发送trigger ack超时` + error.toString(), deviceSN)
            })

        // chat:audio 发送音频
        if (funcTokens.audioFuncTokens && funcTokens.audioFuncTokens.audio) {
            SocketCommonResponse.successTo<AudioResponse>({
                authType: AuthType.client,
                data: funcTokens.audioFuncTokens,
                ns: CoCoNamespace.AgentTrigger,
                room: deviceSN,
                event: TriggerResponseEvent.TRIGGER_AUDIO,
                msg: ''
            })
        }
    }

    getType(tag: string) {
        const type = tag.split('_')[0]
        if (type === 'start') {
            return SyncEnum.enable
        } else if (type === 'stop') {
            return SyncEnum.disable
        } else if (type === 'new') {
            return SyncEnum.add
        } else {
            return type as SyncEnum
        }
    }
}
