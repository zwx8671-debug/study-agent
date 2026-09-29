/** @format */

import { Service } from 'fastify-decorators'
import { getLogger } from '@utils/Logger'
import { deviceHttpdao } from '../httpdao/cocoadmin/DeviceHttpdao'

/**
 * 设备信息
 */
export interface DeviceInfo {
    id: string
    seriesNum: string
    name?: string
    userId: number
    productId?: number
    pubKey?: string
    bindFlag: boolean
    bindTime: string | null
}

// 设备验证结果接口
export interface DeviceValidationResult {
    isValid: boolean
    device?: DeviceInfo
    error?: string
}

@Service()
export class DeviceService {
    private readonly log = getLogger(DeviceService.name)

    /**
     * 根据设备SN获取设备信息
     * @param deviceSN 设备序列号
     * @returns 设备信息或null
     */
    async getDeviceBySN(deviceSN: string): Promise<DeviceInfo | null> {
        try {
            const result = await deviceHttpdao.getDeviceBySN(deviceSN.trim())

            if (!result) {
                this.log.warn(`Device not found: ${deviceSN}`)
                return null
            }

            return {
                id: result.id,
                seriesNum: result.seriesNum,
                name: result.name,
                userId: result.userId,
                productId: result.productId,
                pubKey: result.pubKey,
                bindFlag: result.bindFlag,
                bindTime: result.bindTime
            }
        } catch (error) {
            this.log.error('Error getting device by SN:', error)
            return null
        }
    }

    /**
     * 检查设备是否存在、是否属于指定用户
     * @param deviceSN 设备序列号
     * @param userId 用户ID
     * @returns 设备验证结果
     */
    async checkDeviceInUser(deviceSN: string, userId: number): Promise<DeviceValidationResult> {
        try {
            const device = await this.getDeviceBySN(deviceSN)
            if (!device || !device.bindFlag) {
                return {
                    isValid: false,
                    error: 'Device not found or inactive'
                }
            }

            // 检查设备是否属于当前用户
            if (device.userId !== userId) {
                return {
                    isValid: false,
                    error: 'Device not belong to user'
                }
            }

            return {
                isValid: true,
                device
            }
        } catch (error) {
            this.log.error('Error checking device in user:', error)
            return {
                isValid: false,
                error: 'Error during device check'
            }
        }
    }
}
