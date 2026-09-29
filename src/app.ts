/** @format */
// 在 src/app.ts 文件的最顶部添加了 import 'reflect-metadata'
// 确保在任何使用装饰器的代码执行之前，Reflect API 已经被正确初始化。
import 'reflect-metadata'
import fastify from 'fastify'
import cors from '@fastify/cors'
import i18n from 'fastify-i18n'
import { resolve } from 'path'
import { bootstrap, getInstanceByToken } from 'fastify-decorators'
import { env } from '@config/env'
import { i18nConfig } from '@config/i18n.config'
import { corsConfig } from '@config/cors.config'
import redis from '@plugin/ioredis'
import { Server as SocketIOServer } from 'socket.io'
import socketIO, { FastifySocketioOptions } from 'fastify-socket.io'
// 导入 msgpack 解析器（需要先安装：yarn add socket.io-msgpack-parser）
import msgpackParser from 'socket.io-msgpack-parser'
import { socketIORoute } from '@route/socket'
import { getLogger } from '@utils/Logger'
import { serverInstance } from '@utils/ServerInstance'
import { errorHandler, httpRequest, httpResponse, onSend } from '@middlewares/http-interceptor.middleware'
import { register } from './prometheus/metrics'
import { ConfigService } from '@service/ConfigService'
import { setupAxiosInterceptors } from '@utils/AxiosInterceptor'
import { SpaceUserInfoSyncRedisService } from '@service/redis/SpaceUserInfoSyncRedisService'
import * as v8 from 'v8'

// 初始化 Axios 拦截器，自动记录第三方 HTTP 请求监控指标
setupAxiosInterceptors()

const app = fastify({ logger: getLogger('app').getPinoLogger() })

// 解析二进制音频请求体，供 STT HTTP 接口直接转发使用
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload)
})

// 设置全局 server 实例，供服务层使用
serverInstance.setServer(app)

/**
 * onRequest	    请求刚到达，未匹配路由	        可拦截请求（如 IP 黑名单），无法访问 request.routeOptions
 * preParsing	    请求体解析前	                可修改原始 payload（如添加默认字段）
 * preValidation	请求体解析后，验证前	        可二次验证解析后的数据（如必填字段检查）
 * preHandler	    路由匹配后，处理函数执行前	    可注入上下文（如用户信息）、路由级授权
 * onSend	        处理函数执行后，响应发送前	    可修改响应数据（如统一包装格式）
 * onResponse	    响应发送后	                仅用于日志、统计，无法修改响应
 */
// 注册 HTTP 全局拦截器中间件
app.addHook('onRequest', httpRequest)
app.addHook('onResponse', httpResponse)
app.addHook('onSend', onSend)

// 自定义全局错误处理器，覆盖Fastify默认的错误处理
app.setErrorHandler(errorHandler)

// 注册 CORS 插件，允许跨域
app.register(cors, corsConfig)

// 注册 Redis 插件
app.register(redis)

// 注册 i18n 插件
app.register(i18n, i18nConfig)

// 注册 POST/GET 等 HTTP 路由，都在 controllers 目录下
// 支持可配置的路径前缀，用于 k8s ingress 部署
app.register(bootstrap, {
    directory: resolve(__dirname, `controllers`),
    prefix: env.PATH_PREFIX,
    // 自定义mask以匹配以Controller.ts结尾的文件  fastify-decorators 默认使用正则表达式 /\.(handler|controller)\./ 来匹配控制器文件
    mask: /Controller.*$/
})

// Socket.IO 配置
const socketIOConfig = {
    cors: corsConfig,
    path: `${env.PATH_PREFIX}/socket.io`,
    // 使用 msgpack 解析器：直接传输二进制数据，避免 base64 编解码
    // 优势：减少 33% 数据传输量，降低 CPU 编解码开销
    // parser: msgpackParser,
    // 若干秒发一次 ping（默认 25000）
    pingInterval: 2000,
    // 该参数限制通过 HTTP 传输（包括长轮询、升级请求等）的单条消息大小，默认值为 1MB。
    // 如果消息超过此限制，服务器会主动断开连接
    maxHttpBufferSize: 10 * 1024 * 1024,
    // 等待 pong 的超时时间（默认 60000）
    pingTimeout: 5000
}

// 根据环境变量决定是否使用 uWebSockets.js
if (env.ENABLE_UWS) {
    // ✅ 使用 uWebSockets.js 降低 40% 内存开销，提升 2-3倍吞吐量
    app.log.info('🚀 uWebSockets.js mode enabled')

    // 创建独立的 Socket.IO 服务器实例（不通过 fastify-socket.io 插件）
    const io = new SocketIOServer(socketIOConfig)

    // 将 Socket.IO 实例挂载到 Fastify 以保持兼容性
    app.decorate('io', io)

    // 注册 Socket.IO 路由和控制器
    app.register(socketIORoute)
} else {
    // 传统模式：使用 fastify-socket.io 插件
    app.log.info('📦 Traditional fastify-socket.io mode (set ENABLE_UWS=true to use uWebSockets.js)')

    app.register(socketIO, {
        ...socketIOConfig,
        preClose: done => {
            app.io.local.disconnectSockets(true)
            app.log.info('Socket.IO disconnected all sockets')
            done()
        }
    } as FastifySocketioOptions)

    app.register(socketIORoute)
}

//暴露监控端点
app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return reply.send(await register.metrics())
})

const start = async () => {
    try {
        if (env.ENABLE_UWS) {
            // ✅ 双端口模式：uWebSockets.js (Socket.IO) + Fastify (HTTP API) 分离部署
            const { createUWebSocketsServer } = await import('@plugin/uwebsockets-socketio')

            // 准备 Fastify（但不监听端口）
            await app.ready()
            app.printRoutes()

            // 创建 uWebSockets.js + Socket.IO 服务器（纯 WebSocket 模式，不代理 HTTP）
            const uwsServer = createUWebSocketsServer(app.io)

            // 并行启动两个服务器
            await Promise.all([
                // 1. uWebSockets.js 监听 Socket.IO 端口
                uwsServer.listen(env.SOCKETIO_PORT, env.HOST),
                // 2. Fastify 监听 HTTP API 端口
                app.listen({ port: env.PORT, host: env.HOST })
            ])

            app.log.info('='.repeat(60))
            app.log.info('✅ Dual-port mode started successfully!')
            app.log.info(`📡 Socket.IO (uWebSockets.js): ${env.HOST}:${env.SOCKETIO_PORT}`)
            app.log.info(`📦 HTTP API (Fastify): ${env.HOST}:${env.PORT}`)
            app.log.info('='.repeat(60))
        } else {
            // 传统模式：Fastify + Socket.IO 共用单端口
            await app.listen({ port: env.PORT, host: env.HOST })
            app.printRoutes()

            app.log.info('='.repeat(60))
            app.log.info('📦 Traditional single-port mode (Fastify + Socket.IO)')
            app.log.info(`🌐 Listening on: ${env.HOST}:${env.PORT}`)
            app.log.info('='.repeat(60))
        }

        // 打印服务类型配置
        app.log.info('Service Type Configuration:')
        app.log.info(`  TTS Service Type: ${env.TTS_SERVICE_TYPE}`)
        app.log.info(`  STT Service Type: ${env.STT_SERVICE_TYPE}`)
        app.log.info(`  LLM MOCK: ${env.USE_MOCK_LLM}`)

        // 打印最大可申请的堆内存
        const heapStats = v8.getHeapStatistics()
        const heapSizeLimitMB = (heapStats.heap_size_limit / 1024 / 1024).toFixed(2)
        const heapSizeLimitGB = (heapStats.heap_size_limit / 1024 / 1024 / 1024).toFixed(2)
        app.log.info(`Memory Configuration:  Maximum heap size limit: ${heapSizeLimitMB} MB (${heapSizeLimitGB} GB)`)
        app.log.info('='.repeat(60))

        // 启用system配置
        const configService = getInstanceByToken<ConfigService>(ConfigService)
        await configService.resetConfig()

        // 启动家庭用户信息同步 Redis 队列消费者（包含人脸和声纹）
        const spaceUserInfoSyncService =
            getInstanceByToken<SpaceUserInfoSyncRedisService>(SpaceUserInfoSyncRedisService)
        await spaceUserInfoSyncService.startConsumer()
        app.log.info('✅ Space user info sync Redis consumer started (face & voice)')
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}
start()

app.ready(() => {
    console.log(app.printRoutes())
})
