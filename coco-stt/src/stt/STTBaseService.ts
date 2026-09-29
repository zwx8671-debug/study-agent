/** @format */

import EventEmitter from 'events'
import { AudioFormatEnum } from '@interface/ISTT'

// STT状态枚举
export enum STTState {
    Created = 0,
    Starting = 1,
    Started = 2,
    Closing = 3,
    Closed = 4
}

// STT事件接口定义（仅保留有监听方的事件）
export interface STTEvents {
    // 添加音频数据，供发送循环等待队列
    add(): void
    // 接收到识别文本
    data(text: string): void
    // 正在关闭，供发送循环退出等待
    closing(): void
    // 对外错误
    error(error: Error): void
    // 内部错误，供 waitFor 中断
    innerError(error: Error): void
}

export const STT_WS_TIMEOUT = 5000 // WebSocket连接超时时间，单位毫秒

/**
 * STT 流式服务抽象接口。
 * Socket.IO 只认 start / push / close；火山和 Qwen 的共用状态机在 STTWsStreamService。
 */
export abstract class STTBaseService extends EventEmitter {
    protected state: STTState // 当前状态
    // 错误事件监听
    public sttError?: Error
    protected uid: string // 用户ID
    protected accumulatedText: string = '' // 累积的识别文本

    protected constructor(uid: string) {
        super()
        this.uid = uid
        this.state = STTState.Created
    }

    /**
     * 启动STT会话
     */
    public abstract start(format?: AudioFormatEnum): Promise<STTBaseService>

    /**
     * 关闭STT会话
     */
    public abstract close(): Promise<STTBaseService>

    /**
     * 推送音频数据
     * @param audioData 音频数据，支持 Buffer 或 base64 字符串（向后兼容）
     */
    public abstract push(audioData: Buffer): void
    public abstract disconnect(): void

    /**
     * 获取当前状态
     */
    public getState(): STTState {
        return this.state
    }

    /**
     * 设置状态
     */
    protected setState(state: STTState): void {
        this.state = state
    }

    /**
     * 获取累积的识别文本
     */
    public getAccumulatedText(): string {
        return this.accumulatedText
    }

    /**
     * 设置累积的识别文本
     */
    public setAccumulatedText(text: string): void {
        this.accumulatedText = text
    }

    // 类型安全的事件方法重写
    override on<K extends keyof STTEvents>(event: K, listener: STTEvents[K]): this {
        return super.on(event, listener)
    }

    override once<K extends keyof STTEvents>(event: K, listener: STTEvents[K]): this {
        return super.once(event, listener)
    }

    override emit<K extends keyof STTEvents>(event: K, ...args: Parameters<STTEvents[K]>): boolean {
        return super.emit(event, ...args)
    }

    override off<K extends keyof STTEvents>(event: K, listener?: STTEvents[K]): this {
        if (listener) return super.off(event, listener)
        else return this.removeAllListeners(event)
    }
}
