/** @format */
/**
 * 聊天记录管理器模块
 * 负责拼接聊天响应文本并保存到文件
 */

import * as fs from 'fs'
import * as path from 'path'
import { ResponseFlag } from '@interface/IAgent'

/**
 * 聊天记录接口
 */
export interface ChatRecord {
    traceId: string
    timestamp: string
    clientId: number
    deviceSN: string
    round: number
    request: string
    response: string
    hasAudio: boolean
    requestTime: string
    responseTime?: string
    duration?: number // 响应时长（毫秒）
}

/**
 * 待完成的记录
 */
interface PendingRecord {
    traceId: string
    clientId: number
    deviceSN: string
    round: number
    request: string
    hasAudio: boolean
    requestTime: string
    requestTimestamp: number
}

/**
 * ChatRecorder 配置
 */
export interface ChatRecorderConfig {
    outputDir: string
    enabled?: boolean
    mode?: 'per-client' | 'single'
}

/**
 * 聊天记录管理器类
 */
export class ChatRecorder {
    private outputDir: string
    private enabled: boolean
    private mode: 'per-client' | 'single'
    private textBuffers: Map<string, string[]> = new Map()
    private pendingRecords: Map<string, PendingRecord> = new Map()
    private filePathCache: Map<string, string> = new Map() // 缓存文件路径
    private sessionTimestamp: string // 会话时间戳

    constructor(config: ChatRecorderConfig) {
        this.outputDir = config.outputDir
        this.enabled = config.enabled ?? true
        this.mode = config.mode ?? 'per-client'

        // 生成会话时间戳（整个测试会话使用同一个时间戳）
        const now = new Date()
        const date = now.toISOString().replace(/[:.]/g, '-').split('T')[0]
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '')
        this.sessionTimestamp = `${date}_${time}`

        if (this.enabled) {
            this.initOutputDir()
        }
    }

    /**
     * 初始化输出目录
     */
    private initOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true })
        }
    }

    /**
     * 获取文件路径（使用缓存确保同一客户端使用同一文件）
     */
    private getFilePath(clientId: number, deviceSN: string): string {
        // 生成缓存键
        const cacheKey = this.mode === 'per-client' ? `${clientId}_${deviceSN}` : 'global'

        // 如果已经缓存，直接返回
        if (this.filePathCache.has(cacheKey)) {
            return this.filePathCache.get(cacheKey)!
        }

        // 生成新的文件路径
        let filePath: string
        if (this.mode === 'per-client') {
            filePath = path.join(this.outputDir, `client_${clientId}_${deviceSN}_${this.sessionTimestamp}.jsonl`)
        } else {
            filePath = path.join(this.outputDir, `chat_log_${this.sessionTimestamp}.jsonl`)
        }

        // 缓存文件路径
        this.filePathCache.set(cacheKey, filePath)

        return filePath
    }

    /**
     * 记录请求
     */
    recordRequest(
        traceId: string,
        clientId: number,
        deviceSN: string,
        text: string,
        hasAudio: boolean,
        round: number
    ): void {
        if (!this.enabled) return

        const requestTime = new Date().toLocaleString('zh-CN', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        })

        this.pendingRecords.set(traceId, {
            traceId,
            clientId,
            deviceSN,
            round,
            request: text,
            hasAudio,
            requestTime,
            requestTimestamp: Date.now()
        })

        // 初始化文本缓冲区
        this.textBuffers.set(traceId, [])
    }

    /**
     * 添加响应文本片段
     */
    addResponseFragment(traceId: string, text: string): void {
        if (!this.enabled) return

        const buffer = this.textBuffers.get(traceId)
        if (buffer) {
            buffer.push(text)
        }
    }

    /**
     * 完成记录并保存到文件
     */
    async finalizeRecord(traceId: string, flag?: ResponseFlag, error?: string): Promise<void> {
        if (!this.enabled) return

        const pending = this.pendingRecords.get(traceId)
        const buffer = this.textBuffers.get(traceId)

        if (!pending) {
            return
        }

        const responseTime = new Date().toLocaleString('zh-CN', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        })

        const duration = Date.now() - pending.requestTimestamp

        const record: ChatRecord = {
            traceId: pending.traceId,
            timestamp: pending.requestTime,
            clientId: pending.clientId,
            deviceSN: pending.deviceSN,
            round: pending.round,
            request: pending.request,
            response: buffer ? buffer.join('') : '',
            hasAudio: pending.hasAudio,
            requestTime: pending.requestTime,
            responseTime,
            duration,
            ...(error && { error }), // 如果有错误信息，添加到记录中
            ...(flag && { flag }) // 添加 flag 信息
        }

        // 保存到文件
        await this.saveRecord(record)

        // 清理缓存
        this.textBuffers.delete(traceId)
        this.pendingRecords.delete(traceId)
    }

    /**
     * 保存记录到文件
     */
    private async saveRecord(record: ChatRecord): Promise<void> {
        try {
            const filePath = this.getFilePath(record.clientId, record.deviceSN)
            const line = JSON.stringify(record) + '\n'

            // 追加写入文件
            await fs.promises.appendFile(filePath, line, 'utf8')
        } catch (error) {
            console.error('保存聊天记录失败:', error)
        }
    }

    /**
     * 获取输出目录
     */
    getOutputDir(): string {
        return this.outputDir
    }

    /**
     * 清理所有缓存
     */
    clearAll(): void {
        this.textBuffers.clear()
        this.pendingRecords.clear()
    }
}
