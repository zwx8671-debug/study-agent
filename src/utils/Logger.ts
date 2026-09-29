/** @format */

import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino'
import { logConfig } from '@config/log.config'
import { formatInTimeZone } from 'date-fns-tz'
import $ from '@utils/util'
import { traceContext } from '@utils/TraceContext'

const isProd = process.env.NODE_ENV === 'production'

interface FormatInfo {
    errorMsg?: any
    [key: string]: any
}

export class Logger {
    private logger: PinoLogger
    private static childCache = new Map<string, Logger>()
    private static rootInstance: Logger | null = null

    public constructor(moduleName?: string) {
        const baseOptions: LoggerOptions = {
            level: logConfig.LOG_LEVEL,
            formatters: {
                level: label => ({ level: label })
            },
            timestamp: () => {
                const shanghaiTz = 'Asia/Shanghai'
                const timeStr = formatInTimeZone(new Date(), shanghaiTz, 'yyyy-MM-dd HH:mm:ss.SSS')
                return `,"time":"${timeStr}"` // 注意：pino 要求时间戳格式为 ,key:value 形式
            },
            ...(moduleName && { base: { module: moduleName } })
        }

        // 根据 LOG_TARGET 配置决定日志输出目标
        if (logConfig.LOG_TARGET === 'stdout') {
            // 输出到 stdout（适合容器部署）
            if (isProd) {
                // 生产环境：JSON 格式输出到 stdout
                this.logger = pino(baseOptions)
            } else {
                // 开发环境：Pretty 格式输出到 stdout
                this.logger = pino(
                    baseOptions,
                    pino.transport({
                        target: 'pino-pretty',
                        options: {
                            ...logConfig.LOG_PRETTY_OPTIONS,
                            encoding: 'utf8'
                        }
                    })
                )
            }
        } else {
            // 输出到文件（传统方式）
            if (isProd) {
                // 生产环境：仅使用 pino-roll 文件日志（JSON 格式，高性能）
                this.logger = pino(
                    baseOptions,
                    pino.transport({
                        level: logConfig.LOG_LEVEL,
                        target: 'pino-roll',
                        options: {
                            ...logConfig.LOG_ROLL_OPTIONS,
                            encoding: 'utf8'
                        }
                    })
                )
            } else {
                // 开发环境：使用 multistream 同时输出到控制台（pretty）和文件
                const streams = [
                    {
                        level: logConfig.LOG_LEVEL,
                        stream: pino.transport({
                            target: 'pino-pretty',
                            options: {
                                ...logConfig.LOG_PRETTY_OPTIONS,
                                encoding: 'utf8'
                            }
                        })
                    },
                    {
                        level: logConfig.LOG_LEVEL,
                        stream: pino.transport({
                            target: 'pino-roll',
                            options: {
                                ...logConfig.LOG_ROLL_OPTIONS,
                                encoding: 'utf8'
                            }
                        })
                    }
                ]

                this.logger = pino(baseOptions, pino.multistream(streams))
            }
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
        const childLogger = rootLogger.child({ module: moduleName })
        Logger.childCache.set(moduleName, childLogger)

        return childLogger
    }

    // 清理缓存（用于测试或特殊场景）
    static clearLogger(): void {
        Logger.childCache.clear()
        Logger.rootInstance = null
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

        // 跳过前面的调用栈：Error, getCaller info/warn/error等方法
        for (let i = 3; i < stack.length; i++) {
            const line = stack[i].trim()
            // 跳过 Logger.ts 自身和 node_modules
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
        // 自动从 TraceContext 获取上下文信息，并与传入的 formatInfo 合并
        const contextInfo = traceContext.getFormatInfo()
        const enhancedFormatInfo = { ...contextInfo, ...formatInfo }

        // 如果提供了 deviceSN，将其添加到消息开头以提高可见性
        const deviceSN = enhancedFormatInfo.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }

        this.logger.info({
            msg: location + msg,
            ...enhancedFormatInfo
        })
    }

    warn(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.warn(location + Logger.stringifyArgs(args))
    }

    warnMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息，并与传入的 formatInfo 合并
        const contextInfo = traceContext.getFormatInfo()
        const enhancedFormatInfo = { ...contextInfo, ...formatInfo }

        // 如果提供了 deviceSN，将其添加到消息开头以提高可见性
        const deviceSN = enhancedFormatInfo.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }

        this.logger.warn({
            msg: location + msg,
            ...enhancedFormatInfo
        })
    }

    error(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.error(location + Logger.stringifyArgs(args))
    }

    errorMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息，并与传入的 formatInfo 合并
        const contextInfo = traceContext.getFormatInfo()
        const enhancedFormatInfo = { ...contextInfo, ...formatInfo }

        // 如果提供了 deviceSN，将其添加到消息开头以提高可见性
        const deviceSN = enhancedFormatInfo.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }
        const error = formatInfo?.errorMsg
        if (error) {
            this.logger.error(error)
        }

        if (enhancedFormatInfo.errorMsg) {
            if (enhancedFormatInfo.errorMsg instanceof Error) {
                enhancedFormatInfo.errorMsg = enhancedFormatInfo.errorMsg.message
            } else {
                enhancedFormatInfo.errorMsg = $.toString(enhancedFormatInfo.errorMsg)
            }
        }

        this.logger.error({
            msg: location + msg,
            ...enhancedFormatInfo
        })
    }

    debug(...args: any[]): void {
        const location = Logger.getCallerLocation()
        this.logger.debug(location + Logger.stringifyArgs(args))
    }

    debugMsg(msg: string, formatInfo?: FormatInfo): void {
        const location = Logger.getCallerLocation()
        // 自动从 TraceContext 获取上下文信息，并与传入的 formatInfo 合并
        const contextInfo = traceContext.getFormatInfo()
        const enhancedFormatInfo = { ...contextInfo, ...formatInfo }

        // 如果提供了 deviceSN，将其添加到消息开头以提高可见性
        const deviceSN = enhancedFormatInfo.deviceSN
        if (deviceSN) {
            msg = `[Device: ${deviceSN}] ${msg}`
        }

        this.logger.debug({
            msg: location + msg,
            ...enhancedFormatInfo
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
}

// factory function of logger
export const getLogger = (moduleName?: string) => Logger.getLogger(moduleName || 'app')
