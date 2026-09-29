/** @format */
import { getInstanceByToken, Service } from 'fastify-decorators'
import { getLogger } from '@utils/Logger'
import { redis } from '@plugin/ioredis'
import {
    AuthType,
    CoCoNamespace,
    SpaceDeleteFacesNotify,
    SpaceDeletePetsNotify,
    SpaceDeleteVoicesNotify,
    SpaceLeaveSpaceNotify,
    SpacePullFaceListNotify,
    SpacePullPetListNotify,
    SpacePullVoiceListNotify,
    SpaceStrangerToFriendNotify,
    SpaceUserInfoSyncMessage,
    SpaceUserInfoSyncNotifyEvent,
    SpaceUserInfoSyncTrigger
} from '@interface/ICommon'
import { spaceHttpdao } from '@httpdao/cocoadmin/SpaceHttpdao'
import { serverInstance } from '@utils/ServerInstance'
import { fetchSocketsInRoomClusterSafe } from '@utils/socket-io-fetch-sockets'
import { env } from '@config/env'
import AgentService from '@service/AgentService'

/**
 * 家庭用户信息同步 Redis Streams 服务（包含人脸、声纹和宠物）
 * 使用 Redis Streams + Consumer Group 实现分布式消息队列，支持集群部署
 * 特性：
 * - 消息持久化：消息不会丢失
 * - ACK 机制：确认消息已处理
 * - 自动负载均衡：消费者组内多个消费者自动分配消息
 * - 故障转移：未处理的消息会被其他消费者接管
 */
@Service()
export class SpaceUserInfoSyncRedisService {
    private readonly log = getLogger(SpaceUserInfoSyncRedisService.name)
    private readonly STREAM_KEY = 'space:user_info_sync'
    private readonly GROUP_NAME = 'user-info-sync-group'
    private readonly BLOCK_MS = 2000 // XREADGROUP 阻塞超时（毫秒）
    private readonly BATCH_SIZE = 10 // 每次读取消息数量
    private readonly PENDING_CHECK_INTERVAL = 30000 // Pending 检查间隔（毫秒）
    private readonly PENDING_IDLE_TIME = 60000 // Pending 消息超时时间（毫秒）
    private isRunning = false
    private consumerId: string
    private pendingCheckTimer: NodeJS.Timeout | null = null
    private agentService: AgentService = getInstanceByToken<AgentService>(AgentService)
    constructor() {
        // 生成消费者 ID（用于消费者组标识）
        this.consumerId = `${env.SERVICE_NAME}-${process.pid}-${Date.now()}`
    }

    /**
     * 启动消费者
     */
    async startConsumer(): Promise<void> {
        if (this.isRunning) {
            this.log.warnMsg('Consumer already running')
            return
        }

        try {
            // 确保消费者组存在
            await this.ensureConsumerGroup()

            this.isRunning = true
            this.log.infoMsg(`🚀 Starting face sync consumer (Streams mode)`)
            this.log.infoMsg(`📥 Consumer ID: ${this.consumerId}`)
            this.log.infoMsg(`📡 Stream: ${this.STREAM_KEY}, Group: ${this.GROUP_NAME}`)

            // 启动消费循环
            this.consumeLoop().catch(error => {
                this.log.errorMsg('Consumer loop fatal error:', { errorMsg: error })
                this.isRunning = false
            })

            // 启动 Pending 检查定时器
            this.startPendingCheck()
        } catch (error) {
            this.log.errorMsg('Failed to start consumer:', { errorMsg: error })
            throw error
        }
    }

    /**
     * 停止消费者
     */
    async stopConsumer(): Promise<void> {
        this.isRunning = false

        // 停止 Pending 检查定时器
        if (this.pendingCheckTimer) {
            clearInterval(this.pendingCheckTimer)
            this.pendingCheckTimer = null
        }

        this.log.infoMsg('🛑 Stopping face sync consumer')
    }

    /**
     * 确保消费者组存在
     */
    private async ensureConsumerGroup(): Promise<void> {
        try {
            // 尝试创建消费者组
            await redis.xgroup('CREATE', this.STREAM_KEY, this.GROUP_NAME, '$', 'MKSTREAM')
            this.log.infoMsg(`✅ Created consumer group: ${this.GROUP_NAME}`)
        } catch (error: any) {
            // BUSYGROUP 错误表示组已存在，这是正常的
            if (error.message && error.message.includes('BUSYGROUP')) {
                this.log.infoMsg(`Consumer group already exists: ${this.GROUP_NAME}`)
            } else {
                this.log.errorMsg('Failed to create consumer group:', { errorMsg: error })
                throw error
            }
        }
    }

    /**
     * 消费循环
     */
    private async consumeLoop(): Promise<void> {
        while (this.isRunning) {
            try {
                // 使用 XREADGROUP 读取消息
                // '>' 表示读取未分配给任何消费者的新消息
                const result = await redis.xreadgroup(
                    'GROUP',
                    this.GROUP_NAME,
                    this.consumerId,
                    'COUNT',
                    this.BATCH_SIZE,
                    'BLOCK',
                    this.BLOCK_MS,
                    'STREAMS',
                    this.STREAM_KEY,
                    '>'
                )

                if (result && result.length > 0) {
                    // result 格式: [[stream_key, [[id, [field, value, ...]], ...]]]
                    // 类型定义：[stream_key, messages[]]
                    type XReadGroupResult = [string, [string, string[]][]][]
                    const typedResult = result as XReadGroupResult
                    const [, messages] = typedResult[0]
                    for (const [messageId, fields] of messages) {
                        await this.processMessage(messageId, fields)
                    }
                }
            } catch (error) {
                this.log.errorMsg('Error in consume loop:', { errorMsg: error })
                // 发生错误后等待一段时间再继续
                await this.sleep(1000)
            }
        }

        this.log.infoMsg('Consumer loop stopped')
    }

    /**
     * 处理消息
     * @param messageId 消息 ID
     * @param fields 消息字段数组 [field1, value1, field2, value2, ...]
     */
    private async processMessage(messageId: string, fields: string[]): Promise<void> {
        try {
            // 解析字段（ioredis 返回的是扁平数组）
            const data: Record<string, string> = {}
            for (let i = 0; i < fields.length; i += 2) {
                data[fields[i]] = fields[i + 1]
            }

            const messageStr = data.data || data.message
            if (!messageStr) {
                this.log.warnMsg('Message field not found:', { messageId, fields })
                await this.ackMessage(messageId)
                return
            }

            this.log.infoMsg(`📨 Processing message ${messageId}`)

            // 解析消息内容
            const message: SpaceUserInfoSyncMessage = JSON.parse(messageStr)

            // 验证消息格式
            if (!message.space_id || !message.trigger) {
                this.log.warnMsg('Invalid message format:', { messageId, message })
                await this.ackMessage(messageId)
                return
            }

            // 处理消息
            await this.handleMessage(message)

            // 确认消息已处理
            await this.ackMessage(messageId)

            this.log.infoMsg(`✅ Message processed and acknowledged: ${messageId}`)
        } catch (error) {
            this.log.errorMsg('Error processing message:', { errorMsg: error, messageId })
            // 不 ACK，消息会保留在 Pending 列表中，稍后重试
        }
    }

    /**
     * 确认消息
     * @param messageId 消息 ID
     */
    private async ackMessage(messageId: string): Promise<void> {
        try {
            await redis.xack(this.STREAM_KEY, this.GROUP_NAME, messageId)
        } catch (error) {
            this.log.errorMsg('Failed to ACK message:', { errorMsg: error, messageId })
        }
    }

    /**
     * 启动 Pending 消息检查定时器
     */
    private startPendingCheck(): void {
        this.pendingCheckTimer = setInterval(async () => {
            try {
                await this.checkPendingMessages()
            } catch (error) {
                this.log.errorMsg('Error checking pending messages:', { errorMsg: error })
            }
        }, this.PENDING_CHECK_INTERVAL)
    }

    /**
     * 检查并重新处理 Pending 消息
     */
    private async checkPendingMessages(): Promise<void> {
        try {
            // 获取 Pending 消息列表
            const pending = await redis.xpending(this.STREAM_KEY, this.GROUP_NAME, '-', '+', 10)

            if (!pending || pending.length === 0) {
                return
            }

            this.log.infoMsg(`🔍 Found ${pending.length} pending messages`)

            // 类型定义: [messageId, consumer, idleTime, deliveryCount]
            type XPendingItem = [string, string, number, number]
            const typedPending = pending as XPendingItem[]

            for (const item of typedPending) {
                const [messageId, , idleTime] = item

                // 如果消息 idle 时间超过阈值，认领并重新处理
                if (idleTime > this.PENDING_IDLE_TIME) {
                    this.log.warnMsg(`⚠️ Reclaiming pending message: ${messageId}, idle: ${idleTime}ms`)

                    try {
                        // 认领消息
                        const claimed = await redis.xclaim(
                            this.STREAM_KEY,
                            this.GROUP_NAME,
                            this.consumerId,
                            this.PENDING_IDLE_TIME,
                            messageId
                        )

                        if (claimed && claimed.length > 0) {
                            // 类型定义: [messageId, fields[]]
                            type XClaimResult = [string, string[]][]
                            const typedClaimed = claimed as XClaimResult
                            const [claimedId, fields] = typedClaimed[0]
                            await this.processMessage(claimedId, fields)
                        }
                    } catch (error) {
                        this.log.errorMsg('Failed to reclaim message:', { errorMsg: error, messageId })
                    }
                }
            }
        } catch (error) {
            this.log.errorMsg('Failed to check pending messages:', { errorMsg: error })
        }
    }

    /**
     * 休眠指定毫秒数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * 处理接收到的消息
     * @param message 消息内容
     */
    private async handleMessage(message: SpaceUserInfoSyncMessage): Promise<void> {
        try {
            this.log.infoMsg(`Handling ${message.trigger}: spaces_id=${message.space_id}`)

            // 根据触发类型处理
            switch (message.trigger) {
                case SpaceUserInfoSyncTrigger.MEMBER_JOIN:
                    await this.handleMemberJoin(message)
                    break
                case SpaceUserInfoSyncTrigger.DEVICE_BIND:
                    await this.handleDeviceBind(message)
                    break
                case SpaceUserInfoSyncTrigger.FACE_ADD:
                    await this.handleFaceAdd(message)
                    break
                case SpaceUserInfoSyncTrigger.FACE_DELETE:
                    await this.handleFaceDelete(message)
                    break
                case SpaceUserInfoSyncTrigger.VOICE_ADD:
                    await this.handleVoiceAdd(message)
                    break
                case SpaceUserInfoSyncTrigger.VOICE_DELETE:
                    await this.handleVoiceDelete(message)
                    break
                case SpaceUserInfoSyncTrigger.PET_ADD:
                    await this.handlePetAdd(message)
                    break
                case SpaceUserInfoSyncTrigger.PET_DELETE:
                    await this.handlePetDelete(message)
                    break
                case SpaceUserInfoSyncTrigger.MEMBER_LEAVE:
                    await this.handleMemberLeave(message)
                    break
                case SpaceUserInfoSyncTrigger.DEVICE_UNBIND:
                    await this.agentService.notifyResetDevice(message)
                    break
                case SpaceUserInfoSyncTrigger.STRANGER_ADD:
                    await this.handleStrangerFace(message)
                    break
                default:
                    this.log.warnMsg(`Unknown trigger type: ${message.trigger}`)
            }
        } catch (error) {
            this.log.errorMsg('Error handling message:', { errorMsg: error, message })
            throw error // 重新抛出错误，避免 ACK
        }
    }

    /**
     * 处理成员加入家庭
     * 1. Agent 定点下发 AES（emitWithAck），全部 ack 成功后再执行后续步骤
     * 2～4. 通知拉取人脸、声纹、宠物列表（见 notifyPullSpaceFeatureLists）
     */
    private async handleMemberJoin(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling member_join: spaces_id=${data.space_id}, user_id=${data.user_id}`)

        // 1. 通知拉取 AES 密钥（Agent 定点，需客户端 ack）
        const aesAckOk = await this.agentService.notifyPullAESKey(data.space_id, data.devices)
        if (aesAckOk) {
            await this.notifyPullSpaceFeatureLists(data.space_id)
        } else {
            this.log.warnMsg(`member_join: AES 推送未全部 ack，跳过拉取人脸/声纹/宠物 spaces_id=${data.space_id}`)
        }
    }

    /**
     * 处理设备绑定到家庭
     * 1. Agent 定点下发 AES（emitWithAck），全部 ack 成功后再执行后续步骤
     * 2～4. 通知拉取人脸、声纹、宠物列表（见 notifyPullSpaceFeatureLists）
     */
    private async handleDeviceBind(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling device_bind: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 1. 通知拉取 AES 密钥（Agent 定点，需客户端 ack）
        const aesAckOk = await this.agentService.notifyPullAESKey(data.space_id, data.devices)
        if (aesAckOk) {
            await this.notifyPullSpaceFeatureLists(data.space_id)
        } else {
            this.log.warnMsg(`device_bind: AES 推送未全部 ack，跳过拉取人脸/声纹/宠物 spaces_id=${data.space_id}`)
        }
    }

    /**
     * 处理人脸新增
     * 通知家庭内所有设备拉取人脸列表
     */
    private async handleFaceAdd(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling face_add: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 通知拉取人脸列表
        await this.notifyPullFaceList(data.space_id)
    }

    /**
     * 处理人脸删除
     * 通知家庭内所有设备删除指定人脸
     */
    private async handleFaceDelete(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling face_delete: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 收集所有要删除的人脸 ID
        const faceIds: string[] = []
        const names: string[] = []
        data.devices.forEach(device => {
            if (device.face_ids) {
                faceIds.push(...device.face_ids)
            }
            if (device.names) {
                names.push(...device.names)
            }
        })

        if (faceIds.length > 0) {
            await this.notifyDeleteFaces(data.space_id, faceIds, names)
        }
    }

    /**
     * 处理声纹新增
     * 通知家庭内所有设备拉取声纹列表
     */
    private async handleVoiceAdd(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling voice_add: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 通知拉取声纹列表
        await this.notifyPullVoiceList(data.space_id)
    }

    /**
     * 处理声纹删除
     * 通知家庭内所有设备删除指定声纹
     */
    private async handleVoiceDelete(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling voice_delete: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 收集所有要删除的声纹 ID
        const voiceIds: string[] = []
        const names: string[] = []
        data.devices.forEach(device => {
            if (device.voice_ids) {
                voiceIds.push(...device.voice_ids)
            }
            if (device.names) {
                names.push(...device.names)
            }
        })

        if (voiceIds.length > 0) {
            await this.notifyDeleteVoices(data.space_id, voiceIds, names)
        }
    }

    /**
     * 处理宠物新增
     * 通知家庭内所有设备拉取宠物列表
     */
    private async handlePetAdd(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling pet_add: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        await this.notifyPullPetList(data.space_id)
    }

    /**
     * 处理宠物删除
     * 通知家庭内所有设备删除指定宠物
     */
    private async handlePetDelete(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling pet_delete: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        const petIds: string[] = []
        const names: string[] = []
        data.devices.forEach(device => {
            if (device.pet_ids) {
                petIds.push(...device.pet_ids)
            }
            if (device.names) {
                names.push(...device.names)
            }
        })

        if (petIds.length > 0) {
            await this.notifyDeletePets(data.space_id, petIds, names)
        }
    }

    /**
     * 处理成员离开家庭
     * 1. 通知家庭内设备拉取最新人脸列表（会自动删除离开成员的人脸）
     * 2. 通知家庭内设备拉取最新声纹列表（会自动删除离开成员的声纹）
     * 3. 通知家庭内设备拉取最新宠物列表（会自动删除离开成员的宠物）
     * 4. 让离开用户的设备退出家庭房间（设备在端侧会删除非自己创建的数据）
     */
    private async handleMemberLeave(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling member_leave: spaces_id=${data.space_id}, user_id=${data.user_id}`)

        // 检查离开的成员是否有设备
        const hasDevices = data.devices && data.devices.length > 0 && data.devices.some(d => d.device_sn)
        if (!hasDevices) {
            this.log.infoMsg(`Member ${data.user_id} left without devices, skipping sync`)
            return
        }

        // 1. 通知家庭内设备拉取最新人脸列表（会自动删除离开成员的人脸）
        await this.notifyPullFaceList(data.space_id)

        // 2. 通知家庭内设备拉取最新声纹列表（会自动删除离开成员的声纹）
        await this.notifyPullVoiceList(data.space_id)

        // 3. 通知家庭内设备拉取最新宠物列表（会自动删除离开成员的宠物）
        await this.notifyPullPetList(data.space_id)

        // 4. 让离开用户的设备退出家庭房间
        // 设备在端侧会删除非自己创建的人脸、声纹和宠物
        const deviceSNs = data.devices.map(d => d.device_sn).filter(Boolean) as string[]
        await this.notifyLeaveSpace(data.space_id, data.user_id, deviceSNs)
    }

    /**
     * 处理设备从家庭解绑
     * 1. 家庭内的设备删除解绑设备的人脸（通过通知拉取最新人脸列表实现）
     * 2. 家庭内的设备删除解绑设备的声纹（通过通知拉取最新声纹列表实现）
     * 3. 家庭内的设备删除解绑设备的宠物（通过通知拉取最新宠物列表实现）
     * 4. 解绑的设备删除非自己创建的数据（通过让设备离开家庭房间实现）
     */
    private async handleSpaceDeviceUnbind(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling device_unbind: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        // 1. 通知家庭内设备拉取最新人脸列表（会自动删除解绑设备的人脸）
        await this.notifyPullFaceList(data.space_id)

        // 2. 通知家庭内设备拉取最新声纹列表（会自动删除解绑设备的声纹）
        await this.notifyPullVoiceList(data.space_id)

        // 3. 通知家庭内设备拉取最新宠物列表（会自动删除解绑设备的宠物）
        await this.notifyPullPetList(data.space_id)

        // 4. 让解绑的设备退出家庭房间
        // 设备在端侧会删除非自己创建的人脸、声纹和宠物
        const deviceSNs = data.devices.map(d => d.device_sn).filter(Boolean) as string[]
        await this.notifyLeaveSpace(data.space_id, data.user_id, deviceSNs)
    }

    /**
     * 处理陌生人转熟人（定点通知设备）
     * 业务：根据 device_sn 发送信息给指定设备，通知将陌生人 stranger_names 转为熟人，名称改为 names，顺序按索引一一对应
     */
    private async handleStrangerFace(data: SpaceUserInfoSyncMessage): Promise<void> {
        this.log.infoMsg(`Handling stranger_face: spaces_id=${data.space_id}, devices=${JSON.stringify(data.devices)}`)

        if (!data.devices || data.devices.length === 0) {
            return
        }

        for (const device of data.devices) {
            const deviceSN = device?.device_sn
            if (!deviceSN) {
                continue
            }

            const strangerNames = device?.stranger_names ?? []
            const names = device?.names ?? []
            const faceIds = device?.face_ids ?? []

            const n = Math.min(
                strangerNames.length,
                names.length,
                faceIds.length > 0 ? faceIds.length : Number.POSITIVE_INFINITY
            )
            if (n <= 0 || !Number.isFinite(n)) {
                this.log.warnMsg(
                    `stranger_face ignored due to empty mapping: spaces_id=${data.space_id}, device_sn=${deviceSN}`
                )
                continue
            }

            const items = Array.from({ length: n }).map((_, i) => ({
                faceId: faceIds.length > 0 ? faceIds[i] : undefined,
                strangerName: strangerNames[i],
                name: names[i]
            }))

            const notifyData: SpaceStrangerToFriendNotify = {
                spacesId: data.space_id,
                deviceSN,
                items
            }

            await this.notifyStrangerToFriend(data.space_id, deviceSN, notifyData)
        }
    }

    /**
     * 通知家庭内设备拉取人脸、声纹、宠物（AgentData 广播）
     */
    private async notifyPullSpaceFeatureLists(spacesId: string): Promise<void> {
        await this.notifyPullFaceList(spacesId)
        await this.notifyPullVoiceList(spacesId)
        await this.notifyPullPetList(spacesId)
    }

    /**
     * 通知家庭内所有设备拉取人脸列表
     */
    private async notifyPullFaceList(spacesId: string): Promise<void> {
        try {
            // 查询家庭人脸列表
            const faceList = await spaceHttpdao.getFamilySpaceFaceList(spacesId)

            const notifyData: SpacePullFaceListNotify = {
                spacesId: spacesId,
                faceList: faceList
            }

            // 向家庭房间内的所有客户端设备广播
            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.PULL_FACE_LIST, notifyData)

            this.log.infoMsg(`Notified devices to pull face list[${faceList.length}] for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify pull face list for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 通知家庭内所有设备删除人脸
     */
    private async notifyDeleteFaces(spacesId: string, faceIds: string[], names: string[]): Promise<void> {
        try {
            const notifyData: SpaceDeleteFacesNotify = {
                spacesId: spacesId,
                faceIds: faceIds,
                names
            }

            // 向家庭房间内的所有客户端设备广播
            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.DELETE_FACES, notifyData)

            this.log.infoMsg(`Notified devices to delete faces: ${faceIds.join(',')} for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify delete faces for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 通知家庭内所有设备拉取声纹列表
     */
    private async notifyPullVoiceList(spacesId: string): Promise<void> {
        try {
            // 查询家庭声纹列表
            const voiceList = await spaceHttpdao.getFamilySpaceVoiceList(spacesId)

            const notifyData: SpacePullVoiceListNotify = {
                spacesId: spacesId,
                voiceList: voiceList
            }

            // 向家庭房间内的所有客户端设备广播
            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.PULL_VOICE_LIST, notifyData)

            this.log.infoMsg(`Notified devices to pull voice list[${voiceList.length}] for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify pull voice list for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 通知家庭内所有设备删除声纹
     */
    private async notifyDeleteVoices(spacesId: string, voiceIds: string[], names: string[]): Promise<void> {
        try {
            const notifyData: SpaceDeleteVoicesNotify = {
                spacesId: spacesId,
                voiceIds: voiceIds,
                names
            }

            // 向家庭房间内的所有客户端设备广播
            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.DELETE_VOICES, notifyData)

            this.log.infoMsg(`Notified devices to delete voices: ${voiceIds.join(',')} for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify delete voices for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 通知家庭内所有设备拉取宠物列表
     */
    private async notifyPullPetList(spacesId: string): Promise<void> {
        try {
            const petList = await spaceHttpdao.getFamilySpacePetList(spacesId)

            const notifyData: SpacePullPetListNotify = {
                spacesId: spacesId,
                petList: petList
            }

            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.PULL_PET_LIST, notifyData)

            this.log.infoMsg(`Notified devices to pull pet list[${petList.length}] for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify pull pet list for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 通知家庭内所有设备删除宠物
     */
    private async notifyDeletePets(spacesId: string, petIds: string[], names: string[]): Promise<void> {
        try {
            const notifyData: SpaceDeletePetsNotify = {
                spacesId: spacesId,
                petIds: petIds,
                names
            }

            await this.broadcastToSpaceDevices(spacesId, SpaceUserInfoSyncNotifyEvent.DELETE_PETS, notifyData)

            this.log.infoMsg(`Notified devices to delete pets: ${petIds.join(',')} for space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify delete pets for space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 定点通知指定设备将陌生人转为熟人
     */
    private async notifyStrangerToFriend(
        spacesId: string,
        deviceSN: string,
        data: SpaceStrangerToFriendNotify
    ): Promise<void> {
        try {
            const io = serverInstance.getIO()
            const namespace = io.of(env.PATH_PREFIX + CoCoNamespace.AgentData)

            const sockets = await fetchSocketsInRoomClusterSafe(namespace, spacesId)

            let matched = 0
            for (const socket of sockets) {
                if (socket.data.authType !== AuthType.client) {
                    continue
                }

                const currentDeviceSN = socket.data.device?.deviceSN
                if (currentDeviceSN && currentDeviceSN === deviceSN) {
                    socket.emit(SpaceUserInfoSyncNotifyEvent.STRANGER_TO_FRIEND, data)
                    matched++
                }
            }

            if (matched === 0) {
                this.log.warnMsg(
                    `No target device socket found for stranger_to_friend: spacesId=${spacesId}, deviceSN=${deviceSN}`
                )
            } else {
                this.log.infoMsg(
                    `Notified device to stranger_to_friend: spacesId=${spacesId}, deviceSN=${deviceSN}, items=${data.items.length}`
                )
            }
        } catch (error) {
            this.log.errorMsg(`Failed to notify stranger_to_friend: spacesId=${spacesId}, deviceSN=${deviceSN}`, {
                errorMsg: error
            })
        }
    }

    /**
     * 通知指定设备退出家庭房间
     * @param spacesId 家庭 ID
     * @param userId 用户 ID
     * @param deviceSNs 设备 ID 列表
     */
    private async notifyLeaveSpace(spacesId: string, userId: number | null, deviceSNs: string[]): Promise<void> {
        try {
            const notifyData: SpaceLeaveSpaceNotify = {
                spacesId: spacesId,
                reason: `User ${userId ?? 'unknown'} left or device unbound`
            }

            // 查询家庭人脸、声纹与宠物（用于告知端侧需清理的其他设备数据）
            const faceList = await spaceHttpdao.getFamilySpaceFaceList(spacesId)
            const voiceList = await spaceHttpdao.getFamilySpaceVoiceList(spacesId)
            const petList = await spaceHttpdao.getFamilySpacePetList(spacesId)

            // 获取 Socket.IO 实例
            const io = serverInstance.getIO()
            const namespace = io.of(env.PATH_PREFIX + CoCoNamespace.AgentData)

            // 遍历家庭房间内的所有 socket（跨节点失败时仅本机）
            const sockets = await fetchSocketsInRoomClusterSafe(namespace, spacesId)

            for (const socket of sockets) {
                // 只处理客户端设备
                if (socket.data.authType !== AuthType.client) {
                    continue
                }

                // 检查是否是要退出的设备
                const currentDeviceSN = socket.data.device.deviceSN
                if (currentDeviceSN && deviceSNs.includes(currentDeviceSN)) {
                    notifyData.needDel = faceList.map(face => face.name)
                    notifyData.needDelVoice = voiceList.map(voice => voice.name)
                    notifyData.needDelPet = petList.map(pet => pet.name)
                    // 发送通知
                    socket.emit(SpaceUserInfoSyncNotifyEvent.LEAVE_SPACE, notifyData)

                    // 让设备离开家庭房间
                    socket.leave(spacesId)

                    this.log.infoMsg(`Device ${currentDeviceSN} left space ${spacesId}, socketId: ${socket.id}`)
                }
            }

            this.log.infoMsg(`Notified devices to leave space: ${spacesId}, deviceIds: ${deviceSNs.join(',')}`)
        } catch (error) {
            this.log.errorMsg(`Failed to notify leave space: ${spacesId}`, { errorMsg: error })
        }
    }

    /**
     * 向家庭房间内的所有客户端设备广播消息
     * @param spacesId 家庭 ID
     * @param event 事件名称
     * @param data 事件数据
     */
    private async broadcastToSpaceDevices(
        spacesId: string,
        event: SpaceUserInfoSyncNotifyEvent,
        data: any
    ): Promise<void> {
        try {
            // 获取 Socket.IO 实例
            const io = serverInstance.getIO()
            const namespace = io.of(env.PATH_PREFIX + CoCoNamespace.AgentData)

            // 获取家庭房间内的所有 socket（跨节点失败时仅本机）
            const sockets = await fetchSocketsInRoomClusterSafe(namespace, spacesId)

            let clientCount = 0
            for (const socket of sockets) {
                // 只向客户端设备发送
                if (socket.data.authType === AuthType.client) {
                    socket.emit(event, data)
                    clientCount++
                }
            }

            this.log.infoMsg(`Broadcasted ${event} to ${clientCount} devices in space: ${spacesId}`)
        } catch (error) {
            this.log.errorMsg(`Failed to broadcast to space devices: ${spacesId}`, { errorMsg: error })
        }
    }
}
