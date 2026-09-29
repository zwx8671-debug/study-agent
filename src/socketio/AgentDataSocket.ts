/** @format */
import { getLogger, type Logger } from '@utils/Logger'
import { CocoSocket, OnConnect, OnDisconnect, SocketEvent, SocketNamespace } from '@utils/socket-decorators'
import {
    AgentDataEvent,
    AuthType,
    CoCoNamespace,
    CODE,
    ConnectedResponse,
    GetSpacesStrangerListReq,
    SocketResponse,
    SpaceStrangerFaceItem
} from '@interface/ICommon'
import { ResponseEvent } from '@interface/IAgent'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { auth } from '@middlewares/socket-auth.middleware'
import { getInstanceByToken } from 'fastify-decorators'
import { DeviceConnectionRedisService } from '@service/redis/DeviceConnectionRedisService'
import { env } from '@config/env'
import { deviceFamilyHttpdao } from '@httpdao/cocoadmin/DeviceFamilyHttpdao'
import { serverInstance } from '@utils/ServerInstance'
import { fetchSocketsInRoomClusterSafe } from '@utils/socket-io-fetch-sockets'

/**
 * AgentData Socket 命名空间
 * 专门用于加密数据同步（如家庭人脸同步）
 *
 * TODO 优化：数据不上云，房间内广播数据，设备自己广播自己的数据
 */
@SocketNamespace(CoCoNamespace.AgentData, [auth])
export default class AgentDataSocket {
    private readonly log: Logger = getLogger(AgentDataSocket.name)

    private deviceConnectionService: DeviceConnectionRedisService =
        getInstanceByToken<DeviceConnectionRedisService>(DeviceConnectionRedisService)

    /**
     * 将设备 socket 绑定到指定家庭房间：先离开旧房间，再写入 spacesId 并 join
     */
    private bindSocketToAgentDataSpaceRoom(socket: CocoSocket, spaceId: string): void {
        const prev = socket.data.spacesId
        if (prev && prev !== spaceId) {
            socket.leave(prev)
        }
        socket.data.spacesId = spaceId
        socket.join(spaceId)
    }

    /**
     * APP 查询家庭内所有设备的陌生人列表（聚合多个设备 ACK）
     *
     * - APP -> 云端：入参 { spaceId }
     * - 云端 -> 设备：事件同名，无入参
     * - 设备 -> 云端 ACK：{ deviceSN, base64, id } 或其数组
     * - 云端 -> APP ACK：聚合为数组
     *
     * 规则：5 秒内没有任何设备返回数据，则报错“网络延时”
     */
    @SocketEvent(AgentDataEvent.GET_SPACES_STRANGER_LIST)
    async getSpacesStrangerList(
        socket: CocoSocket,
        data: GetSpacesStrangerListReq,
        callback?: (arg: SocketResponse<SpaceStrangerFaceItem[]>) => void
    ) {
        const reply = (res: SocketResponse<SpaceStrangerFaceItem[]>) => {
            if (callback) callback(res)
        }

        this.log.infoMsg('get-spaces-stranger-list 请求进入', {
            socketId: socket.id,
            authType: socket.data?.authType,
            spaceId: data?.spaceId
        })

        // 仅允许 APP/WEB 侧调用（token 鉴权）
        if (socket.data.authType !== AuthType.web) {
            this.log.warnMsg('get-spaces-stranger-list 无权限调用', {
                socketId: socket.id,
                authType: socket.data?.authType
            })
            reply({ code: CODE.NO_AUTH, data: [], msg: '无权限' })
            return
        }

        const spaceId = data?.spaceId
        if (!spaceId) {
            this.log.warnMsg('get-spaces-stranger-list 缺少参数 spaceId', { socketId: socket.id })
            reply({ code: CODE.ERROR, data: [], msg: '缺少参数 spaceId' })
            return
        }

        try {
            const io = serverInstance.getIO()
            const namespace = io.of(env.PATH_PREFIX + CoCoNamespace.AgentData)

            // 获取家庭房间内的所有 socket（包含本机与集群；超时则降级为本机）
            const sockets = await fetchSocketsInRoomClusterSafe(namespace, spaceId)
            const deviceSockets = sockets.filter(s => s.data?.authType === AuthType.client)

            this.log.infoMsg('get-spaces-stranger-list 房间 socket 统计', {
                spaceId,
                totalSockets: sockets.length,
                deviceSockets: deviceSockets.length
            })

            if (deviceSockets.length === 0) {
                this.log.warnMsg('get-spaces-stranger-list 房间内无设备 socket', { spaceId })
                reply({ code: CODE.ERROR, data: [], msg: '网络延时' })
                return
            }

            const normalize = (payload: unknown): SpaceStrangerFaceItem[] => {
                if (!payload) return []
                if (Array.isArray(payload)) return payload as SpaceStrangerFaceItem[]
                return [payload as SpaceStrangerFaceItem]
            }

            const settled = await Promise.allSettled(
                deviceSockets.map(async s => {
                    const deviceSN: string | undefined =
                        s.data?.device?.deviceSN ?? s.data?.deviceSN ?? s.data?.deviceId ?? undefined
                    // 云端和设备侧事件：同名、无入参，设备端 ack 返回 payload（不包装 SocketResponse）
                    const payload = await s.timeout(5000).emitWithAck(AgentDataEvent.GET_SPACES_STRANGER_LIST)
                    return { deviceSN, payload }
                })
            )

            const merged: SpaceStrangerFaceItem[] = []
            let fulfilledCount = 0
            let rejectedCount = 0
            for (const item of settled) {
                if (item.status === 'fulfilled') {
                    fulfilledCount++
                    const { deviceSN, payload } = item.value
                    const normalized = normalize(payload).map(v => ({
                        ...v,
                        deviceSN: v?.deviceSN || deviceSN || ''
                    }))
                    merged.push(...normalized)
                    this.log.infoMsg('get-spaces-stranger-list 设备返回成功', {
                        spaceId,
                        deviceSN: deviceSN || '',
                        items: normalized.length
                    })
                } else {
                    rejectedCount++
                    this.log.warnMsg('get-spaces-stranger-list 设备返回失败', {
                        spaceId,
                        reason: (item.reason as Error | undefined)?.message ?? item.reason
                    })
                }
            }

            this.log.infoMsg('get-spaces-stranger-list 聚合完成', {
                spaceId,
                fulfilled: fulfilledCount,
                rejected: rejectedCount,
                total: settled.length,
                merged: merged.length
            })
            reply({ code: CODE.SUCCESS, data: merged, msg: 'success' })
        } catch (e) {
            this.log.errorMsg('get-spaces-stranger-list 处理失败', { spaceId, errorMsg: e })
            reply({ code: CODE.ERROR, data: [], msg: '网络延时' })
        }
    }

    /**
     * 设备在已连接命名空间后，若中途绑定家庭，可发此事件同步加入家庭房间（无入参，仅以后台绑定为准）
     */
    @SocketEvent(AgentDataEvent.JOIN_SPACE)
    async joinAgentDataSpace(
        socket: CocoSocket,
        _data: unknown,
        callback?: (arg: SocketResponse<{ spaceId: string }>) => void
    ) {
        const reply = (res: SocketResponse<{ spaceId: string }>) => {
            if (callback) callback(res)
        }

        if (socket.data.authType !== AuthType.client) {
            this.log.warnMsg('join:space 无权限调用', { socketId: socket.id, authType: socket.data?.authType })
            reply({ code: CODE.NO_AUTH, data: { spaceId: '' }, msg: '无权限' })
            return
        }

        const deviceSN = socket.data.device?.deviceSN
        if (!deviceSN) {
            this.log.warnMsg('join:space 缺少设备信息', { socketId: socket.id })
            reply({ code: CODE.ERROR, data: { spaceId: '' }, msg: '缺少设备信息' })
            return
        }

        try {
            const deviceSpace = await deviceFamilyHttpdao.getByDevice(deviceSN)
            const boundSpaceId = deviceSpace?.spaceId
            if (!boundSpaceId) {
                this.log.warnMsg('join:space 设备未绑定家庭', { socketId: socket.id, deviceSN })
                reply({ code: CODE.ERROR, data: { spaceId: '' }, msg: '设备未绑定家庭' })
                return
            }

            this.bindSocketToAgentDataSpaceRoom(socket, boundSpaceId)
            this.log.infoMsg(
                `join:space 成功 deviceSN=${deviceSN} spaceId=${boundSpaceId}, socketId=${socket.id}, serverName=${env.SERVICE_NAME}`
            )
            reply({ code: CODE.SUCCESS, data: { spaceId: boundSpaceId }, msg: 'success' })
        } catch (e) {
            this.log.errorMsg('join:space 处理失败', { deviceSN, errorMsg: e })
            reply({ code: CODE.ERROR, data: { spaceId: '' }, msg: (e as Error).message })
        }
    }

    @OnConnect()
    async connected(socket: CocoSocket) {
        try {
            // 连接到这里时，握手鉴权已通过
            const authType = socket.data.authType

            SocketCommonResponse.success<ConnectedResponse>({
                socket,
                event: ResponseEvent.CONNECT,
                data: { namespace: socket.nsp.name, socketId: socket.id },
                msg: 'Success to connect to agent-data socket'
            })

            // 处理设备加入逻辑
            if (authType === AuthType.client) {
                const device = socket.data.device!
                const deviceSN = device.deviceSN

                // 若有后台绑定家庭，加入家庭房间
                const deviceSpace = await deviceFamilyHttpdao.getByDevice(deviceSN)
                if (deviceSpace?.spaceId) {
                    this.bindSocketToAgentDataSpaceRoom(socket, deviceSpace.spaceId)
                    this.log.infoMsg(
                        `Device ${deviceSN} joined space room: ${socket.data.spacesId}, socketId: ${socket.id}`
                    )
                }

                this.log.infoMsg(
                    `Device ${deviceSN} connected to agent-data namespace, socketId: ${socket.id}, serverName: ${env.SERVICE_NAME}`
                )
            }
        } catch (e) {
            SocketCommonResponse.error({ socket, event: ResponseEvent.CONNECT, msg: (e as Error).message })
            this.log.errorMsg('Error processing agent-data connect:', { errorMsg: e })
        }
    }

    @OnDisconnect()
    async disconnect(socket: CocoSocket, reason: string) {
        try {
            const authType = socket.data.authType

            if (authType === AuthType.client) {
                // 离开家庭房间
                if (socket.data.spacesId) {
                    socket.leave(socket.data.spacesId)
                }
            }

            this.log.warnMsg(`[${authType}(${socket.id})] disconnected from agent-data, reason: ${reason}`)
        } catch (e) {
            this.log.errorMsg(`Error handling disconnect for socket ${socket.id}:`, { errorMsg: e })
        }
    }
}
