/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, DeviceAgentRunnerVO, SaveSkillReqVO } from './common/cocoadmin.interface'

/**
 * DeviceAgentRunner 管理 HTTP DAO
 */
export class DeviceAgentRunnerHttpdao {
    private log = getLogger(DeviceAgentRunnerHttpdao.name)

    /**
     * 保存/更新技能
     * 根据 name + agentId 查找，存在则更新，不存在则创建
     *
     * @param name 技能名称
     * @param description 技能描述
     * @param xml routineCombo XML内容
     * @param agentId Agent ID
     * @returns 技能ID或undefined
     */
    async save(name: string, description: string, xml: string, agentId: string): Promise<string | undefined> {
        const data: SaveSkillReqVO = {
            name,
            description,
            xml,
            agentId
        }

        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/skill/save`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data
        }

        try {
            const response: AxiosResponse<CommonResult<string>> = await axios(config)

            if (response.data.code === 200) {
                this.log.infoMsg(`Successfully save skill: ${name}`)
                return response.data.data
            }

            this.log.warnMsg(
                `保存技能失败: ${response.data.msg},入参:${JSON.stringify({ name, description, agentId })}`
            )
        } catch (error) {
            this.log.errorMsg(`保存技能请求异常,入参:${JSON.stringify({ name, description, agentId })}`, {
                errorMsg: error
            })
        }
        return undefined
    }

    /**
     * 根据AgentId查询技能列表
     * 只返回name和description
     *
     * @param agentId Agent ID
     * @returns 技能列表
     */
    async findByAgentId(agentId: string): Promise<DeviceAgentRunnerVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/skill/list`,
            params: {
                agentId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceAgentRunnerVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询技能列表失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询技能列表请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return []
    }
}

export const deviceAgentRunnerHttpdao = new DeviceAgentRunnerHttpdao()
