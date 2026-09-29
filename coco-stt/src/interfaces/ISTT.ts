/** @format */

import {Socket} from "socket.io";

/**
 * 音频格式枚举
 */
export enum AudioFormatEnum {
    PCM = 'pcm',
    WAV = 'wav',
    MP3 = 'mp3',
    OPUS = 'opus'
}

/**
 * STT 供应商（流式识别引擎）
 */
export enum STTServiceType {
    Volcengine = 'volcengine',
    Azure = 'azure',
    Qwen = 'qwen',
    Mock = 'mock'
}

/**
 * 流式识别会话参数（stt:start 可选，缺省走各供应商环境变量/默认值）
 */
export interface STTStreamOptions {
    /** 识别语言，如 zh-CN / en-US / ja-JP */
    language?: string
    /** 文本规范化（ITN），火山 / Qwen */
    enableItn?: boolean
    /** 标点，火山 */
    enablePunc?: boolean
    /** 结果返回方式：full 全量 / single 增量，火山 */
    resultType?: 'full' | 'single' | string
    /** Qwen Server VAD：按静音自动分句并推送 delta */
    enableVad?: boolean
}

/**
 * STT请求接口
 */
export interface STTRequest {
    deviceSN: string
    sessionId: string
    format?: AudioFormatEnum
    audio?: Buffer | Buffer[]
    end?: boolean
    traceId?: string
    /** 供应商，缺省用服务端 STT_SERVICE_TYPE。取值 volcengine | azure | qwen | mock */
    provider?: STTServiceType | string
    /** 识别语言，与 options.language 等价，便于客户端扁平传参 */
    language?: string
    /** 供应商可选识别参数 */
    options?: STTStreamOptions
}

/**
 * STT响应接口
 */
export interface STTResponse {
    success: boolean
    sessionId: string
    text?: string
    error?: string
    /** 实际生效的供应商 */
    provider?: string
    traceId?: string
}

/**
 * STT事件接口
 * 注意：会话结束（Final）由 stt:ended 事件表示
 * 客户端应该：
 * 1. 监听 stt:data 事件获取实时识别结果
 * 2. 监听 stt:ended 事件确认会话最终结束
 */
export interface STTEventData {
    sessionId: string
    text: string
    traceId?: string
}

/**
 * Socket.IO 服务端发送事件类型定义
 */
export interface ServerToClientEvents {
    'stt:started': (response: STTResponse) => void
    'stt:data': (data: STTEventData) => void
    'stt:ended': (response: STTResponse) => void
    'stt:error': (response: STTResponse) => void
}

/**
 * Socket.IO 客户端发送事件类型定义
 */
export interface ClientToServerEvents {
    'stt:start': (data: STTRequest) => void
    'stt:audio': (data: STTRequest) => void
    'stt:end': (data: STTRequest) => void
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

export type STTSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
