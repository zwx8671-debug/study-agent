/** @format */

// /** @format */
// import { getLogger } from '@utils/Logger'
// import { env } from '@config/env'
// import axios, { AxiosResponse } from 'axios'
// import { MgmtCommonResponse } from './common/mgmt.interface'
// import { DeviceBindRequest } from '@interface/IDevice'
//
// export class DeviceHttpdao {
//     private log = getLogger('PomTriggerHttpdao')
//     private readonly baseUrl: string
//     // private readonly apiKey: string
//
//     constructor() {
//         this.baseUrl = env.COCOADMIN_API_URL
//         // this.apiKey = env.MGMT_API_KEY
//     }
//
//     async bind(req: DeviceBindRequest): Promise<any> {
//         const config = {
//             method: 'post' as const,
//             url: this.baseUrl + '/device/create/',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             data: {
//                 code: req.code,
//                 name: req.name,
//                 series_num: req.deviceSN,
//                 user: req.userId,
//                 pub_key: req.pubKey
//             }
//         }
//
//         this.log.info('🚀 deviceFlow:', config)
//
//         try {
//             const response: AxiosResponse<MgmtCommonResponse<any>> = await axios(config)
//
//             return response.data.data
//         } catch (error) {
//             this.log.error(error)
//             return null
//         }
//     }
// }
// export const deviceHttpdao = new DeviceHttpdao()
