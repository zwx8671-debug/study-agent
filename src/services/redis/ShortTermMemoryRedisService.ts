/** @format */

import { getLogger, Logger } from '@utils/Logger'
import { Service } from 'fastify-decorators'
import { redis } from '@plugin/ioredis'
import { env } from '@config/env'
import { v7 } from 'uuid'

/**
 * 短期记忆 Redis 存储服务
 * 用于管理设备的短期记忆数据（extPrompt）
 * 每条记忆都有独立的 TTL
 */
@Service()
export class ShortTermMemoryRedisService {
    // 用于项目隔离
    public static COCO_CLOUD_TS: string = 'coco-cloud-ts'
    // 短期记忆 Key 前缀
    public static readonly SHORT_TERM_MEMORY_KEY_PREFIX =
        env.REDIS_PREFIX + ShortTermMemoryRedisService.COCO_CLOUD_TS + ':short-term-memory:'
    // 短期记忆索引 Key 前缀（用于存储所有记忆的 key 列表）
    public static readonly SHORT_TERM_MEMORY_INDEX_PREFIX =
        env.REDIS_PREFIX + ShortTermMemoryRedisService.COCO_CLOUD_TS + ':short-term-memory-index:'

    private readonly logger: Logger = getLogger(ShortTermMemoryRedisService.name)

    /**
     * 添加短期记忆
     * @param deviceSN 设备序列号
     * @param extPrompt 扩展提示词内容
     * @param ttl TTL时间（秒），默认300秒（5分钟）
     */
    public async addMemory(deviceSN: string, extPrompt: string, ttl: number = 300): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }
        if (!extPrompt) {
            throw new Error('extPrompt must be provided')
        }

        // 生成唯一的记忆 key
        const memoryId = v7()
        const memoryKey = `${ShortTermMemoryRedisService.SHORT_TERM_MEMORY_KEY_PREFIX}${deviceSN}:${memoryId}`
        const indexKey = `${ShortTermMemoryRedisService.SHORT_TERM_MEMORY_INDEX_PREFIX}${deviceSN}`

        // 保存记忆内容并设置 TTL
        await redis.setex(memoryKey, ttl, extPrompt)

        // 将记忆 key 添加到索引集合中，并设置相同的 TTL
        await redis.sadd(indexKey, memoryKey)
        await redis.expire(indexKey, ttl)

        this.logger.info(`Added short-term memory for device: ${deviceSN}, memoryId: ${memoryId}, ttl: ${ttl}s`)
    }

    /**
     * 获取设备的所有短期记忆
     * @param deviceSN 设备序列号
     * @returns 短期记忆内容数组
     */
    public async getMemories(deviceSN: string): Promise<string[]> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const indexKey = `${ShortTermMemoryRedisService.SHORT_TERM_MEMORY_INDEX_PREFIX}${deviceSN}`

        // 获取所有记忆 key
        const memoryKeys = await redis.smembers(indexKey)

        if (!memoryKeys || memoryKeys.length === 0) {
            this.logger.debug(`No short-term memories found for device: ${deviceSN}`)
            return []
        }

        // 批量获取所有记忆内容
        const memories: string[] = []
        const validKeys: string[] = []

        for (const memoryKey of memoryKeys) {
            const memory = await redis.get(memoryKey)
            if (memory) {
                memories.push(memory)
                validKeys.push(memoryKey)
            } else {
                // 如果记忆已过期，从索引中移除
                await redis.srem(indexKey, memoryKey)
            }
        }

        this.logger.debug(`Retrieved ${memories.length} short-term memories for device: ${deviceSN}`)
        return memories
    }

    /**
     * 删除设备的所有短期记忆（可选功能，用于手动清理）
     * @param deviceSN 设备序列号
     */
    public async deleteAllMemories(deviceSN: string): Promise<void> {
        if (!deviceSN) {
            throw new Error('deviceSN must be provided')
        }

        const indexKey = `${ShortTermMemoryRedisService.SHORT_TERM_MEMORY_INDEX_PREFIX}${deviceSN}`

        // 获取所有记忆 key
        const memoryKeys = await redis.smembers(indexKey)

        if (memoryKeys && memoryKeys.length > 0) {
            // 删除所有记忆内容
            await redis.del(...memoryKeys)
        }

        // 删除索引
        await redis.del(indexKey)

        this.logger.info(`Deleted all short-term memories for device: ${deviceSN}`)
    }
}
