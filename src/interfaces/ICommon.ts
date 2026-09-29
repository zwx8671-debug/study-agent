/** @format */

import { Audio, FuncToken } from '@interface/IAgent'
import {
    DeviceFaceInnerRespVO,
    DevicePetInnerRespVO,
    DeviceVoiceInnerRespVO
} from '@httpdao/cocoadmin/common/cocoadmin.interface'

/** @format */
export enum GlobalResponse {
    ERROR = 'error:global'
}

export enum CODE {
    SUCCESS = 200, // success
    ERROR = 0, // error
    NO_AUTH = 401 // no auth
}

export interface SocketResponse<T> {
    code: CODE
    data: T
    msg: string
}

export interface HttpResponse<T> {
    code: CODE
    data: T
    msg: string
}

export interface ConnectedResponse {
    namespace: string // 命名空间
    socketId: string // socket id
}

export interface DisConnectedResponse {
    reason: string // 原因
    timestamp: string
    deviceSN: string // 设备 ID
    deviceId: string
}

/**
 * request events
 */
export enum CoCoNamespace {
    Agent = '/agent',
    AgentAudio = '/agent-audio',
    AgentTrigger = '/agent-trigger',
    AgentRelay = '/agent-relay',
    AgentData = '/agent-data'
}

export enum AuthType {
    client = 'client',
    web = 'web'
}

/**
 * AgentData（/agent-data）命名空间事件
 */
export const AgentDataEvent = {
    GET_SPACES_STRANGER_LIST: 'get-spaces-stranger-list',
    STRANGER_TO_FRIEND: 'space:stranger_to_friend',
    /** 设备在已连接 agent-data 后无参调用，按后台绑定加入/同步家庭房间 */
    JOIN_SPACE: 'join:space'
} as const

/**
 * APP 查询家庭内陌生人列表入参
 */
export interface GetSpacesStrangerListReq {
    spaceId: string
}

/**
 * 家庭内设备上报的陌生人人脸条目
 */
export interface SpaceStrangerFaceItem {
    deviceSN: string
    base64: string
    id: string
}
export interface ChatXml2Result {
    textFuncTokens: FuncToken[]
    audioFuncTokens: AudioResponse
}

export interface Trace {
    // 跟踪ID
    traceId: string
}

/** 音频响应 */
export interface AudioResponse {
    // 往往是TraceID
    id: string
    // 音频数据
    audio: Audio | Audio[]
}

/**
 * 家庭用户信息同步触发类型（包含人脸、声纹和宠物）
 */
export enum SpaceUserInfoSyncTrigger {
    MEMBER_JOIN = 'member_join', // 成员加入家庭
    MEMBER_LEAVE = 'member_leave', // 成员离开家庭
    DEVICE_BIND = 'device_bind', // 设备绑定到家庭
    DEVICE_UNBIND = 'device_unbind', // 设备从家庭解绑
    FACE_ADD = 'face_add', // 添加人脸
    FACE_DELETE = 'face_delete', // 删除人脸
    VOICE_ADD = 'voice_add', // 添加声纹
    VOICE_DELETE = 'voice_delete', // 删除声纹
    PET_ADD = 'pet_add', // 添加宠物
    PET_DELETE = 'pet_delete', // 删除宠物
    STRANGER_ADD = 'stranger_add' // 陌生人
}

/**
 * 家庭用户信息同步通知事件
 */
export enum SpaceUserInfoSyncNotifyEvent {
    PULL_AES_KEY = 'space:pull_aes_key', // 拉取家庭 AES 密钥
    PULL_FACE_LIST = 'space:pull_face_list', // 拉取家庭人脸列表
    DELETE_FACES = 'space:delete_faces', // 删除人脸
    PULL_VOICE_LIST = 'space:pull_voice_list', // 拉取家庭声纹列表
    DELETE_VOICES = 'space:delete_voices', // 删除声纹
    PULL_PET_LIST = 'space:pull_pet_list', // 拉取家庭宠物列表
    DELETE_PETS = 'space:delete_pets', // 删除宠物
    STRANGER_TO_FRIEND = 'space:stranger_to_friend', // 陌生人转为熟人（定点通知指定设备）
    LEAVE_SPACE = 'space:leave_space' // 退出家庭房间
}

/**
 * Redis 订阅的家庭用户信息同步消息（包含人脸、声纹和宠物）
 */
export interface SpaceUserInfoSyncMessage {
    space_id: string // 家庭 ID
    trigger: SpaceUserInfoSyncTrigger // 触发类型
    user_id: number | null // 用户 ID（部分触发类型可能为 null）
    devices: Array<{
        device_sn: string // 设备 SN
        face_ids?: string[] // 人脸 ID 列表
        voice_ids?: string[] // 声纹 ID 列表
        pet_ids?: string[] // 宠物 ID 列表
        names: string[] // 名称列表（人脸、声纹和宠物共用）
        stranger_names?: string[] // 陌生人名称列表（用于陌生人转熟人）
    }>
}

/**
 * 陌生人转熟人（定点通知指定设备）的条目
 */
export interface SpaceStrangerToFriendItem {
    /** 人脸 ID（如端侧需要用 ID 进行定位） */
    faceId?: string
    /** 原陌生人名称（旧名称） */
    strangerName: string
    /** 转为熟人后的名称（新名称） */
    name: string
}

/**
 * 通知设备将陌生人转为熟人的数据
 */
export interface SpaceStrangerToFriendNotify {
    spacesId: string // 家庭 ID
    deviceSN: string // 设备 SN
    items: SpaceStrangerToFriendItem[] // 转换条目（按索引一一对应后的结果）
}

/**
 * 通知设备拉取 AES 密钥的数据
 */
export interface SpacePullAESKeyNotify {
    spacesId: string // 家庭 ID
    aesKey?: string // AES 密钥
}

/**
 * 通知设备拉取人脸列表的数据
 */
export interface SpacePullFaceListNotify {
    spacesId: string // 家庭 ID
    faceList?: DeviceFaceInnerRespVO[] // 人脸列表数据
}

/**
 * 通知设备删除人脸的数据
 */
export interface SpaceDeleteFacesNotify {
    spacesId: string // 家庭 ID
    faceIds: string[] // 要删除的人脸 ID 列表
    names: string[] // 要删除的人脸 列表
}

/**
 * 通知设备拉取声纹列表的数据
 */
export interface SpacePullVoiceListNotify {
    spacesId: string // 家庭 ID
    voiceList?: DeviceVoiceInnerRespVO[] // 声纹列表数据
}

/**
 * 通知设备删除声纹的数据
 */
export interface SpaceDeleteVoicesNotify {
    spacesId: string // 家庭 ID
    voiceIds: string[] // 要删除的声纹 ID 列表
    names: string[] // 要删除的声纹名称列表
}

/**
 * 通知设备拉取宠物列表的数据
 */
export interface SpacePullPetListNotify {
    spacesId: string // 家庭 ID
    petList?: DevicePetInnerRespVO[] // 宠物列表数据
}

/**
 * 通知设备删除宠物的数据
 */
export interface SpaceDeletePetsNotify {
    spacesId: string // 家庭 ID
    petIds: string[] // 要删除的宠物 ID 列表
    names: string[] // 要删除的宠物名称列表
}

/**
 * 通知设备离开家庭房间的数据
 */
export interface SpaceLeaveSpaceNotify {
    spacesId: string // 家庭 ID
    needDel?: string[] // 需要删除的人脸名称（其他设备创建的）
    needDelVoice?: string[] // 需要删除的声纹名称（其他设备创建的）
    needDelPet?: string[] // 需要删除的宠物名称（其他设备创建的）
    reason: string // 离开原因
}

export class CommonUtils {
    static toAudioRes(fc: AudioResponse[]): AudioResponse {
        if (fc.length === 0) {
            return { id: '', audio: [] }
        }

        // 获取第一个音频响应的 id
        const id = fc[0].id || ''

        // 获取音频数据
        const audios: Audio[] = []

        for (const item of fc) {
            if (Array.isArray(item.audio)) {
                audios.push(...item.audio)
            } else {
                audios.push(item.audio)
            }
        }

        return {
            id,
            audio: audios
        }
    }
}
