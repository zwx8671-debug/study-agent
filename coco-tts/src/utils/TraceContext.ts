/** @format */

import { AsyncLocalStorage } from 'async_hooks'

/**
 * Trace 上下文接口
 */
export interface TraceContextData {
    sessionId?: string
    traceId?: string
    socketId?: string
    deviceSN?: string
}

/**
 * TraceContext - 使用 AsyncLocalStorage 管理请求级别的追踪上下文
 *
 * 优势：
 * 1. 线程安全：每个异步调用链都有独立的上下文
 * 2. 自动传播：上下文会自动传播到所有异步调用
 * 3. 无需显式传参：避免在函数间手动传递 traceId/sessionId
 */
export class TraceContext {
    private static storage = new AsyncLocalStorage<TraceContextData>()

    /**
     * 设置当前异步上下文的 trace 信息
     * @param data Trace 上下文数据
     */
    static set(data: TraceContextData): void {
        const currentContext = this.storage.getStore()
        if (currentContext) {
            // 合并现有上下文
            this.storage.enterWith({ ...currentContext, ...data })
        } else {
            this.storage.enterWith(data)
        }
    }

    /**
     * 获取当前异步上下文的 trace 信息
     * @returns Trace 上下文数据，如果不存在则返回 undefined
     */
    static get(): TraceContextData | undefined {
        return this.storage.getStore()
    }

    /**
     * 在指定的上下文中运行回调函数
     * @param data Trace 上下文数据
     * @param callback 回调函数
     */
    static run<T>(data: TraceContextData, callback: () => T): T {
        return this.storage.run(data, callback)
    }

    /**
     * 清除当前上下文（实际上 AsyncLocalStorage 会在异步调用结束时自动清理）
     * 这个方法主要用于显式清理场景
     */
    static clear(): void {
        this.storage.disable()
    }

    /**
     * 获取 sessionId
     */
    static getSessionId(): string | undefined {
        return this.get()?.sessionId
    }

    /**
     * 获取 traceId
     */
    static getTraceId(): string | undefined {
        return this.get()?.traceId
    }

    /**
     * 获取 socketId
     */
    static getSocketId(): string | undefined {
        return this.get()?.socketId
    }

    /**
     * 获取 deviceSN
     */
    static getDeviceSN(): string | undefined {
        return this.get()?.deviceSN
    }
}
