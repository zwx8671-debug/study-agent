/** @format */

import { PassThrough, Readable } from 'stream'
import { Audio, FuncToken, Image } from '@interface/IAgent'
import { TTSBaseService } from '../../libs/voice/TTSBaseService'
import { STTBaseService } from '../../libs/voice/STTBaseService'
import { Shell } from '../../libs/xml/Shell'

/**
 * 聊天会话接口
 * 管理单个设备的聊天会话状态和资源
 */
export interface ChatSession {
    /** 会话唯一标识，messageId */
    id: string
    /** 功能令牌数组，用于追踪会话中的各种操作 */
    tokens: FuncToken[]

    // 绑定的资源
    /** 文字转语音服务实例 */
    tts: TTSBaseService
    /** XML Shell 处理器实例 */
    shell: Shell
    /** 输入流，用于接收AI响应 */
    llmStream: Readable
    /** LLM输出流，用于传递FuncToken（文本令牌）到TTS和客户端 */
    socketLlmStream: PassThrough
    /** 音频输出流，用于传递TTS生成的音频数据到客户端 */
    socketAudioStream: PassThrough
}

/**
 * 聊天缓冲区接口
 * 用于暂存多模态输入数据，直到消息完整为止
 */
export interface ChatBuffer {
    /** 缓冲区唯一标识（通常是设备ID） */
    id: string
    /** 文本内容 */
    text: string
    /** 音频数据数组 TODO 目前看只是做缓存 */
    audio: Audio[]
    /** 图片数据数组 */
    image: Image[]
    /** 状态机的图片数据数组 */
    stateImage: Image[]
    /** 消息结束时间，用于计算持续时间 */
    endtime: number
    /** 语音转文字服务实例 */
    stt?: STTBaseService
    /**
     * STT 任务开始promise
     */
    sttStartTask?: Promise<STTBaseService>
    /** STT 转换的累积文本 */
    sttText: string
}
