/** @format */

import './config/env'
import Fastify from 'fastify'
import { Server as SocketIOServer } from 'socket.io'
import MsgpackParser from 'socket.io-msgpack-parser'
import cors from '@fastify/cors'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import { TTSSocketHandler } from '@socketio/TTSSocket'
import { createUWebSocketsServer } from '@plugins/uwebsockets-socketio'
import { TTSFactory } from '@tts/TTSFactory'
import { ttsHttpRoutePlugin } from './http/TTSHttpRoute'
import { ok } from './types/CommonResult'
import { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '@interface/ITTSSocket'

const log = getLogger('app')

async function start() {
    // 创建 Fastify 实例（HTTP API 服务器）
    const fastify = Fastify({
        logger: false,
        trustProxy: true,
        bodyLimit: 10 * 1024 * 1024 // 10MB，TTS 入参为文本，留足冗余
    })

    // 注册 CORS
    await fastify.register(cors, {
        origin: env.CORS_ORIGIN,
        credentials: true
    })

    // 健康检查路由
    fastify.get('/health', async () => {
        const { format, sampleRate } = TTSFactory.audioMeta
        return ok({
            status: 'ok',
            service: 'coco-tts',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            config: {
                enableUWS: true,
                msgPacket: 'BYTE',
                ttsServiceType: env.TTS_SERVICE_TYPE,
                format,
                sampleRate
            }
        })
    })

    // 注册 TTS HTTP 路由（/tts/status、/tts/synthesize、/tts/synthesize/stream）
    await fastify.register(ttsHttpRoutePlugin)

    // 使用 uWebSockets.js 模式（双端口分离 + msgpack）
    log.info('🚀 Starting in uWebSockets.js mode with msgpack parser...')

    // 创建独立的 Socket.IO 服务器（使用 msgpack 序列化，音频二进制传输更省带宽）
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
        parser: MsgpackParser,
        pingInterval: 2000,
        pingTimeout: 5000,
        maxHttpBufferSize: 10 * 1024 * 1024
    })

    // 创建 uWebSockets.js 服务器并绑定 Socket.IO
    const { listen: listenUWS } = createUWebSocketsServer(socketIOServer)

    // 注册 Socket.IO 处理器
    const ttsHandler = new TTSSocketHandler(socketIOServer)
    ttsHandler.register()

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

    const { format, sampleRate } = TTSFactory.audioMeta
    log.info('=================================')
    log.info('🚀 coco-tts service started')
    log.info(`  HTTP API Port: http://127.0.0.1:${env.PORT}`)
    log.info(`  Socket.IO Port: ${env.SOCKETIO_PORT}`)
    log.info(`  TTS Service Type: ${env.TTS_SERVICE_TYPE}`)
    log.info(`  Audio: ${format} @ ${sampleRate}Hz`)
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
