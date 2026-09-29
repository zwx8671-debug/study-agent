/** @format */

import { getLogger, Logger } from '@utils/Logger'
import { Service } from 'fastify-decorators'
import { redis } from '@plugin/ioredis'
import { env } from '@config/env'

/**
 * trigger 设备级别 提示词 保存到 redis
 */
@Service()
export class TriggerPromptRedisService {
    // 用于项目隔离
    public static COCO_CLOUD_TS: string = 'coco-cloud-ts'
    // 设备级别提示词 Key 前缀
    public static readonly TRIGGER_PROMPT_KEY_PREFIX =
        env.REDIS_PREFIX + TriggerPromptRedisService.COCO_CLOUD_TS + ':trigger-prompt:'

    private readonly logger: Logger = getLogger(TriggerPromptRedisService.name)

    /**
     * 保存设备级别提示词到 Redis (使用 Hash 结构)
     * @param deviceSN 设备序列号
     * @param name 提示词名称
     * @param prompt 提示词内容
     */
    public async setPrompt(deviceSN: string, name: string, prompt: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }

        const key = `${TriggerPromptRedisService.TRIGGER_PROMPT_KEY_PREFIX}${deviceSN}`
        await redis.hset(key, name, prompt)
        this.logger.info(`Saved trigger prompt for device: ${deviceSN}, name: ${name}`)
    }

    /**
     * 获取设备级别单个提示词
     * @param deviceSN 设备序列号
     * @param name 提示词名称
     * @returns 提示词内容，如果不存在则返回 null
     */
    public async getPromptByName(deviceSN: string, name: string): Promise<string | null> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!name) {
            throw new Error('name must be provided')
        }

        const key = `${TriggerPromptRedisService.TRIGGER_PROMPT_KEY_PREFIX}${deviceSN}`
        const prompt = await redis.hget(key, name)
        this.logger.debug(`Retrieved trigger prompt for device: ${deviceSN}, name: ${name}`)
        return prompt
    }

    /**
     * 获取设备级别所有提示词
     * @param deviceSN 设备序列号
     * @returns 提示词 Map 对象，key 为 name，value 为 prompt
     */
    public async getAllPrompts(deviceSN: string): Promise<Record<string, string>> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${TriggerPromptRedisService.TRIGGER_PROMPT_KEY_PREFIX}${deviceSN}`
        const prompts = await redis.hgetall(key)
        this.logger.debug(`Retrieved all trigger prompts for device: ${deviceSN}`)
        return prompts
    }

    /**
     * 删除设备级别提示词（设备下线时调用）
     * @param deviceSN 设备序列号
     */
    public async deletePrompt(deviceSN: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const key = `${TriggerPromptRedisService.TRIGGER_PROMPT_KEY_PREFIX}${deviceSN}`
        await redis.del(key)
        this.logger.info(`Deleted trigger prompt for device: ${deviceSN}`)
    }
}
