/** @format */

// /** @format */
// import { getLogger } from '@utils/Logger'
// import { env } from '@config/env'
// import axios, { AxiosResponse } from 'axios'
// import { MgmtCommonResponse } from './common/mgmt.interface'
//
// export interface PomTriggerData {
//     id: string
//     name: string
//     agent: string
//     xml: string
//     description: string
//     deleted: number
//     creator?: string
//     updater?: string
//     create_time: string
//     update_time: string
// }
//
// export class PomTriggerHttpdao {
//     private log = getLogger('PomTriggerHttpdao')
//     private readonly baseUrl: string
//     // private readonly apiKey: string
//
//     constructor() {
//         this.baseUrl = env.COCOADMIN_API_URL
//         // this.apiKey = env.MGMT_API_KEY
//     }
//     async saveTrigger(
//         name: string,
//         xml: string,
//         description: string,
//         agentId: string
//     ): Promise<MgmtCommonResponse<PomTriggerData> | null> {
//         const data = JSON.stringify({ name, agent: agentId, xml, description })
//         this.log.info('trigger params：', data)
//
//         const config = {
//             method: 'post' as const,
//             url: this.baseUrl + '/pom/trigger/create/',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             data: data
//         }
//
//         try {
//             const response: AxiosResponse<MgmtCommonResponse<PomTriggerData>> = await axios(config)
//             this.log.info('保存trigger相应：', JSON.stringify(response.data))
//
//             return response.data
//         } catch (error) {
//             this.log.error(error)
//             return {
//                 code: 500,
//                 msg: '保存trigger失败'
//             }
//         }
//     }
// }
// export const pomTriggerHttpdao = new PomTriggerHttpdao()
