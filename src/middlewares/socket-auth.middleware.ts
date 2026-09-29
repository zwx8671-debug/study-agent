/** @format */

import { Socket } from 'socket.io'
import { getInstanceByToken } from 'fastify-decorators'
import { DeviceConnectionRedisService } from '@service/redis/DeviceConnectionRedisService'
import { getLogger } from '@utils/Logger'
import { DeviceService } from '@service/DeviceService'
import { AuthType } from '@interface/ICommon'
import { authHttpDao } from '@httpdao/cocoadmin/AuthHttpDao'
import { serverInstance } from '@utils/ServerInstance'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { ResponseEvent } from '@interface/IAgent'

const logger = getLogger()

export async function auth(socket: Socket, next: (error?: Error) => void) {
    try {
        // 优先级：Auth > Headers
        const deviceSN: string = socket.handshake.auth['device-sn'] || socket.handshake.headers['device-sn']

        const sign: string = socket.handshake.auth['device-sign'] || socket.handshake.headers['device-sign']

        const timestamp: string = socket.handshake.auth['sign-timestamp'] || socket.handshake.headers['sign-timestamp']

        // 测试时候用
        if (sign === 'cocowa') {
            const deviceService = getInstanceByToken<DeviceService>(DeviceService)
            const device = await deviceService.getDeviceBySN(deviceSN)
            if (device) {
                socket.data.device = { deviceId: device.id, deviceSN, deviceInfo: device }
                socket.data.authType = AuthType.client
                return next()
            } else {
                return next()
                // return next(new Error('Device not found'))
            }
        }

        // 优先处理设备签名鉴权
        if (deviceSN && sign && timestamp) {
            const deviceConnectionService =
                getInstanceByToken<DeviceConnectionRedisService>(DeviceConnectionRedisService)
            const device = await deviceConnectionService.verify(deviceSN, Number(timestamp), sign)
            socket.data.device = { deviceId: device.id, deviceSN, deviceInfo: device }
            socket.data.authType = AuthType.client
            logger.info(`Device ID (${device.id}), SN (${device.seriesNum}) authenticated on socket [${socket.id}]`)

            return next()
        }

        // ========================= Web 客户端 认证 =========================
        const token = (socket.handshake.auth['token'] || socket.handshake.headers['token']) as string
        if (!token) {
            return next(new Error('Missing auth token'))
        }

        if (!token) {
            return next(new Error('Miss auth token'))
        }

        // parse and verify token
        const res = await authHttpDao.checkToken(token)
        if (!res) {
            return next(new Error('Invalid auth token'))
        }

        socket.data.user = res
        socket.data.authType = AuthType.web

        // 放开鉴权 以后不需要注释代码
        {
            const deviceService = getInstanceByToken<DeviceService>(DeviceService)
            const device = await deviceService.getDeviceBySN(deviceSN)
            if (device) {
                socket.data.device = {
                    deviceId: device?.id,
                    deviceSN: device?.seriesNum,
                    deviceInfo: device
                }
            }

            // 检查设备是否在线
            const roomMaps = serverInstance.getIO().of(socket.nsp.name).adapter.rooms
            if (!roomMaps.has(deviceSN)) {
                SocketCommonResponse.error({
                    socket,
                    event: ResponseEvent.JOIN,
                    data: socket.data,
                    msg: `NS[${socket.nsp.name}] room[${deviceSN}] 不存在`
                })
                logger.warnMsg(`NS[${socket.nsp.name}] room[${deviceSN}] 不存在`)
                return next(new Error(`NS[${socket.nsp.name}] room[${deviceSN}] 不存在`))
            }
        }

        // 单人鉴权
        /*if (deviceSN) {
            const deviceService = getInstanceByToken<DeviceService>(DeviceService)
            // 验证设备 是否归属于用户
            const result = await deviceService.checkDeviceInUser(deviceSN, res.id)
            if (result.error) {
                throw new Error(result.error)
            } else {
                if (result.device) {
                    socket.data.device = {
                        deviceId: result.device?.id,
                        deviceSN: result.device?.seriesNum,
                        deviceInfo: result.device
                    }
                }

                // 检查设备是否在线
                const roomMaps = serverInstance.getIO().of(socket.nsp.name).adapter.rooms
                if (!roomMaps.has(deviceSN)) {
                    SocketCommonResponse.error({
                        socket,
                        event: ResponseEvent.JOIN,
                        data: socket.data,
                        msg: `NS[${socket.nsp.name}] room[${deviceSN}] 不存在`
                    })
                    logger.warnMsg(`NS[${socket.nsp.name}] room[${deviceSN}] 不存在`)
                    return next(new Error(`NS[${socket.nsp.name}] room[${deviceSN}] 不存在`))
                }
            }
        }*/

        // TODO 家庭鉴权

        logger.debug(`Web client (User ID: ${res.id}) authenticated on socket [${socket.id}]`)

        return next()
    } catch (e) {
        logger.error('Auth middleware error:', e)
        return next(new Error('Authentication failed: Internal server error'))
    }
}
