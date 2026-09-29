/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, PomAgentVO } from './common/cocoadmin.interface'

/**
 * COCOADMIN - PomAgent相关HTTP DAO
 */
export class PomAgentHttpdao {
    private log = getLogger(PomAgentHttpdao.name)

    /**
     * 根据设备序列号查询Agent
     * @param deviceSeriesNum 设备序列号
     * @returns PomAgentVO或undefined
     */
    async findByDeviceSeriesNum(deviceSeriesNum: string): Promise<PomAgentVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/agent/by-device`,
            params: { deviceSeriesNum },
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<PomAgentVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`根据设备序列号查询Agent失败: ${response.data.msg}`)
        } catch (error) {
            this.log.errorMsg(`根据设备序列号查询Agent请求异常`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 根据ID查询Agent
     * @param agentId Agent ID
     * @returns PomAgentVO或undefined
     */
    async getAgentById(agentId: string): Promise<PomAgentVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/agent/${agentId}`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<PomAgentVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`根据ID查询Agent失败: ${response.data.msg}`)
        } catch (error) {
            this.log.errorMsg(`根据ID查询Agent请求异常`, { errorMsg: error })
        }
        return undefined
    }
}

export const pomAgentHttpdao = new PomAgentHttpdao()
