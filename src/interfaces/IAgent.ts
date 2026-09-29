/** @format */
import { XmlElementType } from '../libs/xml/XmlElement'
import { Trace } from '@interface/ICommon'

/**
 * Socket 响应事件类型
 */
export enum ResponseEvent {
    // 连接响应事件
    CONNECT = 'connect:response',
    // 加入房间响应事件
    JOIN = 'join:response',
    // 聊天响应事件
    CHAT = 'chat:response',
    // 聊天音频响应事件
    CHAT_AUDIO = 'chat:audio:response',
    // 一键执行
    CHAT_ONCE = 'chat:once:response',
    // 快速响应
    CHAT_QUICK = 'chat:quick:response',
    // 中断响应事件
    DONE = 'done:response',
    // 中断SYSTEM响应事件
    DONE_SYSTEM = 'done:system:response',
    // 总结响应事件
    SUMMARIZE = 'summarize:response',
    // 组合技添加响应事件
    RUNNER_ADD = 'runner:add:response',
    // 设备离线事件
    DEVICE_OFFLINE = 'device:offline:notify'
}

/**
 * 双向（转发）事件
 */
export enum NotifyEvent {
    // 前端cocoweb通知机器人打断事件
    APP_INTERRUPT = 'app:interrupt:notify',
    // 向前端同步状态事件
    DEVICE_STATE = 'device:state:notify',
    // 向前端同步异常状态事件
    DEVICE_ERROR_STATE = 'error:notify',
    // 前端向机器人发送PTT事件
    PTT = 'app:ptt:notify'
}

/**
 * 透传事件枚举
 */
export enum RelayEvent {
    // 客户端到网页的透传
    CLIENT_TO_WEB = 'relay:client-to-web',
    // 网页到客户端的透传
    WEB_TO_CLIENT = 'relay:web-to-client'
}

/**
 * 同步事件枚举
 */
export enum SyncEvent {
    // app runner to device
    RUNNER_SYNC = 'app:runner:sync',
    // device face to app
    DEVICE_FACE = 'device:face:sync',
    // device info sync to app
    DEVICE_INFO = 'device:info:sync',
    // 设备的状态机事件
    DEVICE_STATE = 'device:state:sync',
    // device prompt sync
    DEVICE_PROMPT = 'device:prompt:sync'
}

/**
 * request events
 */
export enum RequestEvent {
    JOIN = 'join',
    CHAT = 'chat',
    RTT = 'rtt',
    DONE = 'done',
    // 重置设备
    RESET_DEVICE = 'reset_device'
}

// 加入房间请求接口
export interface JoinRequest extends Trace {
    // 房间名称（设备标识）
    device: string
}

// 加入房间响应接口
export interface JoinResponse {
    // 设备标识
    device: string
    // 分配的 agent 标识
    agent: string | null
    // 对话 ID
    dialogId: string
    // 历史聊天记录
    history: ChatResponse[]
}
// 设备状态机数据
export interface DeviceStateSyncRequest {
    // 设备标识
    type: 'add' | 'update' | 'delete'
    stateData: StateData[]
}

// 聊天请求接口
export interface ChatRequest extends Trace {
    // 结束标志
    end: boolean
    // 文本块
    text?: string
    // 音频数据块 - WebSocket JSON 传输的 base64 编码 PCM 数据
    audio?: Audio | Audio[]
    // 图像数据
    image?: Image | Image[]
    // AI 服务提供商
    provider?: string
    // 使用的模型
    model?: string
    // 状态机数据，只会在end那一轮发送
    state: StateData[]
}

/**
 * 机器人硬件信息
 */
export interface StateData {
    /**
     * routine的名称
     */
    name: string
    /**
     * 成功失败的信息
     */
    desc: string
    /**
     * text 是 json
     * audio or image is base64
     */
    value: string
    /**
     * 音频、图片, json 文本
     */
    type: 'json' | 'audio' | 'image'
    /**
     *  local time (string ISO 8601)
     */
    time?: string
}

/** Prompt 数据结构 */
export interface PromptData {
    /**
     * key的作用，没有业务含义
     */
    key: string
    prompt: string
    /**
     * 版本，目前没有用
     */
    version?: string
    time?: string
}

/** Prompt 同步请求 */
export interface DeviceResourcePromptSyncRequest {
    type: 'update' | 'delete'
    data: PromptData[]
}

// XML 格式聊天请求接口
export interface ChatXmlRequest {
    deviceSN: string // 设备标识
    text: string // XML 格式内容
    // 类型：routine、 debug
    type: string
}

/**
 * 机器人结束一轮对话
 */
export interface DoneRequest {
    // 从0开始，用于追踪打断进度
    idx?: number
    // 中断原因
    reason?: string
    // 是否中断
    interrupt: boolean
}

/**
 * 机器人结束一轮对话
 */
export interface InterruptNotifyRequest {
    // 设备 SN
    device: string
    listen: boolean
}

/**
 * 异常通知类型
 */

export interface DeviceErrorStateNotify {
    name: string
    data: any
    reason?: string
}
/**
 * 通知类型
 */
export interface DeviceStateNotify {
    name: string
    data: StateData
    reason?: string
}

/**
 * 同步数据响应
 */
export interface SyncResponse {
    id: string
    type: 'del' | 'add' | 'update' | 'disable' | 'enable'
    name: string
    data: FuncToken[]
}

/**
 * 同步数据请求
 */
export interface SyncRequest {
    type: 'del' | 'add' | 'update' | 'disable' | 'enable'
    name: string
    data: string
}

/**
 * 面部上传
 */
export interface FaceRequest {
    data: SingleFace[]
}

/**
 * PTT
 */
export interface PttRequest {
    switch: boolean
}
export interface DeviceInfoRequest {
    ip: string[]
}

/**
 * 透传请求接口
 */
export interface RelayRequest {
    // 业务类型，用于端侧区分业务
    type: string
    // 透传数据
    data: any
    // 可选：时间戳
    timestamp?: number
    // 链路追踪ID
    traceId?: string
}

export interface SingleFace {
    /**
     * 对应表的threeId
     */
    id: string
    name: string
}

/**
 * 机器人结束一轮对话
 */
export interface DoneResponse {
    // 设备数据
    data: ChatAssistantResponse[] | null
    // 是否中断
    interrupt: boolean
    // 中断原因
    reason?: string
    // 从0开始，用于追踪打断进度，agentProxy拿不到idx为-1，例如shell报错等情况
    idx?: number
}

/**
 * Shell层生成的函数令牌，将XML转为FuncToken
 */
export interface FuncToken {
    // 往往是TraceID
    id?: string
    // 从0开始，用于追踪打断进度
    idx?: number
    // 函数名称，名称为空代表是音频
    name: string
    // 模式标识
    pattern: Pattern
    // 函数参数
    params?: Record<string, string>
    // 非LLM参数，计算时候使用
    tempParams?: TempParams
    /**
     * 音频 ID。
     * 对于前缀是空格、回车、换行符的文本不会生成音频ID，例如："   我是帅哥"，只会对“我是帅哥”添加audioId
     * 文字开始了后，中间空格回车换行符会有audioID，例如：“我是大    帅哥”，中间空格会生成audioId
     */
    audioId?: string
    // 文本内容
    text?: string
    // 音频数据
    audio?: Audio
    // 图像数据
    image?: Image
    // 原始 XML 令牌
    token?: string
}

export interface TempParams {
    xmlType: XmlElementType
    speaker?: string
    emotion?: string
    speech_rate?: string
    loudness_rate?: string
    language?: string
}

/**
 * 函数调用模式枚举
 */
export enum Pattern {
    // 空模式
    EMPTY = 0,
    // 开始模式
    START = 1,
    // 结束模式
    END = 2
}

/**
 * 一键执行响应接口
 */
export interface ChatXmlResponse {
    /**
     * 函数调用信息
     */
    funcTokens: FuncToken[]
    /**
     * routine false
     * debug true
     */
    interrupt?: boolean
}

/**
 * 一键执行响应接口
 */
export interface ChatQuickResponse {
    /**
     * 函数调用信息
     */
    funcTokens: FuncToken[]
    /**
     * 原始文本
     */
    originalText: string
    /**
     * 相似度
     */
    similarity: number
}

/**
 * 组合技响应接口
 */
export interface RunnerResponse {
    name: string
    description: string
    xml: string
}
/**
 * 聊天基本响应接口
 */
export interface ChatResponse {
    // 往往是TraceID
    id: string
    // LLM 响应上下文角色 todo ChatRoleEnum
    role: 'user' | 'system' | 'assistant' | 'develop' | string
    // 响应包标记位： START/CHUNK/END
    flag: ResponseFlag
    // 时间戳
    timestamp: number
}

/**
 * lamp_search_memory 精简后的单条视频摘要（对 ChatAssistantResponse.video 做 JSON.parse 后数组元素结构）
 */
export interface LampSearchMemoryVideoItem {
    title: string
    summary: string
    video_path: string
    /** 由 COCOADMIN /inner/infra/file/presign-get-url 根据 video_path 填充的临时访问地址 */
    video_url?: string
}

/**
 * 聊天机器人响应接口
 */
export interface ChatAssistantResponse extends ChatResponse {
    // LLM 响应上下文角色
    role: 'assistant'
    // 从0开始，用于追踪打断进度
    idx?: number
    // 函数名称，名称为空代表是音频
    name?: string
    // 模式标识
    pattern?: Pattern
    // 函数参数
    params?: Record<string, string>
    // 音频数据
    audio?: Audio
    // 图像数据
    image?: Image
    // 文本内容
    text?: string
    // lamp 台灯检索
    video?: LampSearchMemoryVideoItem[]
    // 文本内容有 audioId
    audioId?: string
    // 原始 XML 令牌
    token?: string
    // 模型类型
    model?: string
}
/**
 * 聊天用户响应接口
 */
export interface ChatUserResponse extends ChatResponse {
    // LLM 响应上下文角色
    role: 'user'
    // 文本内容
    text?: string
    // 音频数据
    audio?: Audio[]
    // 图像数据
    image?: Image[]
}

export interface ChatSystemResponse extends ChatResponse {
    // LLM 响应上下文角色
    role: 'system'
    // 文本内容
    text?: string
}

/**
 * 响应标志枚举
 */
export enum ResponseFlag {
    // 开始标志
    START = 0,
    // 数据块标志
    CHUNK = 1,
    // 结束标志
    END = 2
}

/**
 * 音频数据接口
 *
 * 1. Buffer 格式（msgpack 解析器）：直接传输二进制数据，性能更好
 * 2. base64 字符串（JSON 解析器）：向后兼容
 */
export interface Audio {
    // 音频数据：支持 Buffer（msgpack）或 base64 字符串（JSON）
    base64: Buffer | string
    // 音频格式
    format: AudioFormatEnum
    // 批次 ID
    id: string
    // 块索引
    index: number
    // 音频块位置标志：开始、数据块、结束
    flag: AudioFlag
    // 采样率，例如 16000, 44100
    sampleRate?: number
    // 声道数：1 为单声道，2 为立体声
    channels?: number
    // 位深度：16, 24, 32
    bitDepth?: number
}

/**
 * 音频标志枚举
 */
export enum AudioFlag {
    // 开始标志
    START = 0,
    // 数据块标志
    CHUNK = 1,
    // 结束标志
    END = 2
}

/**
 * 图像数据接口
 *
 * 支持两种格式：
 * 1. Buffer 格式（msgpack 解析器）：直接传输二进制数据，性能更好
 * 2. base64 字符串（JSON 解析器）：向后兼容
 */
export interface Image {
    // 图像数据：支持 Buffer（msgpack）或 base64 字符串（JSON）
    base64: Buffer | string
    // 图像格式
    format: ImageFormatEnum
    // 宽度
    width?: number
    // 高度
    height?: number
    // 大小（字节）
    size?: number
}

// 图像格式枚举
export enum ImageFormatEnum {
    JPEG = 'jpeg',
    PNG = 'png',
    GIF = 'gif',
    BMP = 'bmp',
    WEBP = 'webp'
}

// 音频格式枚举
export enum AudioFormatEnum {
    PCM = 'pcm',
    OPUS = 'opus',
    WEBM = 'webm',
    MP3 = 'mp3',
    WAV = 'wav'
}
