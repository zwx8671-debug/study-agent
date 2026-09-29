/** @format */
import { Audio, ResponseFlag } from '@interface/IAgent'
import { Trace } from '@interface/ICommon'

export enum AudioRequestEvent {
    TTS = 'tts',
    STT = 'stt'
}

export enum AudioResponseEvent {
    CONNECT = 'connect:response', // 连接响应事件
    JOIN = 'join:response', // 加入房间响应事件
    TTS = 'tts:response',
    STT = 'stt:response'
}

export interface TTSRequest extends Trace {
    index: number
    text: string
    // START/CHUNK/END
    flag: ResponseFlag
    // TTS 参数（可选）
    // 音色/说话人
    speaker?: string
    // 情感
    emotion?: string
    // 语言
    language?: string
    // 音量比率
    loudness_rate?: string
    // 语速比率
    speech_rate?: string
}

// STT语音请求接口
export interface STTRequest extends Trace {
    // 结束标志
    end: boolean
    // 音频数据块 - WebSocket JSON 传输的 base64 编码 PCM 数据
    audio?: Audio | Audio[]
}

// STT语音请求接口
export interface STTResponse extends Trace {
    // 文字
    text: string
    // 时间戳
    timestamp: number
    // 是否结束
    flag?: ResponseFlag
}
