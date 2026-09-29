/** @format */

import EventEmitter from 'events'
import { AudioFormatEnum } from '@interface/IAgent'

// STT状态枚举
export enum STTState {
    Created = 0,
    Starting = 1,
    Started = 2,
    Closing = 3,
    Closed = 4
}

// STT事件接口定义
export interface STTEvents {
    // 创建事件
    created(): void
    // 连接中事件
    connecting(uid: string, url: string): void
    // 连接成功事件
    connected(uid: string, url: string): void
    // 启动中事件
    starting(): void
    // 已启动事件
    started(): void
    // 添加音频数据事件
    add(): void
    // 接收到识别文本事件
    data(text: string): void
    // 正在关闭事件
    closing(): void
    // 已关闭事件
    closed(): void
    // 断开连接中事件
    disconnecting(uid: string): void
    // 断开连接事件
    disconnected(uid: string, code: number, reason: string): void
    // 错误事件
    error(error: Error): void
    // Volc 错误事件
    innerError(error: Error): void
}

export const STT_WS_TIMEOUT = 5000 // WebSocket连接超时时间，单位毫秒

/**
 * STT基础服务抽象类
 * 定义所有STT服务的通用接口和生命周期
 */
export abstract class STTBaseService extends EventEmitter {
    protected state: STTState // 当前状态
    // 错误事件监听
    public sttError?: Error
    protected uid: string // 用户ID

    protected constructor(uid: string) {
        super()
        this.uid = uid
        this.state = STTState.Created
        this.emit('created')
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
