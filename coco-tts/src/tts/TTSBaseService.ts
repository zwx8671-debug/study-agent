/** @format */

import EventEmitter from 'events'
import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/IAgent'

// TTS状态枚举
export enum TTSState {
    Created = 'created', // TTS 已创建
    Connecting = 'connecting', // 连接中
    Connected = 'connected', // 已连接
    Started = 'started', // 已启动
    Closing = 'closing', // 关闭中
    Closed = 'closed', // 已关闭
    Disconnecting = 'disconnecting', // 断开连接中
    Disconnected = 'disconnected' // 已断开
}

// TTS事件接口定义
export interface TTSEvents {
    // 创建事件
    created(): void
    // 连接中事件
    connecting(): void
    // 连接成功事件
    connected(uid: string, resourceId: string): void
    // 会话开始事件
    started(sessionId: string, speaker: string): void
    // 接收到音频数据事件
    data(buffer: Buffer): void
    // 正在关闭事件
    closing(): void
    // 已关闭事件
    closed(sessionId: string): void
    // 断开连接中事件
    disconnecting(): void
    // 断开连接事件
    disconnected(uid: string, resourceId: string, code: number, reason: string): void
    // 错误事件
    error(error: Error): void
    // 有新的句子
    addSentence(): void
}
// WebSocket连接超时时间，单位毫秒 - 可通过环境变量TTS_WS_TIMEOUT配置
export const WS_TIMEOUT = env.TTS_WS_TIMEOUT
/**
 * TTS基础服务抽象类
 * 定义所有TTS服务的通用接口和生命周期
 */
export abstract class TTSBaseService extends EventEmitter {
    protected state: TTSState // 当前状态
    protected uid: string // 用户ID
    protected resourceId: string // 资源ID

    constructor(uid: string, resourceId: string) {
        super()
        this.uid = uid
        this.resourceId = resourceId
        this.state = TTSState.Created
        this.emit('created')
    }

    /**
     * 建立连接
     */
    public abstract connect(resourceId?: string): Promise<void>

    /**
     * WebSocket close 链接
     *
     * close() 方法
     * 优雅关闭：发送关闭帧给对方，等待对方确认后再关闭连接
     * 双向通信：确保双方都知道连接正在关闭
     * 数据完整性：允许在关闭前处理完缓冲区中的数据
     * 状态转换：将连接状态设置为 CLOSING，然后是 CLOSED
     * terminate() 方法
     * 强制关闭：立即断开连接，不发送关闭帧
     * 单方面断开：不等待对方响应或确认
     * 快速释放：立即释放相关资源
     * 状态转换：直接将连接状态设置为 CLOSED
     */
    public abstract disconnect(): Promise<void>

    /**
     * WebSocket terminate 链接
     */
    public abstract interrupt(): void

    /**
     * 启动TTS会话
     */
    public abstract start(
        sessionId: string,
        speaker?: string,
        emotion?: string,
        language?: string,
        loudness_rate?: string,
        speech_rate?: string
    ): Promise<string>

    /**
     * 关闭TTS会话
     */
    public abstract close(sessionId: string): Promise<void>

    /**
     * 推送文本进行TTS转换
     */
    public abstract push(sessionId: string, text: string): Promise<void>

    /**
     * 获取当前状态
     */
    public getState(): TTSState {
        return this.state
    }

    /**
     * 获取用户ID（设备序列号）
     */
    public getUid(): string {
        return this.uid
    }

    /**
     * 获取资源ID
     */
    public getResourceId(): string {
        return this.resourceId
    }

    /**
     * 获取输出音频格式，供传输层告知客户端；各 provider 可覆写
     */
    public getAudioFormat(): string {
        return AudioFormatEnum.PCM
    }

    /**
     * 获取输出音频采样率，供传输层告知客户端；各 provider 可覆写
     */
    public getSampleRate(): number {
        return 16000
    }

    // 类型安全的事件方法重写
    override on<K extends keyof TTSEvents>(event: K, listener: TTSEvents[K]): this {
        return super.on(event, listener)
    }

    override once<K extends keyof TTSEvents>(event: K, listener: TTSEvents[K]): this {
        return super.once(event, listener)
    }

    override emit<K extends keyof TTSEvents>(event: K, ...args: Parameters<TTSEvents[K]>): boolean {
        // EventEmitter 对无监听者的 'error' 事件会直接抛出，独立进程下会导致整个服务退出，
        // 这里降级为日志，由上层通过状态/超时感知异常
        if (event === 'error' && this.listenerCount('error') === 0) {
            console.error(`[TTSBaseService] 未监听的 error 事件 uid=${this.uid}`, ...args)
            return false
        }
        return super.emit(event, ...args)
    }

    override off<K extends keyof TTSEvents>(event: K, listener?: TTSEvents[K]): this {
        if (listener) return super.off(event, listener)
        else return this.removeAllListeners(event)
    }

    /**
     * 设置状态
     */
    protected setState(state: TTSState): void {
        this.state = state
    }
}
