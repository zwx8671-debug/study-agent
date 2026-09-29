/** @format */

// /** @format */
// import { getLogger } from '@utils/Logger'
// import { env } from '@config/env'
// import axios, { AxiosResponse } from 'axios'
// import { MgmtCommonResponse } from './common/mgmt.interface'
// import { buildSystemPromptTree } from './util/buildPromptTree'
//
// export interface SystemPrompt {
//     id: string
//     title_cn: string
//     title_en: string
//     content_cn: string
//     content_en: string
//     order: number
//     type: string
//     parent: string
//     product: string
//     is_del: boolean
//     is_effect: boolean
//     created_at: string
//     updated_at: string
//     children: SystemPrompt[]
// }
//
// /**
//  * 配置中心
//  */
// export class SystemPromptHttpdao {
//     private log = getLogger(SystemPromptHttpdao.name)
//     private readonly baseUrl: string
//     // private readonly apiKey: string
//
//     constructor() {
//         this.baseUrl = env.COCOADMIN_API_URL
//         // this.apiKey = env.MGMT_API_KEY
//     }
//     async listByProductId(productId: number, type: string): Promise<SystemPrompt[] | undefined> {
//         const config = {
//             method: 'get' as const,
//             url: this.baseUrl + `/pom/system_prompt/?product_id=${productId}&type=${type}`,
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         }
//
//         try {
//             const response: AxiosResponse<MgmtCommonResponse<SystemPrompt[]>> = await axios(config)
//
//             if (response.data.data) {
//                 return buildSystemPromptTree(response.data.data)
//             } else {
//                 return undefined
//             }
//         } catch (error) {
//             this.log.error(error)
//             return undefined
//         }
//     }
// }
// export const systemPromptHttpdao = new SystemPromptHttpdao()
