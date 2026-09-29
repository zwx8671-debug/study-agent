/** @format */

// /** @format */
// import { getLogger } from '@utils/Logger'
// import { env } from '@config/env'
// import axios, { AxiosResponse } from 'axios'
// import { DataStructure, MgmtCommonResponse, RoutineItem } from './common/mgmt.interface'
//
// interface PomAgentRoutineResponse {
//     code: number
//     message: string
// }
//
// /**
//  * @deprecated MGMT接口已废弃，请使用 src/httpdao/cocoadmin/PomAgentRoutineHttpdao.ts
//  * 该类将在后续版本中移除
//  */
// export class PomAgentRoutineHttpdao {
//     private log = getLogger('PomAgentRoutineHttpdao')
//     private readonly baseUrl: string
//     // private readonly apiKey: string
//
//     constructor() {
//         this.baseUrl = env.COCOADMIN_API_URL
//         // this.apiKey = env.MGMT_API_KEY
//     }
//
//     /**
//      * @deprecated MGMT接口已废弃，请使用 cocoadmin/PomAgentRoutineHttpdao.getDynamicRoutinesByAgentId
//      * 根据agentId获取routines
//      * @param agentId
//      * @param moduleNodeKey
//      */
//     async getDynamicRoutinesByAgentId(agentId: string, moduleNodeKey?: string): Promise<RoutineItem[]> {
//         let params = ''
//         if (moduleNodeKey) {
//             params = `?module_node_key=${moduleNodeKey}`
//         }
//         const config = {
//             method: 'get' as const,
//             url: this.baseUrl + `/pom/agent/${agentId}/dynamic-routine/${params}`,
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         }
//
//         this.log.debug('获取Routines params：', config)
//
//         try {
//             const response: AxiosResponse<MgmtCommonResponse<RoutineItem[]>> = await axios(config)
//
//             return response.data.data || []
//         } catch (error) {
//             this.log.error(error)
//             return []
//         }
//     }
//
//     /**
//      * @deprecated MGMT接口已废弃，请使用 cocoadmin/PomAgentRoutineHttpdao.getRoutinesTreeByAgentId
//      * 根据agentId获取routines
//      * @param agentId
//      */
//     async getRoutinesTreeByAgentId(agentId: string): Promise<DataStructure | undefined> {
//         const config = {
//             method: 'get' as const,
//             url: this.baseUrl + `/pom/agent/${agentId}/routine-tree/`,
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         }
//
//         this.log.debug('获取Routines params：', config)
//
//         try {
//             const response: AxiosResponse<MgmtCommonResponse<DataStructure>> = await axios(config)
//
//             return response.data.data
//         } catch (error) {
//             this.log.error(error)
//             return undefined
//         }
//     }
//
//     /**
//      * @deprecated MGMT接口已废弃，新接口为查询而非激活，请使用 cocoadmin/PomAgentRoutineHttpdao.queryRoutinesByAgent
//      */
//     async activateAgentRoutineByModuleNode(
//         agentId: string,
//         moduleNodeId: string
//     ): Promise<PomAgentRoutineResponse | null> {
//         const data = JSON.stringify({
//             agent_id: agentId,
//             module_node_id: moduleNodeId,
//             is_effect: true
//         })
//         this.log.info('trigger params：', data)
//
//         const config = {
//             method: 'put' as const,
//             url: this.baseUrl + '/pom/agent_routine/module_node/',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             data: data
//         }
//
//         try {
//             const response: AxiosResponse<PomAgentRoutineResponse> = await axios(config)
//             this.log.info('激活AgentRoutine成功', JSON.stringify(response.data))
//
//             return response.data
//         } catch (error) {
//             this.log.error(error)
//             return {
//                 code: 500,
//                 message: '激活AgentRoutine失败'
//             }
//         }
//     }
// }
// /**
//  * @deprecated MGMT接口已废弃，请使用 src/httpdao/cocoadmin/PomAgentRoutineHttpdao中的pomAgentRoutineHttpdao实例
//  */
// export const pomAgentRoutineHttpdao = new PomAgentRoutineHttpdao()
