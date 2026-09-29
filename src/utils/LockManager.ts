/** @format */

import AsyncLock from 'async-lock'
import { ChatSession } from '@service/dto/IAgent.dto'
import { getLogger } from '@utils/Logger'
import $ from '../utils/util'
import { traceContext } from '@utils/TraceContext'
import { agentChatConcurrentDec } from '../prometheus/metrics'
import { metricsLogger } from '@utils/MetricsLogger'

/**
 * 锁管理器类
 * 用于管理设备会话的并发控制，确保同一设备同时只能有一个活跃会话
 */
export class LockManager {
    /** 异步锁实例，用于控制对会话的并发访问 */
    private readonly locks = new AsyncLock()
    /** 活跃会话映射表，deviceSN -> session */
    private readonly sessions = new Map<string, ChatSession>()

    private readonly logger = getLogger(LockManager.name)

    constructor() {}

    /**
     * 检查指定设备是否被锁定（是否有活跃会话）
     * @param deviceSN 设备ID
     * @returns 是否被锁定
     */
    async isLocked(deviceSN: string): Promise<boolean> {
        return this.locks.acquire(deviceSN, () => this.sessions.has(deviceSN))
    }

    /**
     * 启动新的聊天会话
     * @param deviceSN 设备ID
     * @param session 会话对象
     * @returns 启动的会话对象
     * @throws 如果设备已有活跃会话，抛出错误
     */
    async start(deviceSN: string, session: ChatSession): Promise<ChatSession> {
        return this.locks.acquire(deviceSN, () => {
            if (this.sessions.has(deviceSN)) {
                throw new Error(`Device [${deviceSN} - ${traceContext.getTraceId()}] is locked`)
            }

            this.logger.infoMsg(`Starting session lock for device [${deviceSN}],[sessionId:${session.id}]`)
            this.sessions.set(deviceSN, session)
            return session
        })
    }

    /**
     * 中断指定设备的会话
     * 强制终止正在进行的对话和相关资源
     * @param deviceSN 设备ID
     * @param error
     * @returns 被中断的会话对象，如果不存在则返回null
     */
    async interrupt(deviceSN: string, error?: unknown): Promise<ChatSession | null> {
        return await this.locks.acquire(deviceSN, async () => {
            const session = this.sessions.get(deviceSN)
            if (!session) return null // 无会话，直接返回成功

            try {
                this.logger.warn(`Interrupting session for device [${deviceSN}]`)

                // 有异常通过web llm文本流中传递
                if (error) {
                    // [prometheus]有异常情况下是异常打断
                    agentChatConcurrentDec()

                    if (error instanceof Error) {
                        session.socketLlmStream?.destroy(error)
                        metricsLogger.logChatMetrics(false, (error as Error).message)
                    } else {
                        const error2 = new Error($.toString(error))
                        session.socketLlmStream?.destroy()
                        metricsLogger.logChatMetrics(false, error2.message)
                    }

                    // 等待会话输出流关闭或超时50毫秒，最好把Error发送到端侧。
                    await Promise.race([
                        new Promise(resolve => {
                            session.socketLlmStream?.once('close', resolve)
                        }),
                        new Promise(resolve => setTimeout(resolve, 50))
                    ])
                } else {
                    session.socketLlmStream?.end()
                }

                // 关闭音频流
                session.socketAudioStream?.end()

                // 关闭输入流
                if (!session.llmStream?.closed) {
                    session.llmStream?.destroy()
                }

                session.shell?.interrupt()
                session.tts?.interrupt()
                this.logger.infoMsg(`Session interrupted successfully`)
            } catch (error) {
                this.logger.errorMsg(`Error interrupting session `, { errorMsg: error })
            } finally {
                session.socketLlmStream?.removeAllListeners()
                session.socketAudioStream?.removeAllListeners()
                session.shell?.removeAllListeners()
                session.tts?.removeAllListeners()

                // 无论如何都要从会话映射中删除
                this.sessions.delete(deviceSN)
                this.logger.infoMsg(`Session unlocked (interrupted)`)
            }
            return session
        })
    }

    /**
     * 获取指定设备的会话对象
     * @param deviceSN
     */
    public async getSession(deviceSN: string): Promise<ChatSession | undefined> {
        return this.locks.acquire(deviceSN, () => this.sessions.get(deviceSN))
    }

    /**
     * 释放指定设备的锁
     * @param deviceSN
     */
    public async release(deviceSN: string): Promise<boolean> {
        this.logger.infoMsg(`[锁管理] release 开始，等待获取锁`)
        return await this.locks.acquire(deviceSN, () => {
            const session = this.sessions.get(deviceSN)
            if (!session) {
                return true // 无会话，直接返回成功
            }

            return this.sessions.delete(deviceSN)
        })
    }
}
export const lockManager = new LockManager()
