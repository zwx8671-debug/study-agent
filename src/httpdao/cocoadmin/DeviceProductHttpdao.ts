/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, DeviceProductVO } from './common/cocoadmin.interface'

/**
 * 设备产品 HTTP DAO
 */
export class DeviceProductHttpdao {
    private log = getLogger(DeviceProductHttpdao.name)

    /**
     * 根据产品ID查询产品信息
     * @param productId 产品ID
     * @returns 产品信息或undefined
     */
    async findById(productId: number): Promise<DeviceProductVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-product/${productId}`,
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceProductVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询产品失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询产品请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }
}

export const deviceProductHttpdao = new DeviceProductHttpdao()
