/** @format */
// The routes for Socket.IO

import { FastifyInstance } from 'fastify'
import { SocketControllerBootstrap } from '@utils/socket-decorators'
import AgentSocket from '../socketio/AgentSocket'
import AgentRelaySocket from '../socketio/AgentRelaySocket'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import { instrument } from '@socket.io/admin-ui'
import AgentTriggerSocket from '../socketio/AgentTriggerSocket'
import { AgentAudioSocket } from '../socketio/AgentAudioSocket'
import AgentDataSocket from '../socketio/AgentDataSocket'
import { CoCoNamespace } from '@interface/ICommon'
import { configureSocketIORedisAdapter } from '@plugin/socket-io-redis-adapter'

const logger = getLogger('socket-io')

export async function socketIORoute(app: FastifyInstance) {
    // 在 Fastify 实例准备完成后设置 Socket.IO 路由
    app.ready(async err => {
        if (err) throw err

        // TODO 只有在分布式的时候，需要广播全部节点才需要 配置 Socket.IO 使用 Redis Streams 适配器
        // https://coco-project.feishu.cn/wiki/ZZa6wO0UUiTzd5kuKupcscp4n5b
        /*        configureSocketIORedisAdapter(app.io)
            .then(() => {
                logger.info('✅ Socket.IO Redis Streams adapter configured')
            })
            .catch(error => {
                logger.error('❌ Failed to configure Socket.IO Redis Streams adapter:', error)
            })*/

        // 配置 Socket.IO 管理面板，此方法会emit数据到 namespace=/admin
        console.log(`process.env.NODE_ENV:${process.env.NODE_ENV}`)
        instrument(app.io, {
            auth: {
                type: 'basic',
                username: 'admin',
                // https://socket.io/zh-CN/docs/v4/admin-ui/
                // https://www.bcrypt.fr/ 密码：yuewa
                password: '$2y$10$cTSUG1Zdy7Ng.FkH5viH7eMuM/D5iRZ/XpQ9mwwGrdU0Kua6c8R6m'
            },
            serverId: 'coco-ts ' + process.pid,
            mode: 'development'
        })

        // 使用装饰器系统注册控制器
        // 支持可配置的路径前缀，用于 k8s ingress 部署
        SocketControllerBootstrap.registerController(app.io, AgentSocket, env.PATH_PREFIX)
        SocketControllerBootstrap.registerController(app.io, AgentAudioSocket, env.PATH_PREFIX)
        SocketControllerBootstrap.registerController(app.io, AgentRelaySocket, env.PATH_PREFIX)
        SocketControllerBootstrap.registerController(app.io, AgentTriggerSocket, env.PATH_PREFIX)
        SocketControllerBootstrap.registerController(app.io, AgentDataSocket, env.PATH_PREFIX)

        logger.info('🚀 Socket.IO routes configured with decorators')
        logger.info(`🔌 Socket.IO endpoint: ${env.PATH_PREFIX}/socket.io/`)

        // 为 AgentData 命名空间配置 Redis Streams 适配器
        // 支持多实例间的家庭人脸同步等加密数据同步
        // 其他命名空间保持使用内存适配器（默认行为）
        const agentDataNamespace = app.io.of(env.PATH_PREFIX + CoCoNamespace.AgentData)
        await configureSocketIORedisAdapter(agentDataNamespace, 'agent-data-stream')
        logger.info('✅ AgentData namespace configured with Redis Streams adapter')
        logger.info('ℹ️  Other namespaces are using in-memory adapter (default)')
    })
}
