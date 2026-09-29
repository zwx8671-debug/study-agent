/** @format */


import path from 'path'
import {existsSync, mkdirSync} from 'fs'
import {PrettyOptions} from 'pino-pretty'

const LOG_DIR = path.join(process.cwd(), 'logs')

// 日志输出目标配置：stdout（标准输出，适合容器）或 file（文件）
const LOG_TARGET = process.env.LOG_TARGET || 'stdout'
console.log('LOG_TARGET:', LOG_TARGET)

// 仅在需要文件输出时创建日志目录
if (LOG_TARGET === 'file' && !existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, {recursive: true})
}

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
console.log('LOG_LEVEL:', LOG_LEVEL)

/**
 * 日志轮转配置选项
 *
 * 配置应用日志文件的轮转策略，包括文件路径、轮转频率、文件大小限制等参数
 */
const LOG_ROLL_OPTIONS = {
    file: path.join(LOG_DIR, 'coco-tts.log'),
    extension: 'log',
    frequency: 'daily',
    size: '10m',
    dateFormat: 'yyyy-MM-dd',
    limit: {
        count: 30
    }
}

// for pino-pretty
const LOG_PRETTY_OPTIONS: PrettyOptions = {
    colorize: true,
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', // local time with milliseconds
    ignore: 'pid,hostname,module',
    singleLine: true,
    messageFormat: '{module} - {msg}',
    sync: false // 异步输出，避免阻塞
}

// export all configs
export const logConfig = {
    LOG_DIR,
    LOG_TARGET,
    LOG_LEVEL,
    LOG_ROLL_OPTIONS,
    LOG_PRETTY_OPTIONS
}
