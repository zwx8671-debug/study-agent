/** @format */

import { Socket } from 'socket.io'

/**
 * TTS Socket.IO 通信协议定义
 *
 * 一次连接的完整生命周期：
 *   tts:connect  → tts:connected
 *   tts:start    → tts:started        （一次连接可串行开启多个会话）
 *   tts:push     → tts:data ...       （文本可分多次增量推送，音频分块流式返回）
 *   tts:close    → tts:data ... tts:end
 *   tts:disconnect → tts:disconnected
 */

/**
 * 客户端 → 服务端事件
 */
export enum TTSClientEvent {
    /** 建立TTS连接 */
    CONNECT = 'tts:connect',
    /** 开始TTS会话 */
    START = 'tts:start',
    /** 推送文本（可增量多次调用，实现流式文本输入） */
    PUSH = 'tts:push',
    /** 关闭会话 */
    CLOSE = 'tts:close',
    /** 断开连接 */
    DISCONNECT = 'tts:disconnect',
    /** 中断当前会话 */
    INTERRUPT = 'tts:interrupt'
}

/**
 * 服务端 → 客户端事件
 */
export enum TTSServerEvent {
    /** 连接成功 */
    CONNECTED = 'tts:connected',
    /** 会话已开始 */
    STARTED = 'tts:started',
    /** 音频数据（流式分块） */
    DATA = 'tts:data',
    /** 会话结束（tts:close 的最终响应） */
    END = 'tts:end',
    /** 已断开连接 */
    DISCONNECTED = 'tts:disconnected',
    /** 错误信息 */
    ERROR = 'tts:error'
}

/**
 * 连接请求
 */
export interface TTSConnectRequest {
    /** 设备序列号（用作连接标识 / 上游 uid） */
    deviceSN: string
    /** 资源ID（可选） */
    resourceId?: string
    /** 链路追踪ID */
    traceId?: string
    /** 指定提供商，缺省用环境变量 TTS_SERVICE_TYPE */
    provider?: string
}

/**
 * 连接响应
 */
export interface TTSConnectResponse {
    /** 是否成功 */
    success: boolean
    /** 设备序列号 */
    deviceSN: string
    /** 资源ID */
    resourceId: string
    /** 音频格式，如 pcm */
    format?: string
    /** 音频采样率，如 16000 */
    sampleRate?: number
    /** 错误信息（如果失败） */
    error?: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 开始会话请求
 */
export interface TTSStartRequest {
    /** 会话ID */
    sessionId: string
    /** 说话人 */
    speaker?: string
    /** 情感 */
    emotion?: string
    /** 语言 */
    language?: string
    /** 音量倍率 */
    loudness_rate?: string
    /** 语速倍率 */
    speech_rate?: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 开始会话响应
 */
export interface TTSStartResponse {
    /** 是否成功 */
    success: boolean
    /** 会话ID */
    sessionId: string
    /** 实际生效的说话人 */
    speaker?: string
    /** 错误信息（如果失败） */
    error?: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 推送文本请求
 */
export interface TTSPushRequest {
    /** 会话ID */
    sessionId: string
    /** 要转换的文本片段 */
    text: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 音频数据标志
 */
export enum AudioFlag {
    /** 首块 */
    START = 'start',
    /** 中间块 */
    CHUNK = 'chunk',
    /** 结束（空包，仅标志） */
    END = 'end'
}

/**
 * 音频数据响应
 */
export interface TTSDataResponse {
    /** 会话ID */
    sessionId: string
    /** 音频块索引，从 0 开始自增 */
    index: number
    /** 音频标志 */
    flag: AudioFlag
    /** 音频数据（Buffer，msgpack 会自动处理二进制） */
    buffer: Buffer
    /** 音频格式 */
    format: string
    /** 采样率 */
    sampleRate: number
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 关闭会话请求
 */
export interface TTSCloseRequest {
    /** 会话ID */
    sessionId: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 会话结束响应（tts:close 的最终响应）
 */
export interface TTSEndResponse {
    /** 是否成功 */
    success: boolean
    /** 会话ID */
    sessionId: string
    /** 本次会话累计下发的音频块数量 */
    index: number
    /** 错误信息（如果失败） */
    error?: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 断开连接请求
 */
export interface TTSDisconnectRequest {
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 断开连接响应
 */
export interface TTSDisconnectResponse {
    /** 设备序列号 */
    deviceSN: string
    /** 资源ID */
    resourceId: string
    /** 断开代码 */
    code: number
    /** 断开原因 */
    reason: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 中断请求
 */
export interface TTSInterruptRequest {
    /** 链路追踪ID */
    traceId?: string
}

/**
 * 错误响应
 */
export interface TTSErrorResponse {
    /** 是否成功，恒为 false，便于客户端统一判断 */
    success: false
    /** 错误信息 */
    error: string
    /** 错误详情 */
    details?: any
    /** 会话ID（如果有） */
    sessionId?: string
    /** 链路追踪ID */
    traceId?: string
}

/**
 * Socket.IO 服务端发送事件类型定义
 */
export interface ServerToClientEvents {
    'tts:connected': (response: TTSConnectResponse) => void
    'tts:started': (response: TTSStartResponse) => void
    'tts:data': (response: TTSDataResponse) => void
    'tts:end': (response: TTSEndResponse) => void
    'tts:disconnected': (response: TTSDisconnectResponse) => void
    'tts:error': (response: TTSErrorResponse) => void
}

/**
 * Socket.IO 客户端发送事件类型定义
 */
export interface ClientToServerEvents {
    'tts:connect': (req: TTSConnectRequest) => void
    'tts:start': (req: TTSStartRequest) => void
    'tts:push': (req: TTSPushRequest) => void
    'tts:close': (req: TTSCloseRequest) => void
    'tts:disconnect': (req?: TTSDisconnectRequest) => void
    'tts:interrupt': (req?: TTSInterruptRequest) => void
}

/**
 * Socket.IO 服务端间事件类型定义（用于命名空间通信）
 */
export interface InterServerEvents {
    // 预留给服务器间通信使用
}

/**
 * Socket.IO Socket数据类型定义
 */
export interface SocketData {
    sessionId?: string
    deviceSN?: string
}

export type TTSSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
