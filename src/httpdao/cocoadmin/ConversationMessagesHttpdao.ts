/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import {
    BatchUpdateIndexReqVO,
    CommonResult,
    ConversationMessageVO,
    CreateMessageReqVO,
    SummaryCheckResultVO,
    UpdateHistorySummaryReqVO
} from './common/cocoadmin.interface'
import { ChatRoleEnum } from 'uniai'

/**
 * 消息管理 HTTP DAO
 */
export class ConversationMessagesHttpdao {
    private log = getLogger(ConversationMessagesHttpdao.name)

    /**
     * 创建新消息
     * @param dialogId 对话ID
     * @param role 消息角色
     * @param content 消息内容
     * @param provider AI提供商
     * @param model AI模型
     * @param sessionId 会话ID
     * @param messageId 消息ID，用户消息传入，assistant消息后端生成
     * @param requestId 请求追踪ID
     * @param tokenCount
     * @param video lamp_search_memory routine 写入的原样 JSON 字符串
     * @returns 创建的消息记录或undefined
     */
    async createMessage(
        dialogId: string,
        role: ChatRoleEnum,
        content: string,
        provider: string,
        model: string,
        sessionId: string,
        messageId: string,
        requestId?: string,
        tokenCount: number = 0,
        video?: string
    ): Promise<ConversationMessageVO | undefined> {
        // 忽略System空消息，一般都是状态机是空
        if (!content && ChatRoleEnum.SYSTEM == role) {
            return undefined
        }

        // 默认Assistant执行完了
        let index = 9999
        if (role !== ChatRoleEnum.ASSISTANT) {
            index = content.length
        }

        const data: CreateMessageReqVO = {
            dialogId,
            role: role as 'user' | 'assistant' | 'system',
            content,
            provider,
            model,
            sessionId,
            messageId: messageId || undefined,
            requestId,
            index,
            tokenCount,
            video
        }

        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-message/create`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data
        }

        try {
            const response: AxiosResponse<CommonResult<ConversationMessageVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`创建消息失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`创建消息请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 检查是否需要生成摘要（是否达到20轮对话）
     * @param dialogId 对话ID
     * @returns 摘要检查结果
     */
    async checkNeedsSummary(dialogId: string): Promise<SummaryCheckResultVO> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-message/check-summary`,
            params: { dialogId },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<SummaryCheckResultVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`检查摘要失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`检查摘要请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }

        // 返回默认值：不需要摘要
        return {
            needsSummary: false
        }
    }

    /**
     * 更新消息的历史摘要
     * @param messageId 消息ID
     * @param historySummary 历史摘要内容
     * @returns 是否更新成功
     */
    async updateHistorySummary(messageId: string, historySummary: string): Promise<boolean> {
        const data: UpdateHistorySummaryReqVO = { historySummary }

        const config = {
            method: 'put' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-message/${messageId}/summary`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data
        }

        try {
            const response: AxiosResponse<CommonResult<boolean>> = await axios(config)

            if (response.data.code === 200) {
                return response.data.data ?? true
            }

            this.log.warnMsg(`更新历史摘要失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`更新历史摘要请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return false
    }

    /**
     * 更新消息索引（批量）
     *
     * @param llmSet 包含消息ID和内容长度的对象数组
     * @param length 需要更新的长度值
     * @returns 是否更新成功
     */
    async updateIndex(llmSet: { messageId: string; llmContentLen: number }[], length: number): Promise<boolean> {
        // 计算每条消息的index和groupId
        const groupId = llmSet[0].messageId
        const updates: { messageId: string; index: number; groupId: string }[] = []

        let remainingLength = length
        for (const e of llmSet) {
            if (remainingLength >= e.llmContentLen) {
                remainingLength = remainingLength - e.llmContentLen
                updates.push({
                    messageId: e.messageId,
                    index: e.llmContentLen,
                    groupId
                })
            } else if (remainingLength > 0) {
                updates.push({
                    messageId: e.messageId,
                    index: remainingLength,
                    groupId
                })
                remainingLength = 0
            }
        }

        const data: BatchUpdateIndexReqVO = { updates }

        const config = {
            method: 'put' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-message/batch-index`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data
        }

        try {
            const response: AxiosResponse<CommonResult<boolean>> = await axios(config)

            if (response.data.code === 200) {
                return response.data.data ?? true
            }

            this.log.warnMsg(`批量更新索引失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`批量更新索引请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return false
    }
}

export const conversationMessagesHttpdao = new ConversationMessagesHttpdao()
