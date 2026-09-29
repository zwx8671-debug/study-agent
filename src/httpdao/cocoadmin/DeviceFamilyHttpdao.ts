/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, DeviceFamilyInnerRespVO } from './common/cocoadmin.interface'

/**
 * 设备家庭空间 HTTP DAO
 */
export class DeviceFamilyHttpdao {
    private log = getLogger(DeviceFamilyHttpdao.name)

    /**
     * 查询设备所属的家庭空间
     * @param deviceSn 设备SN
     * @returns 家庭空间信息或null
     */
    async getByDevice(deviceSn: string): Promise<DeviceFamilyInnerRespVO | null> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/lamp/family/get-by-device`,
            params: {
                deviceSn
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceFamilyInnerRespVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(
                `查询设备所属家庭空间失败: ${response.data.data} ${response.data.msg}, deviceSn: ${deviceSn}`
            )
            return null
        } catch (error) {
            this.log.errorMsg(`查询设备所属家庭空间请求异常, deviceSn: ${deviceSn}`, { errorMsg: error })
            return null
        }
    }
}

export const deviceFamilyHttpdao = new DeviceFamilyHttpdao()
