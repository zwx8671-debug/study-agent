/** @format */

import { Controller, POST } from 'fastify-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { v7 as uuidv7 } from 'uuid'
import type { FastifyRequest } from 'fastify'
import { AgentRelayResponseEvent, MCPConfigPayload, MCPConfigRelayResponse, RelayReq } from '@interface/IAgentRelay'
import { serverInstance } from '@utils/ServerInstance'
import { env } from '@config/env'
import { ResponseFlag } from '@interface/IAgent'
import { CoCoNamespace } from '@interface/ICommon'

@Controller('/agent-relay')
export default class AgentRelayController {
    private logger: Logger = getLogger(AgentRelayController.name)

    /**
     * 转发数据到指定设备的WebSocket连接
     * @param req 包含目标设备、数据类型和具体内容的请求体
     * @returns 转发结果
     */
    @POST('/forward')
    async forwardData(req: FastifyRequest<{ Body: RelayReq }>) {
        const bizReq = req.body
        // 生成请求ID用于追踪
        const reqId = bizReq.reqId || uuidv7()
        this.logger.info(`Received relay req [${reqId}] - device: ${bizReq.deviceSN}, type: ${bizReq.dataType}`)

        try {
            // 获取agent-relay命名空间
            const agentRelayNamespace = serverInstance.getIO().of(env.PATH_PREFIX + CoCoNamespace.AgentRelay)

            // 获取指定设备的room中的客户端数量
            const roomClients = await agentRelayNamespace.in(bizReq.deviceSN).fetchSockets()

            if (roomClients.length === 0) {
                this.logger.warn(`Device ${bizReq.deviceSN} is not connected [${reqId}]`)
                throw new Error(`Device ${bizReq.deviceSN} is not connected`)
            }

            // 根据数据类型进行不同的转发处理
            switch (bizReq.dataType) {
                case 'mcp_config':
                    await this.handleMcpConfigRelay(bizReq.deviceSN, bizReq, reqId)
                    break
                case 'python':
                    await this.handlePythonRelay(bizReq.deviceSN, bizReq, reqId)
                    break
                default:
                    await this.handleGenericRelay(bizReq.deviceSN, bizReq, reqId)
            }

            return `Data relayed to ${bizReq.deviceSN} successfully`
        } catch (error) {
            this.logger.error(`Error relaying data [${reqId}]:`, error)
            throw error
        }
    }

    /**
     * 处理配置信息的转发
     */
    private async handleMcpConfigRelay(deviceSN: string, bizReq: RelayReq<MCPConfigPayload>, reqId: string) {
        SocketCommonResponse.successToAll<MCPConfigRelayResponse>({
            ns: CoCoNamespace.AgentRelay,
            event: AgentRelayResponseEvent.RELAY_CONFIG_UPDATE,
            msg: `Config update req [${reqId}] sent to room ${deviceSN}`,
            room: deviceSN,
            data: {
                reqId,
                timestamp: Date.now(),
                config: bizReq.payload,
                flag: ResponseFlag.START
            }
        })

        this.logger.info(`Config update req [${reqId}] sent to room ${deviceSN}`)
    }

    /**
     * 处理Python函数的转发
     */
    private async handlePythonRelay(deviceSN: string, bizReq: RelayReq, reqId: string) {
        // const agentRelayNamespace = serverInstance.getIO().of(Namespace.AgentRelay)
        // agentRelayNamespace.to(deviceSN).emit(ResponseEvent.PYTHON_EXECUTE, {
        //     reqId,
        //     timestamp: Date.now(),
        //     function: bizReq.payload,
        //     flag: ResponseFlag.START
        // })
        // this.logger.info(`Python execution req [${reqId}] sent to room ${deviceSN}`)
    }

    /**
     * 处理通用类型数据的转发
     */
    private async handleGenericRelay(deviceSN: string, bizReq: RelayReq, reqId: string) {
        // const agentRelayNamespace = serverInstance.getIO().of(Namespace.AgentRelay)
        // agentRelayNamespace.to(deviceSN).emit(ResponseEvent.DATA_RELAY, {
        //     reqId,
        //     timestamp: Date.now(),
        //     dataType: bizReq.dataType,
        //     payload: bizReq.payload,
        //     flag: ResponseFlag.START
        // })
        // this.logger.info(`Generic data relay [${reqId}] of type ${bizReq.dataType} sent to room ${deviceSN}`)
    }
}
