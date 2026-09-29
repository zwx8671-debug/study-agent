/** @format */

import pino, {type Logger as PinoLogger, type LoggerOptions} from 'pino'
import {formatInTimeZone} from 'date-fns-tz'
import path from "path";
import {existsSync} from "fs";
import {mkdirSync} from "node:fs";
import {TraceContext} from './TraceContext'
import {SessionInfo} from "@socketio/STTSocket";

const LOG_DIR = './logs'

// 仅在需要文件输出时创建日志目录
if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
}
const isProd = process.env.NODE_ENV === 'production'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '7', 10)
const ENABLE_FILE_LOG = process.env.ENABLE_FILE_LOG !== 'false'

interface FormatInfo {
    errorMsg?: any
    deviceSN?: string
    sessionId?: string
    socketId?: string
    traceId?: string
    oldSessionId?: string
    newSessionId?: string
    existingSessionId?: string
    expectedSessionId?: string
    receivedSessionId?: string
    idleTime?: number
    finalText?: string // 最终识别文本
    timings?: {
        sessionStartTime?: number
        firstAudioTime?: number | null
        lastAudioTime?: number | null
        firstRecognitionTime?: number | null
        sessionEndTime?: number
        totalSessionDuration?: number
        audioStreamDuration?: number | null
        timeToFirstRecognition?: number | null
        recognitionDuration?: number | null
    }
    timingStats?: string // 时间统计表格（格式化后的字符串）
}

export class Logger {
    private logger: PinoLogger
    private static childCache = new Map<string, Logger>()
    private static rootInstance: Logger | null = null

    public constructor(moduleName?: string) {
        const baseOptions: LoggerOptions = {
            level: LOG_LEVEL,
            formatters: {
                level: label => ({level: label})
            },
            timestamp: () => {
                const shanghaiTz = 'Asia/Shanghai'
                const timeStr = formatInTimeZone(new Date(), shanghaiTz, 'yyyy-MM-dd HH:mm:ss.SSS')
                return `,"time":"${timeStr}"`
            },
            ...(moduleName && {base: {module: moduleName}})
        }

        if (isProd) {
            // 生产环境：输出到 stdout (CloudWatch)，可选文件日志
            const streams = [
                {
                    level: LOG_LEVEL,
                    stream: process.stdout
                }
            ]

            // 如果启用文件日志
            if (ENABLE_FILE_LOG) {
                streams.push({
                    level: LOG_LEVEL,
                    stream: pino.transport({
                        target: 'pino-roll',
                        options: {
                            file: path.join(LOG_DIR, 'app.log'),
                            extension: 'log',
                            frequency: 'daily',
                            size: '10m',
                            dateFormat: 'yyyy-MM-dd',
                            limit: {
                                count: LOG_RETENTION_DAYS
                            },
                            encoding: 'utf8'
                        }
                    })
                })
            }

            this.logger = pino(baseOptions, pino.multistream(streams))
        } else {
            // 开发环境：输出到控制台（pretty），可选文件日志
            const streams = [
                {
                    level: LOG_LEVEL,
                    stream: pino.transport({
                        target: 'pino-pretty',
                        options: {
                            colorize: true,
                            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', // local time with milliseconds
                            ignore: 'pid,hostname,module',
                            singleLine: true,
                            messageFormat: '{module} - {msg}',
                            sync: false, // 异步输出，避免阻塞

                            encoding: 'utf8'
                        }
                    })
                }
            ]

            // 如果启用文件日志
            if (ENABLE_FILE_LOG) {
                streams.push({
                    level: LOG_LEVEL,
                    stream: pino.transport({
                        target: 'pino-roll',
                        options: {
                            file: path.join(LOG_DIR, 'app.log'),
                            extension: 'log',
                            frequency: 'daily',
                            size: '10m',
                            dateFormat: 'yyyy-MM-dd',
                            limit: {
                                count: LOG_RETENTION_DAYS
                            },
                            encoding: 'utf8'
                        }
                    })
                })
            }

            this.logger = pino(baseOptions, pino.multistream(streams))
        }
    }

    // 获取根日志器实例
    private static getRootLogger(): Logger {
        if (!Logger.rootInstance) {
            Logger.rootInstance = new Logger()
        }
        return Logger.rootInstance
    }

    // 静态方法获取日志器
    static getLogger(moduleName?: string): Logger {
        if (!moduleName) return Logger.getRootLogger()

        // 从缓存中获取
        if (Logger.childCache.has(moduleName)) return Logger.childCache.get(moduleName)!

        // 创建新的子日志器并缓存
        const rootLogger = Logger.getRootLogger()
        const childLogger = rootLogger.child({module: moduleName})
        Logger.childCache.set(moduleName, childLogger)

        return childLogger
    }

    private static stringifyArgs(args: any[]): string {
        return args
            .map(a => {
                if (typeof a === 'string') return a
                if (a instanceof Error) return a.stack || a.message || a.toString()
                try {
                    return JSON.stringify(a)
                } catch {
                    return a.toString()
                }
            })
            .join(' ')
    }

    // 获取调用者信息
    private static getCallerLocation(): string {
        if (isProd) return ''

        const error = new Error()
        const stack = error.stack?.split('\n') || []

        for (let i = 3; i < stack.length; i++) {
            const line = stack[i].trim()
            if (!line.includes('Logger.ts') && !line.includes('node_modules')) {
                const match = line.match(/at\s+.*\((.+):(\d+):\d+\)/) || line.match(/at\s+(.+):(\d+):\d+/)
                if (match) {
                    let filePath = match[1]
                    filePath = filePath.replaceAll('\\', '/')
                    const lineNumber = match[2]
                    return `[${filePath}:${lineNumber}] `
                }
            }
        }
        return ''
    }

    info(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.info(location + Logger.stringifyArgs(args))
    }

    infoMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息
        const traceContext = TraceContext.get()
        const enrichedInfo = {
            ...traceContext,
            ...formatInfo // formatInfo 优先级更高，可以覆盖 traceContext
        }
        const deviceSN = enrichedInfo?.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }
        this.logger.info({
            msg: location + msg,
            ...enrichedInfo
        })
    }

    warn(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.warn(location + Logger.stringifyArgs(args))
    }

    warnMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息
        const traceContext = TraceContext.get()
        const enrichedInfo = {
            ...traceContext,
            ...formatInfo // formatInfo 优先级更高，可以覆盖 traceContext
        }
        const deviceSN = enrichedInfo?.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }
        this.logger.warn({
            msg: location + msg,
            ...enrichedInfo
        })
    }

    error(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.error(location + Logger.stringifyArgs(args))
    }

    errorMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息
        const traceContext = TraceContext.get()
        const enrichedInfo = {
            ...traceContext,
            ...formatInfo // formatInfo 优先级更高，可以覆盖 traceContext
        }
        const deviceSN = enrichedInfo?.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }
        if (enrichedInfo?.errorMsg) {
            const errorMsg =
                enrichedInfo.errorMsg instanceof Error ? enrichedInfo.errorMsg.message : String(enrichedInfo.errorMsg)
            // 移除 errorMsg 对象，避免 Error 对象被直接序列化为 JSON
            const { errorMsg: _, ...logInfo } = enrichedInfo
            this.logger.error({
                msg: Logger.stringifyArgs([location, msg, errorMsg]),
                ...logInfo
            })
        } else {
            this.logger.error({
                msg: location + msg,
                ...enrichedInfo
            })
        }
    }

    debug(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.debug(location + Logger.stringifyArgs(args))
    }

    debugMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息
        const traceContext = TraceContext.get()
        const enrichedInfo = {
            ...traceContext,
            ...formatInfo // formatInfo 优先级更高，可以覆盖 traceContext
        }
        const deviceSN = enrichedInfo?.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }
        this.logger.debug({
            msg: location + msg,
            ...enrichedInfo
        })
    }

    fatal(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.fatal(location + Logger.stringifyArgs(args))
    }

    trace(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.trace(location + Logger.stringifyArgs(args))
    }

    // 创建子日志器
    child(bindings: Record<string, any>): Logger {
        const childInstance = Object.create(Logger.prototype)
        childInstance.logger = this.logger.child(bindings)
        return childInstance
    }

    // 获取原始 pino 实例
    getPinoLogger(): PinoLogger {
        return this.logger
    }

    /**
     * 格式化时间统计表格
     */
    formatTimingTable(sessionInfo: SessionInfo, sessionEndTime: number, finalText: string): string {
        const lines: string[] = []

        // 计算时长统计
        const totalSessionDuration = sessionEndTime - sessionInfo.sessionStartTime
        const audioStreamDuration = (sessionInfo.firstAudioTime && sessionInfo.lastAudioTime)
            ? sessionInfo.lastAudioTime - sessionInfo.firstAudioTime
            : null
        const timeToFirstRecognition = (sessionInfo.firstRecognitionTime && sessionInfo.firstAudioTime)
            ? sessionInfo.firstRecognitionTime - sessionInfo.firstAudioTime
            : null
        const recognitionDuration = sessionInfo.firstRecognitionTime
            ? sessionEndTime - sessionInfo.firstRecognitionTime
            : null

        // 标题
        lines.push('\n' + '='.repeat(80))
        lines.push('STT session ended')
        lines.push('='.repeat(80))

        // 最终识别结果
        lines.push('最终识别结果:')
        lines.push(`  ${finalText || '(无识别结果)'}`)
        lines.push('-'.repeat(80))

        // 时间节点表格
        lines.push('时间节点:')
        lines.push(`  会话开始: ${sessionInfo.sessionStartTime}`)
        lines.push(`  用户首包: ${sessionInfo.firstAudioTime || 'N/A'}`)
        lines.push(`  用户尾包: ${sessionInfo.lastAudioTime || 'N/A'}`)
        lines.push(`  快速响应开始: ${sessionInfo.firstRecognitionTime || 'N/A'}`)
        lines.push(`  会话结束: ${sessionEndTime}`)
        lines.push('-'.repeat(80))

        // 时长统计表格
        lines.push('时长统计:')
        lines.push(`  会话总时长: ${totalSessionDuration} ms`)
        lines.push(`  音频流时长: ${audioStreamDuration !== null ? audioStreamDuration + ' ms' : 'N/A'}`)
        lines.push(`  首次识别耗时: ${timeToFirstRecognition !== null ? timeToFirstRecognition + ' ms' : 'N/A'}`)
        lines.push(`  识别处理时长: ${recognitionDuration !== null ? recognitionDuration + ' ms' : 'N/A'}`)
        lines.push('='.repeat(80))

        return lines.join('\n')
    }

}

// factory function of logger
export const getLogger = (moduleName?: string) => Logger.getLogger(moduleName || 'app')
