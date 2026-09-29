/** @format */

import { getLogger, Logger } from '@utils/Logger'
import { Service } from 'fastify-decorators'
import { redis } from '@plugin/ioredis'
import { env } from '@config/env'
import { PromptData } from '@interface/IAgent'

/**
 * 设备 Prompt 数据 Redis 存储服务
 * 用于管理设备的 Prompt 数据
 */
@Service()
export class DeviceResourcePromptRedisService {
    // 用于项目隔离
    public static COCO_CLOUD_TS: string = 'coco-cloud-ts'
    // 设备 Prompt Key 前缀
    public static readonly DEVICE_PROMPT_KEY_PREFIX =
        env.REDIS_PREFIX + DeviceResourcePromptRedisService.COCO_CLOUD_TS + ':device-prompt:'

    private readonly logger: Logger = getLogger(DeviceResourcePromptRedisService.name)

    /**
     * 设置/更新设备 Prompt 数据
     * @param deviceSN 设备序列号
     * @param name Prompt 名称（作为 Hash 的 field）
     * @param promptData Prompt 数据
     */
    public async setPrompt(deviceSN: string, name: string, promptData: PromptData): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }
        if (!promptData) {
            throw new Error('promptData must be provided')
        }

        const key = `${DeviceResourcePromptRedisService.DEVICE_PROMPT_KEY_PREFIX}${deviceSN}`
        const value = JSON.stringify(promptData)
        await redis.hset(key, name, value)
        this.logger.info(`Saved prompt for device: ${deviceSN}, name: ${name}`)
    }

    /**
     * 删除设备的单个 Prompt 数据
     * @param deviceSN 设备序列号
     * @param name Prompt 名称
     */
    public async deletePrompt(deviceSN: string, name: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }

        const key = `${DeviceResourcePromptRedisService.DEVICE_PROMPT_KEY_PREFIX}${deviceSN}`
        await redis.hdel(key, name)
        this.logger.info(`Deleted prompt for device: ${deviceSN}, name: ${name}`)
    }

    /**
     * 获取设备的所有 Prompt 数据
     * @param deviceSN 设备序列号
     * @returns Prompt 数据数组
     */
    public async getPrompts(deviceSN: string): Promise<PromptData[]> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${DeviceResourcePromptRedisService.DEVICE_PROMPT_KEY_PREFIX}${deviceSN}`
        const promptMap = await redis.hgetall(key)

        if (!promptMap || Object.keys(promptMap).length === 0) {
            this.logger.debug(`No prompts found for device: ${deviceSN}`)
            return []
        }

        const prompts: PromptData[] = []
        for (const [name, value] of Object.entries(promptMap)) {
            try {
                const promptData = JSON.parse(value) as PromptData
                prompts.push(promptData)
            } catch (error) {
                this.logger.error(`Failed to parse prompt data for device: ${deviceSN}, name: ${name}`, error)
            }
        }

        this.logger.debug(`Retrieved ${prompts.length} prompts for device: ${deviceSN}`)
        return prompts
    }

    /**
     * 获取设备的所有 Prompt 数据
     * @param deviceSN 设备序列号
     * @returns Prompt 数据数组
     */
    public async getPromptEntries(deviceSN: string): Promise<{ routinePE: PromptData; resourcePE: PromptData[] }> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${DeviceResourcePromptRedisService.DEVICE_PROMPT_KEY_PREFIX}${deviceSN}`
        const promptMap = await redis.hgetall(key)

        if (!promptMap || Object.keys(promptMap).length === 0) {
            this.logger.debug(`No prompts found for device: ${deviceSN}`)
            return { routinePE: { key: '', prompt: '' }, resourcePE: [] }
        }

        const prompts: { routinePE: PromptData; resourcePE: PromptData[] } = {
            routinePE: { key: '', prompt: '' },
            resourcePE: []
        }
        for (const [name, value] of Object.entries(promptMap)) {
            try {
                if (name === 'routine_pe') {
                    prompts.routinePE = JSON.parse(value) as PromptData
                } else {
                    const promptData = JSON.parse(value) as PromptData
                    prompts.resourcePE.push(promptData)
                }
            } catch (error) {
                this.logger.error(`Failed to parse prompt data for device: ${deviceSN}, name: ${name}`, error)
            }
        }

        return prompts
    }

    /**
     * 删除设备的所有 Prompt 数据（设备下线时调用）
     * @param deviceSN 设备序列号
     */
    public async deleteAllPrompts(deviceSN: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${DeviceResourcePromptRedisService.DEVICE_PROMPT_KEY_PREFIX}${deviceSN}`
        await redis.del(key)
        this.logger.info(`Deleted all prompts for device: ${deviceSN}`)
    }
}
