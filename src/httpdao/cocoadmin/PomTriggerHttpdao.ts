/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { AgentTriggerSaveReqVO, CommonResult, PomTriggerVO } from './common/cocoadmin.interface'

/**
 * 触发器HTTP DAO
 */
export class PomTriggerHttpdao {
    private log = getLogger(PomTriggerHttpdao.name)

    /**
     * 根据AgentId查询所有有效触发器
     * @param agentId Agent ID
     * @returns 触发器列表
     */
    async findAllEffectiveByAgentId(agentId: string): Promise<PomTriggerVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/trigger/list`,
            params: {
                agentId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            },
            validateStatus: () => true // 接受所有HTTP状态码，不抛出异常
        }

        try {
            const response: AxiosResponse<CommonResult<PomTriggerVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询触发器列表失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询触发器列表请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 保存触发器
     * @param name 名称
     * @param xml XML文本
     * @param description 描述
     * @param agentId Agent ID
     * @returns 响应结果或null(失败时)
     */
    async saveTrigger(
        name: string,
        xml: string,
        description: string,
        agentId: string
    ): Promise<CommonResult<string> | null> {
        const data: AgentTriggerSaveReqVO = {
            name,
            agentId,
            xml,
            description
        }

        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/trigger/create`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: data,
            validateStatus: () => true // 接受所有HTTP状态码，不抛出异常
        }

        try {
            const response: AxiosResponse<CommonResult<string>> = await axios(config)

            if (response.data.code === 200) {
                return response.data
            }

            this.log.warnMsg(`保存trigger失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`保存trigger请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return {
            code: 500,
            msg: '保存trigger失败'
        }
    }

    async updateTrigger(
        name: string,
        description: string,
        effected: boolean,
        agentId: string,
        xml?: string
    ): Promise<CommonResult<string> | null> {
        let data
        if (xml) {
            data = JSON.stringify({ name, agentId, xml, description, effected })
        } else {
            data = JSON.stringify({ name, agentId, description, effected })
        }

        const config = {
            method: 'put' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/trigger/update`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: data,
            validateStatus: () => true // 接受所有HTTP状态码，不抛出异常
        }

        try {
            const response: AxiosResponse<CommonResult<any>> = await axios(config)

            if (response.data.code === 200) {
                return response.data
            }

            this.log.warnMsg(`更新trigger失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`更新trigger请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return {
            code: 500,
            msg: '更新trigger失败'
        }
    }
    async delTrigger(name: string, agentId: string): Promise<CommonResult<string> | null> {
        const config = {
            method: 'delete' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/trigger/delete?name=${name}&agentId=${agentId}`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<any>> = await axios(config)

            if (response.data.code === 200) {
                return response.data
            }

            this.log.warnMsg(`删除trigger失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`删除trigger请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return {
            code: 500,
            msg: '删除trigger失败'
        }
    }
}

export const pomTriggerHttpdao = new PomTriggerHttpdao()
