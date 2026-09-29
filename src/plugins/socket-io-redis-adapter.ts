/** @format */

import { Server, Namespace } from 'socket.io'
import { createAdapter } from '@socket.io/redis-streams-adapter'
import { redis } from './ioredis'
import { getLogger } from '@utils/Logger'
import type { RedisStreamsAdapterOptions } from '@socket.io/redis-streams-adapter'
import { env } from '@config/env'
import { DeviceConnectionRedisService } from '@service/redis/DeviceConnectionRedisService'

const logger = getLogger('socket-io-redis-streams-adapter')

/**
 * 配置 Socket.IO 使用 Redis Streams 适配器
 * 实现多实例间的 Socket.IO 消息同步，并支持消息持久化
 * <p>
 * https://socket.nodejs.cn/docs/v4/redis-streams-adapter/
 *
 * @param target Socket.IO 服务器实例或命名空间实例
 * @param streamNameSuffix 可选的 Stream 名称后缀，用于区分不同命名空间
 */
export async function configureSocketIORedisAdapter(
    target: Server | Namespace,
    streamNameSuffix: string = 'socketio-stream'
) {
    try {
        // 获取目标名称（用于日志）
        const targetName = target instanceof Server ? 'Server (all namespaces)' : `Namespace: ${target.name}`

        // 配置适配器选项
        const adapterOptions: RedisStreamsAdapterOptions = {
            // Redis Stream 名称
            streamName: env.REDIS_PREFIX + DeviceConnectionRedisService.COCO_CLOUD_TS + ':' + streamNameSuffix,

            // Redis Stream 最大长度
            maxLen: 10000,

            // 每次读取的消息数量
            readCount: 100
        }

        // 创建并设置适配器（只需要一个 Redis 客户端）
        const adapterConstructor = createAdapter(redis, adapterOptions)
        if (target instanceof Server) {
            target.adapter(adapterConstructor)
        } else {
            // Namespace - 调用构造函数创建 Adapter 实例
            target.adapter = adapterConstructor(target)
        }

        logger.info(`✅ Socket.IO Redis Streams adapter configured successfully for ${targetName}`)
        logger.info(`📡 Using Redis Stream: ${adapterOptions.streamName}`)
        logger.info(`📊 Max stream length: ${adapterOptions.maxLen}`)
        logger.info(`📦 Read count: ${adapterOptions.readCount}`)

        // 监听 Redis 错误事件（只需注册一次）
        if (!redis.listenerCount('error')) {
            redis.on('error', err => {
                logger.error('Redis client error:', err)
            })
        }
    } catch (error) {
        logger.error(
            `❌ Failed to configure Socket.IO Redis Streams adapter for ${target instanceof Server ? 'Server' : target.name}:`,
            error
        )
        throw error
    }
}
