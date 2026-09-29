/** @format */
import { CommonResult } from './common/cocoadmin.interface'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { getLogger } from '@utils/Logger'

/**
 * 配置中心
 */
export class ConfigHttpdao {
    private log = getLogger(ConfigHttpdao.name)
    async get(key: string): Promise<string | undefined> {
        const config = {
            method: 'get' as const,
            url: env.COCOADMIN_API_URL + `/inner/infra/config/${key}`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<string>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`设置接口失败,入参:${JSON.stringify(config)}`)
            return undefined
        } catch (e) {
            this.log.errorMsg(`设置接口异常: ${e},入参:${JSON.stringify(config)}`)
            return undefined
        }
    }
}
export const configHttpdao = new ConfigHttpdao()
