/** @format */

import { getLogger, Logger } from '@utils/Logger'
import { Service } from 'fastify-decorators'
import { redis } from '@plugin/ioredis'
import { env } from '@config/env'
import { StateData } from '@interface/IAgent'

/**
 * 设备状态数据 Redis 存储服务
 * 用于管理设备的状态机数据
 */
@Service()
export class DeviceStateRedisService {
    // 用于项目隔离
    public static COCO_CLOUD_TS: string = 'coco-cloud-ts'
    // 设备状态 Key 前缀
    public static readonly DEVICE_STATE_KEY_PREFIX =
        env.REDIS_PREFIX + DeviceStateRedisService.COCO_CLOUD_TS + ':device-state:'

    private readonly logger: Logger = getLogger(DeviceStateRedisService.name)

    /**
     * 设置/更新设备状态数据
     * @param deviceSN 设备序列号
     * @param name 状态名称（作为 Hash 的 field）
     * @param stateData 状态数据
     */
    public async setState(deviceSN: string, name: string, stateData: StateData): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }
        if (!stateData) {
            throw new Error('stateData must be provided')
        }

        const key = `${DeviceStateRedisService.DEVICE_STATE_KEY_PREFIX}${deviceSN}`
        const value = JSON.stringify(stateData)
        await redis.hset(key, name, value)
        this.logger.info(`Saved state for device: ${deviceSN}, name: ${name}`)
    }

    /**
     * 删除设备的单个状态数据
     * @param deviceSN 设备序列号
     * @param name 状态名称
     */
    public async deleteState(deviceSN: string, name: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }

        const key = `${DeviceStateRedisService.DEVICE_STATE_KEY_PREFIX}${deviceSN}`
        await redis.hdel(key, name)
        this.logger.info(`Deleted state for device: ${deviceSN}, name: ${name}`)
    }

    /**
     * 获取设备的所有状态数据
     * @param deviceSN 设备序列号
     * @returns 状态数据数组
     */
    public async getStates(deviceSN: string): Promise<StateData[]> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${DeviceStateRedisService.DEVICE_STATE_KEY_PREFIX}${deviceSN}`
        const stateMap = await redis.hgetall(key)

        if (!stateMap || Object.keys(stateMap).length === 0) {
            this.logger.debug(`No states found for device: ${deviceSN}`)
            return []
        }

        const states: StateData[] = []
        for (const [name, value] of Object.entries(stateMap)) {
            try {
                const stateData = JSON.parse(value) as StateData
                states.push(stateData)
            } catch (error) {
                this.logger.error(`Failed to parse state data for device: ${deviceSN}, name: ${name}`, error)
            }
        }

        this.logger.debug(`Retrieved ${states.length} states for device: ${deviceSN}`)
        return states
    }

    /**
     * 删除设备的所有状态数据（设备下线时调用）
     * @param deviceSN 设备序列号
     */
    public async deleteAllStates(deviceSN: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${DeviceStateRedisService.DEVICE_STATE_KEY_PREFIX}${deviceSN}`
        await redis.del(key)
        this.logger.info(`Deleted all states for device: ${deviceSN}`)
    }
}
