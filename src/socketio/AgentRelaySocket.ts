/** @format */

import { CocoSocket, OnConnect, OnDisconnect, SocketNamespace } from '@utils/socket-decorators'
import { auth } from '@middlewares/socket-auth.middleware'
import { JoinResponse } from '@interface/IAgent'
import { getLogger, Logger } from '@utils/Logger'
import { AuthType, CoCoNamespace } from '@interface/ICommon'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { AgentRelayResponseEvent } from '@interface/IAgentRelay'

@SocketNamespace(CoCoNamespace.AgentRelay, [auth])
export default class AgentRelaySocket {
    private logger: Logger = getLogger(AgentRelaySocket.name)

    @OnConnect()
    async connected(socket: CocoSocket) {
        try {
            // 检查是否是设备连接（通过请求头中的device-sn判断）
            const authType = socket.data.authType
            if (authType === AuthType.client) {
                // 设备连接处理
                this.logger.info(`Device connection attempt with SN: ${socket.data.device?.deviceSN}`)
                socket.join(socket.data.device!.deviceSN)

                SocketCommonResponse.success<JoinResponse>({
                    socket,
                    event: AgentRelayResponseEvent.JOIN,
                    data: null,
                    msg: `${authType} 设备连接成功`
                })
            }
        } catch (e) {
            SocketCommonResponse.error({ socket, event: AgentRelayResponseEvent.CONNECT, msg: (e as Error).message })
            this.logger.error('Error processing Socket.IO connect message:', e)
        }
    }

    @OnDisconnect()
    async disconnect(socket: CocoSocket, reason: string) {
        this.logger.warn(
            `【断连】 [${socket.data.authType}(${socket.id})] disconnected from agent-relay , reason: ${reason}`
        )
    }
}
