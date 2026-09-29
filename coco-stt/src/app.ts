/** @format */

import './config/env'
import Fastify from 'fastify'
import { Server as SocketIOServer } from 'socket.io'
import MsgpackParser from 'socket.io-msgpack-parser'
import cors from '@fastify/cors'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import { STTSocketHandler } from '@socketio/STTSocket'
import { createUWebSocketsServer } from '@plugins/uwebsockets-socketio'
import { sttHttpRoutePlugin } from './http/STTHttpRoute'
import type { CommonResult } from './types/CommonResult'
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
} from '@interface/ISTT'

const log = getLogger('app')

function ok<T>(data: T, msg = 'ok'): CommonResult<T> {
    return { code: 200, msg, data }
}

async function start() {
    // 创建 Fastify 实例（HTTP API 服务器）
    // bodyLimit: 设置为 50MB，允许较大音频文件上传
    const fastify = Fastify({
        logger: false,
        trustProxy: true,
        bodyLimit: 50 * 1024 * 1024  // 50MB
    })

    // 注册 CORS
    await fastify.register(cors, {
        origin: env.CORS_ORIGIN,
        credentials: true
    })

    // 健康检查路由
    fastify.get('/health', async () => {
        return ok({
            status: 'ok',
            service: 'coco-stt',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            config: {
                enableUWS: true,
                msgPacket: 'BYTE',
                sttServiceType: env.STT_SERVICE_TYPE,
                socketioPort: env.SOCKETIO_PORT,
                pathPrefix: env.PATH_PREFIX
            }
        })
    })

    // STT 状态路由
    fastify.get('/stt/status', async () => {
        return ok({
            sttServiceType: env.STT_SERVICE_TYPE,
            available: true
        })
    })

    // 注册 STT HTTP 一次性识别路由（POST /stt/recognize）
    await fastify.register(sttHttpRoutePlugin)

    // 使用 uWebSockets.js 模式（双端口分离 + msgpack）
    log.info('🚀 Starting in uWebSockets.js mode with msgpack parser...')

    // 创建独立的 Socket.IO 服务器（使用 msgpack 序列化）
    const socketIOServer = new SocketIOServer<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
    >({
        cors: {
            origin: env.CORS_ORIGIN,
            credentials: true
        },
        path: `${env.PATH_PREFIX}/socket.io`,
        parser: MsgpackParser
    })

    // 创建 uWebSockets.js 服务器并绑定 Socket.IO
    const { listen: listenUWS } = createUWebSocketsServer(socketIOServer)

    // 注册 Socket.IO 处理器
    const sttHandler = new STTSocketHandler(socketIOServer)
    sttHandler.register()

    // 启动 Fastify HTTP 服务器
    try {
        await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
        log.info(`✅ Fastify HTTP API server started on port ${env.PORT}`)
    } catch (err) {
        log.error('Failed to start Fastify server:', err)
        process.exit(1)
    }

    // 启动 uWebSockets.js Socket.IO 服务器
    try {
        await listenUWS(env.SOCKETIO_PORT, '0.0.0.0')
        log.info(`✅ uWebSockets.js Socket.IO server started on port ${env.SOCKETIO_PORT}`)
    } catch (err) {
        log.error('Failed to start uWebSockets.js server:', err)
        process.exit(1)
    }

    log.info('=================================')
    log.info('🚀 coco-stt service started')
    log.info(`  HTTP API Port: http://127.0.0.1:${env.PORT}`)
    log.info(`  Socket.IO Port: ${env.SOCKETIO_PORT}`)
    log.info(`  STT Service Type: ${env.STT_SERVICE_TYPE}`)
    log.info(`  Performance: uWebSockets.js`)
    log.info('=================================')

    // 优雅关闭
    const gracefulShutdown = async (signal: string) => {
        log.info(`${signal} received, shutting down gracefully...`)
        try {
            await fastify.close()
            socketIOServer.close()
            log.info('Server closed successfully')
            process.exit(0)
        } catch (err) {
            log.error('Error during shutdown:', err)
            process.exit(1)
        }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

start()
