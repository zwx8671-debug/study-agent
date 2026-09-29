/** @format */

import type { Server } from 'socket.io'
import type { Sequelize } from 'sequelize-typescript'
import type Redis from 'ioredis'

declare module 'fastify' {
    interface FastifyInstance {
        io: Server
        db: Sequelize
        redis: Redis
    }

    /**
     * 扩展 FastifyRequest 接口，添加性能监控相关的属性
     *
     * @property metricsStartTime - 用于记录请求开始时间的高精度时间戳，
     *                             使用 BigInt 类型存储纳秒级时间，
     *                             可选属性用于支持性能指标统计功能
     */
    interface FastifyRequest {
        metricsStartTime?: bigint
    }
}
