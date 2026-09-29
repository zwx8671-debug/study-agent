/** @format */

import { Service } from 'fastify-decorators'
import { ChatMessage, ChatRoleEnum } from 'uniai'
import { FuncToken, ResponseEvent } from '@interface/IAgent'
import { getLogger, type Logger } from '@utils/Logger'
import { conversationDialogHttpdao } from '@httpdao/cocoadmin/ConversationDialogHttpdao'
import { conversationMessagesHttpdao } from '@httpdao/cocoadmin/ConversationMessagesHttpdao'
import { pomAgentHttpdao } from '@httpdao/cocoadmin/PomAgentHttpdao'
import {
    ConversationDialogRespVO,
    ConversationMessageVO,
    PomAgentVO,
    PomAgentWithDialogsVO
} from '@httpdao/cocoadmin/common/cocoadmin.interface'
// 小型提示词服务
import { smallPromptService } from '@service/SmallPromptService'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { v7 } from 'uuid'
import { AuthType, CoCoNamespace } from '@interface/ICommon'
import { env } from '@config/env'

/**
 * Agent 服务类
 * 负责处理设备与AI的对话交互，包括多模态输入处理、会话管理、消息存储等
 */
@Service()
export default class PomAgentService {
    /** 日志记录器 */
    private log: Logger = getLogger(PomAgentService.name)

    /**
     * 获取Agent信息及其最新对话消息（优化后的版本，使用HTTP DAO）
     * 支持通过多种方式查询：agentId、设备序列号、dialogId
     * @param deviceSN 设备序列号（必需）
     * @param agentId Agent ID（可选，优先使用）
     * @param dialogId 对话ID（可选，用于获取特定对话）
     * @returns Agent信息及其对话数据，查询失败返回null
     */
    async getAgentAndLatestDialogMessages(
        deviceSN: string,
        agentId?: string,
        dialogId?: string
    ): Promise<PomAgentWithDialogsVO | null> {
        try {
            let agentVO: PomAgentVO | undefined
            // 方式1：如果提供了agentId，直接通过ID查询
            if (agentId) {
                agentVO = await pomAgentHttpdao.getAgentById(agentId)
            } else {
                // 方式2：通过设备序列号查询（兜底方案）
                agentVO = await pomAgentHttpdao.findByDeviceSeriesNum(deviceSN)
            }

            if (!agentVO) {
                this.log.warn(`No agent found for ${agentId}`)
                return null
            }

            // 获取对话信息和消息历史
            let dialog: ConversationDialogRespVO | undefined
            if (dialogId) {
                // 如果指定了dialogId，查询特定对话
                this.log.info(`Querying agent by dialogId: ${dialogId}`)
                dialog = await conversationDialogHttpdao.findById(dialogId)
            } else {
                // 否则获取最新的对话
                dialog = await conversationDialogHttpdao.findLatestByAgentId(agentVO.id)
            }

            // 组合成带对话的Agent对象
            const result: PomAgentWithDialogsVO = {
                ...agentVO,
                dialogs: dialog ? [dialog] : []
            }
            return result
        } catch (error) {
            this.log.error('Error getting agent:', error)
            return null
        }
    }

    /**
     * 根据设备序列号查询Agent
     * @param deviceSN 设备序列号
     * @returns PomAgentVO或undefined
     */
    findAgentByDeviceSN(deviceSN: string): Promise<PomAgentVO | undefined> {
        return pomAgentHttpdao.findByDeviceSeriesNum(deviceSN)
    }

    /**
     * 创建并保存消息到数据库
     * 如果是对话的第一条消息，会自动生成对话标题
     * @param deviceSN
     * @param dialogId 对话ID
     * @param role 消息角色（用户/助手/系统）
     * @param content 消息内容
     * @param provider AI提供商名称，默认为空
     * @param model AI模型名称，默认为空
     * @param sessionId
     * @param firstMessage 是否是对话的第一条消息，默认false
     * @param messageId 消息ID，小助手的信息默认为空，用户的数据为非空
     * @param requestId LiteLLM 的 请求ID，第三方模型的id
     * @param tokenCount
     * @param video lamp_search_memory 精简后的 [{title, summary, video_path}] JSON 字符串
     * @returns 生成的对话标题（仅对第一条消息有效）
     */
    async createMsgAndSummaryAndGenTitle(
        deviceSN: string,
        dialogId: string,
        role: ChatRoleEnum,
        content: string,
        provider: string,
        model: string,
        sessionId: string,
        firstMessage: boolean,
        messageId: string,
        tokenCount: number = 0,
        requestId?: string,
        video?: string
    ): Promise<void> {
        // 创建新的消息记录并插入数据库
        await conversationMessagesHttpdao.createMessage(
            dialogId,
            role,
            content,
            provider,
            model,
            sessionId,
            messageId,
            requestId,
            tokenCount,
            video
        )
        // 异步执行摘要生成
        if (role == ChatRoleEnum.ASSISTANT) {
            // 新增后检查是否需要生成摘要
            const res = await conversationMessagesHttpdao.checkNeedsSummary(dialogId)
            this.log.debug(`新增后检查是否需要生成摘要：${res.needsSummary}`)
            if (res.needsSummary && env.ENABLE_VECTOR) {
                // 生成摘要
                const summary = await smallPromptService.generateHistorySummary(
                    res.conversationTurns as ConversationMessageVO[],
                    res.lastSummary,
                    provider,
                    model
                )

                // 将摘要添加到最后一条消息中
                const length = res.conversationTurns!.length
                const lastMessageId = res.conversationTurns![length - 1].id
                this.log.info('将摘要添加到最后一条消息中：', lastMessageId, summary)
                await conversationMessagesHttpdao.updateHistorySummary(lastMessageId, summary)
            }
        }

        // 如果是对话的第一条消息，自动生成对话标题
        if (firstMessage && env.ENABLE_VECTOR) {
            try {
                // 使用小型提示词服务生成对话标题
                const title = await smallPromptService.generateDialogTitle(content, provider, model)
                this.log.info(`Q: ${content}, Dialog id: ${dialogId}、title: ${title}`)
                // 更新对话标题
                await conversationDialogHttpdao.updateTitle(dialogId, title)

                // 发送标题总结给所有客户端
                SocketCommonResponse.successTo({
                    authType: AuthType.web,
                    ns: CoCoNamespace.Agent,
                    room: deviceSN,
                    event: ResponseEvent.SUMMARIZE,
                    data: title,
                    msg: '标题总结'
                })
            } catch (error) {
                this.log.error('Error generating dialog title:', error)
            }
        }
    }

    /**
     * 构建组合消息：最后一条摘要+摘要之后的对话，摘要使用system角色
     * @param conversationMessages 对话消息列表
     * @returns 组合后的消息列表
     */
    buildCombinedMessages(conversationMessages: ConversationMessageVO[]): ChatMessage[] {
        try {
            const result: ChatMessage[] = []

            // 对conversationMessages数组中的消息按创建时间进行升序排序
            conversationMessages = conversationMessages.sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )

            // 获取最后一条摘要消息（按时间倒序查找第一个包含historySummary的消息）
            const lastSummaryMessage = conversationMessages
                .slice()
                .reverse()
                .find(msg => msg.historySummary && msg.historySummary.trim() !== '')

            // 如果存在摘要，将摘要作为system角色消息添加
            if (lastSummaryMessage && lastSummaryMessage.historySummary) {
                result.push({
                    role: ChatRoleEnum.SYSTEM,
                    content: lastSummaryMessage.historySummary
                })
            }

            // 获取摘要之后的消息
            let messagesAfterSummary: ConversationMessageVO[]
            if (lastSummaryMessage) {
                // 找到摘要消息在原数组中的索引
                const summaryIndex = conversationMessages.findIndex(msg => msg.id === lastSummaryMessage.id)
                // 获取摘要之后的所有消息
                messagesAfterSummary = conversationMessages.slice(summaryIndex + 1)
            } else {
                // 如果没有摘要消息，使用所有消息
                messagesAfterSummary = conversationMessages
            }

            // 将摘要之后的消息添加到列表中
            for (const msg of messagesAfterSummary) {
                if (msg.role === ChatRoleEnum.SYSTEM) {
                    continue
                }
                // 只添加有效的用户和助手消息
                result.push({
                    role: msg.role as ChatRoleEnum,
                    content: msg.content.substring(0, msg.index)
                })
            }

            return result
        } catch (error) {
            this.log.error('组合消息出错:', error)
            // 如果出错，原值
            return conversationMessages
                ? conversationMessages.map(h => ({ role: h.role as ChatRoleEnum, content: h.content }))
                : []
        }
    }

    /**
     * 保存已执行的tokens 根据设备SN查询agent保存到对话
     * @param tokensToSave 需要保存的tokens
     * @param role
     * @param deviceSN 设备SN
     * @private
     */
    async saveMessage(tokensToSave: FuncToken[], role: ChatRoleEnum, deviceSN: string) {
        if (tokensToSave.length > 0) {
            // 获取当前对话信息
            const agent = await this.getAgentAndLatestDialogMessages(deviceSN)
            if (agent && agent.dialogs && agent.dialogs.length > 0) {
                const dialog = agent.dialogs[0]
                // 将tokens拼接成文本保存
                const content = tokensToSave.map(token => token.token || '').join('')
                if (content) {
                    await conversationMessagesHttpdao.createMessage(
                        dialog.id,
                        role,
                        content,
                        '',
                        '',
                        agent.sessionId,
                        v7()
                    )
                }
            }
        }
    }
}
