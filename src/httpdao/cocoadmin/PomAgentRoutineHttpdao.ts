/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { AgentRoutineTreeRespVO, CommonResult, RoutineInnerRespVO } from './common/cocoadmin.interface'

/**
 * COCOADMIN - AgentRoutine相关HTTP DAO
 */
export class PomAgentRoutineHttpdao {
    private log = getLogger(PomAgentRoutineHttpdao.name)

    /**
     * 查询动态按需PE (load_type=1)
     * @param agentId Agent ID
     * @param moduleNodeKey 模块节点Key（必选）
     * @returns Routine列表或空数组
     */
    async getDynamicRoutinesByAgentId(agentId: string, moduleNodeKey: string): Promise<RoutineInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/agent-routine/dynamic/${agentId}`,
            params: {
                moduleNodeKey
            },
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<RoutineInnerRespVO[]>> = await axios(config)

            if (response.data.code === 0 || response.data.code === 200) {
                return response.data.data || []
            }

            this.log.warnMsg(`获取动态Routines失败: ${response.data.msg}, 入参：${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`获取动态Routines请求异常, 入参：${JSON.stringify(config)}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 查询Agent的所有Routine及关联ModuleNode树
     * @param agentId Agent ID
     * @returns 树形结构或undefined
     */
    async getRoutinesTreeByAgentId(agentId: string): Promise<AgentRoutineTreeRespVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/agent-routine/tree/${agentId}`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<AgentRoutineTreeRespVO>> = await axios(config)

            if (response.data.code === 0 || response.data.code === 200) {
                return response.data.data
            }

            this.log.warnMsg(`获取Routines树失败: ${response.data.msg}, 入参：${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`获取Routines树请求异常, 入参：${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * @deprecated
     * 根据agent_id查询关联的routine
     * 注意：此方法原名为activateAgentRoutineByModuleNode，但新接口实际为查询而非激活
     * @param agentId Agent ID
     * @param moduleNodeKey 模块节点Key（必选）
     * @returns Routine列表或空数组
     */
    async queryRoutinesByAgent(agentId: string, moduleNodeKey: string): Promise<RoutineInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/agent-routine/query/${agentId}`,
            params: {
                moduleNodeKey
            },
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<RoutineInnerRespVO[]>> = await axios(config)

            if (response.data.code === 0 || response.data.code === 200) {
                return response.data.data || []
            }

            this.log.warnMsg(`查询关联Routines失败: ${response.data.msg}, 入参：${JSON.stringify(config)}`)
            return []
        } catch (error) {
            this.log.errorMsg(`查询关联Routines请求异常, 入参：${JSON.stringify(config)}`, { errorMsg: error })
            return []
        }
    }
}

export const pomAgentRoutineHttpdao = new PomAgentRoutineHttpdao()
