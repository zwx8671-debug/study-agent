/** @format */

import { AsyncLocalStorage } from 'async_hooks'
import { v7 as uuidv7 } from 'uuid'
import { ChatBuffer } from '@service/dto/IAgent.dto'

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
    /** 用户首包时间 */
    userFirstPacketTime?: number
    /** 用户尾包时间 */
    userLastPacketTime?: number
    /** STT开始时间 */
    sttStartTime?: number
    /** STT完成时间 */
    sttCompleteTime?: number
    /** 快速响应开始时间 */
    quickVectorStartTime?: number
    /** 快速响应完成时间 */
    quickVectorEndTime?: number
    /** 数据准备开始时间 */
    dataPrepStartTime?: number
    /** 数据准备完成时间 */
    dataPrepCompleteTime?: number
    /** 连接建立开始时间 */
    connectionStartTime?: number
    /** 连接建立完成时间 */
    connectionCompleteTime?: number
    /** LLM首包时间 */
    llmFirstPacketTime?: number
    /** FuncToken首包发送时间 */
    funcTokenFirstPacketTime?: number
    /** LLM尾包时间 */
    llmLastPacketTime?: number
    /** TTS首包时间 */
    ttsFirstPacketTime?: number
    /** TTS尾包时间 */
    ttsLastPacketTime?: number
}

/**
 * 流量统计接口
 */
export interface TrafficStats {
    /** 音频数据大小（字节） - 输入 */
    audioSize?: number
    /** 图片数据大小（字节） */
    imageSize?: number
    /** 文本长度 */
    textLength?: number
    /** 音频包数量 - 输入 */
    audioPacketCount?: number
    /** 图片数量 */
    imageCount?: number
    /** TTS 输出音频大小（字节） */
    ttsOutputSize?: number
    /** TTS 输出音频包数量 */
    ttsPacketCount?: number
}

export enum Step {
    USER = 'user',
    USER_REPLY = 'user-reply',
    SYSTEM = 'system',
    SYSTEM_REPLY = 'system-reply'
}

/**
 * 链路追踪上下文接口
 */
export interface TraceContext {
    /** 链路追踪ID */
    traceId: string
    /** 设备序列号 */
    deviceSN?: string
    /** 消息ID */
    messageId?: string
    /**
     * user: 用户信息保存阶段
     * user-reply: 模型信息保存阶段
     * system: 接流信息保存阶段
     * system-reply : 接流模型保存阶段
     */
    step?: Step
    /** 事件名称 */
    event?: string
    /** Socket ID */
    socketId?: string
    /** 只针对chat的性能指标 */
    metrics?: PerformanceMetrics
    /** 只针对chat的流量统计 */
    traffic?: TrafficStats
    /** 其他自定义字段 */
    [key: string]: any
}

/**
 * 链路追踪上下文管理器
 * 使用 AsyncLocalStorage 实现自动的上下文传递，无需手动在方法间传递 traceId
 */
export class TraceContextManager {
    private static instance: TraceContextManager
    private asyncLocalStorage: AsyncLocalStorage<TraceContext>

    /**
     * AsyncLocalStorage 是 Node.js 提供的异步上下文存储机制
     * 用于在异步调用链中保持和传递追踪上下文信息，无需显式传参
     * 常用于分布式追踪、日志记录等场景，确保异步操作间的上下文隔离
     */
    private constructor() {
        this.asyncLocalStorage = new AsyncLocalStorage<TraceContext>()
    }

    /**
     * 获取单例实例
     */
    static getInstance(): TraceContextManager {
        if (!TraceContextManager.instance) {
            TraceContextManager.instance = new TraceContextManager()
        }
        return TraceContextManager.instance
    }

    /**
     * 在指定的追踪上下文中运行回调函数
     * @param context 追踪上下文
     * @param callback 要执行的回调函数
     * @returns 回调函数的返回值
     */
    run<T>(context: Partial<TraceContext>, callback: () => T): T {
        // 合并现有上下文和新上下文
        const currentContext = this.getContext()
        const mergedContext: TraceContext = {
            ...currentContext,
            ...context,
            traceId: context.traceId || currentContext.traceId || uuidv7()
        }
        return this.asyncLocalStorage.run(mergedContext, callback)
    }

    /**
     * 获取当前的追踪上下文
     * @returns 当前的追踪上下文，如果不存在则返回空对象
     */
    getContext(): TraceContext {
        return this.asyncLocalStorage.getStore() || { traceId: uuidv7() }
    }

    /**
     * 更新当前上下文的字段
     * @param updates 要更新的字段
     */
    updateContext(updates: Partial<TraceContext>): void {
        const current = this.asyncLocalStorage.getStore()
        if (current) {
            Object.assign(current, updates)
        }
    }

    /**
     * 获取 traceId
     */
    getTraceId(): string {
        return this.getContext().traceId
    }

    /**
     * 获取 deviceSN
     */
    getDeviceSN(): string | undefined {
        return this.getContext().deviceSN
    }

    /**
     * 获取 messageId
     */
    getMessageId(): string | undefined {
        return this.getContext().messageId
    }

    /**
     * 获取所有格式化的上下文信息（用于日志）
     */
    getFormatInfo(): TraceContext {
        const context = this.getContext()
        return {
            traceId: context.traceId,
            socketId: context.socketId,
            ...(context.deviceSN && { deviceSN: context.deviceSN }),
            ...(context.messageId && { messageId: context.messageId }),
            ...(context.step && { step: context.step }),
            ...(context.event && { event: context.event })
        }
    }

    /**
     * 统计输入流量数据（音频、图片、文本）
     * @param buffer
     */
    recordInputTraffic(buffer: ChatBuffer): void {
        const imageBuffers = buffer.image
        const textContent = buffer.text
        const audioBuffers = buffer.audio

        const context = this.getContext()
        const traffic = context.traffic || {}

        // 统计音频大小
        let audioSize = 0
        for (const audio of audioBuffers) {
            if (audio.base64) {
                audioSize += audio.base64.length
            }
        }

        // 统计图片大小
        let imageSize = 0
        for (const image of imageBuffers) {
            if (image.base64) {
                imageSize += image.base64.length
            }
        }

        // 统计文本长度
        const textLength = textContent.length

        // 更新上下文中的流量统计
        this.updateContext({
            traffic: {
                ...traffic,
                audioSize: (traffic.audioSize || 0) + audioSize,
                audioPacketCount: audioBuffers.length,
                imageSize: (traffic.imageSize || 0) + imageSize,
                imageCount: imageBuffers.length,
                textLength: (traffic.textLength || 0) + textLength
            }
        })
    }
}

/**
 * 导出单例实例
 */
export const traceContext = TraceContextManager.getInstance()
