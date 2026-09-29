/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, ConversationDialogRespVO, UpdateDialogTitleReqVO } from './common/cocoadmin.interface'

/**
 * 对话管理 HTTP DAO
 */
export class ConversationDialogHttpdao {
    private log = getLogger(ConversationDialogHttpdao.name)

    /**
     * 根据Dialog ID查找对话及其完整关联messages
     * @param dialogId Dialog ID
     * @returns 对话信息或undefined
     */
    async findById(dialogId: string): Promise<ConversationDialogRespVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-dialog/${dialogId}`,
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<ConversationDialogRespVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询对话失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询对话请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 根据Agent ID查找最新对话
     * @param agentId Agent ID
     * @returns 最新对话或undefined
     */
    async findLatestByAgentId(agentId: string): Promise<ConversationDialogRespVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-dialog/latest`,
            params: {
                agentId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<ConversationDialogRespVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询最新对话失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询最新对话请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 更新对话标题
     * @param dialogId 对话ID
     * @param title 新标题
     * @returns 是否更新成功
     */
    async updateTitle(dialogId: string, title: string): Promise<boolean> {
        const data: UpdateDialogTitleReqVO = { title }

        const config = {
            method: 'put' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/conversation-dialog/${dialogId}/title`,
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

            this.log.warnMsg(`更新对话标题失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`更新对话标题请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return false
    }
}

export const conversationDialogHttpdao = new ConversationDialogHttpdao()
