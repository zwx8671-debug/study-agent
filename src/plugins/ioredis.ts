/** @format */

import fp from 'fastify-plugin'
import Redis, { Cluster } from 'ioredis'
import { env } from '@config/env'

// AWS MemoryDB使用Cluster模式，本地开发使用单节点模式
const redis: Redis | Cluster = env.REDIS_CLUSTER
    ? new Cluster(
          [
              {
                  host: env.REDIS_HOST,
                  port: env.REDIS_PORT
              }
          ],
          {
              dnsLookup: (address, callback) => callback(null, address),
              redisOptions: {
                  ...(env.REDIS_USER && { username: env.REDIS_USER }),
                  password: env.REDIS_PASS,
                  ...(env.REDIS_TLS && { tls: {} })
              }
          }
      )
    : new Redis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          ...(env.REDIS_USER && { username: env.REDIS_USER }),
          password: env.REDIS_PASS,
          db: env.REDIS_DB,
          ...(env.REDIS_TLS && { tls: {} })
      })

export default fp(async fastify => {
    // 测试redis连接
    await redis.ping()
    fastify.log.info(`Redis(${env.REDIS_HOST}:${env.REDIS_PORT}) connected successfully`)
    fastify.decorate('redis', redis as any)
})

export { redis }
