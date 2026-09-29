/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, ConversationMessageVO, CreateTriggerMessageReqVO } from './common/cocoadmin.interface'
import { ChatRoleEnum } from 'uniai'

/**
 * 消息管理 HTTP DAO
 */
export class ConversationTriggerMessagesHttpdao {
    private log = getLogger(ConversationTriggerMessagesHttpdao.name)

    /**
     * 创建新消息
     * @param role 消息角色
     * @param content 消息内容
     * @param provider AI提供商
     * @param model AI模型
     * @param messageId 消息ID，用户消息传入，assistant消息后端生成
     * @param requestId 请求追踪ID
     * @param tokenCount
     * @returns 创建的消息记录或undefined
     */
    async createTriggerMessage(
        role: ChatRoleEnum,
        content: string,
        provider: string,
        model: string,
        messageId: string,
        tokenCount: number,
        requestId?: string
    ): Promise<ConversationMessageVO | undefined> {
        const data: CreateTriggerMessageReqVO = {
            role: role as 'user' | 'assistant',
            content,
            provider,
            model,
            messageId: messageId || undefined,
            requestId,
            tokenCount
        }

        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-message/trigger/create`,
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
}

export const conversationTriggerMessagesHttpdao = new ConversationTriggerMessagesHttpdao()
