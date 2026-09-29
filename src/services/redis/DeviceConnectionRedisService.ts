/** @format */

import { getLogger } from '@utils/Logger'
import { Inject, Service } from 'fastify-decorators'
import { DeviceService } from '@service/DeviceService'
import crypto from 'crypto'
import { redis } from '@plugin/ioredis'
import { env } from '@config/env'

/**
 * 设备连接管理服务
 * 用于管理设备Token和Socket映射关系，避免循环依赖
 */
@Service()
export class DeviceConnectionRedisService {
    // 用于项目隔离
    public static COCO_CLOUD_TS: string = 'coco-cloud-ts'
    // 设备关联的Socket列表
    public static readonly ROOM_SOCKETS_KEY_PREFIX = DeviceConnectionRedisService.COCO_CLOUD_TS + ':room_sockets:'
    // 默认TTL时间（60秒）
    public static readonly DEFAULT_TTL = 60

    private readonly log = getLogger(DeviceConnectionRedisService.name)

    @Inject(DeviceService)
    private readonly deviceService!: DeviceService

    /**
     * 验证设备连接，机器人端使用
     * @param deviceSN
     * @param timestamp
     * @param sign
     */
    async verify(deviceSN: string, timestamp: number, sign: string) {
        this.log.debug(`Verifying device: ${deviceSN} timestamp: ${timestamp} sign: ${sign}`)
        // device connection
        if (!timestamp || Date.now() - timestamp > 30 * 1000) throw new Error('Device timestamp is invalid or expired')
        // 验证设备是否存在
        const device = await this.deviceService.getDeviceBySN(deviceSN)
        if (!device) throw new Error(`Device not found: ${deviceSN}`)

        // 获取设备公钥
        const pubKey = device.pubKey
        if (!pubKey) {
            throw new Error(`Device public key not found: ${deviceSN}`)
        }
        const verify = crypto.createVerify('RSA-SHA256')
        verify.update(deviceSN + timestamp)
        let isValid
        try {
            isValid = verify.verify(pubKey, sign, 'base64')
        } catch (e: any) {
            throw new Error(`Invalid device signature for SN: ${deviceSN}` + e.toString())
        }

        if (!isValid) {
            throw new Error(`Invalid device signature for SN: ${deviceSN}`)
        }

        return device
    }

    /**
     * 设置设备和Socket的关联关系（一个设备可以关联多个Socket）
     * @param deviceSN 设备序列号(房间号)
     * @param socketId Socket ID，设备是第一个
     * @param ip 客户端IP地址
     */
    public async addRoomSocket(deviceSN: string, socketId: string, ip?: string): Promise<void> {
        // 确保参数有效
        if (!deviceSN || !socketId) {
            throw new Error('deviceSN and socketId must be provided')
        }

        // 使用时间戳作为分数，确保有序性
        const score = Date.now()
        await redis.zadd(
            `${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`,
            score,
            JSON.stringify({
                socketId,
                ip,
                serverId: env.SERVER_ID // 记录当前服务器ID（格式：SERVICE_NAME:PORT）
            })
        )

        // 为设备房间设置TTL
        await redis.expire(
            `${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`,
            DeviceConnectionRedisService.DEFAULT_TTL
        )

        this.log.debug(`Added socket ${socketId} to device ${deviceSN} on server ${env.SERVER_ID}`)
    }

    async getRoom(deviceSN: string) {
        const key = `${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`
        return redis.zrange(key, 0, -1)
    }

    /**
     * 删除设备和Socket的关联关系
     * @param deviceSN 设备序列号
     * @param socketId Socket ID
     * @param ip
     */
    public async removeRoomSocketMapping(deviceSN: string, socketId: string, ip?: string): Promise<void> {
        // 从设备的Socket列表中移除Socket ID
        await redis.zrem(
            `${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`,
            JSON.stringify({
                socketId,
                ip,
                serverId: env.SERVER_ID // 需要包含serverId以匹配完整的JSON字符串
            })
        )
        this.log.info(`Removed socket ${socketId}/${ip} from device ${deviceSN} sockets list`)
    }

    /**
     * 删除设备和Socket的关联关系
     * @param deviceSN 设备序列号
     */
    public async delRoomSocketMapping(deviceSN: string): Promise<void> {
        // 从设备的Socket列表中移除Socket ID
        await redis.del(`${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`)
        this.log.debug(`del ${deviceSN} sockets list`)
    }

    /**
     * 判断有没有这个 设备（房间）
     * @param deviceSN 房间号
     * @returns 设备序列号或undefined
     */
    public async haveRoom(deviceSN: string): Promise<number> {
        return redis.exists(`${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`)
    }

    /**
     * 更新设备房间的TTL时间
     * @param deviceSN 设备序列号
     */
    public async updateRoomTTL(deviceSN: string): Promise<void> {
        await redis.expire(
            `${DeviceConnectionRedisService.ROOM_SOCKETS_KEY_PREFIX}${deviceSN}`,
            DeviceConnectionRedisService.DEFAULT_TTL
        )
        this.log.debug(`Updated TTL for device room: ${deviceSN}`)
    }

    /**
     * 获取设备连接的服务器ID（通常是设备的第一个socket所在的服务器）
     * @param deviceSN 设备序列号
     * @returns 服务器ID或null
     */
    public async getDeviceServerId(deviceSN: string): Promise<string | null> {
        try {
            const sockets = await this.getRoom(deviceSN)
            if (sockets.length === 0) {
                return null
            }

            // 获取第一个socket（通常是设备socket）
            const firstSocket = JSON.parse(sockets[0])
            return firstSocket.serverId || null
        } catch (error) {
            this.log.errorMsg(`Error getting device server ID for ${deviceSN}:`, { errorMsg: error })
            return null
        }
    }
}
