/** @format */
/**
 * Socket.IO 客户端并发测试
 * 参考: https://socket.nodejs.cn/docs/v4/load-testing/
 *
 * 测试场景：
 * - 使用设备鉴权方式连接到 Agent Namespace
 * - 模拟设备发送 RTT、CHAT、DONE 事件
 * - 支持从 chat-list.json 读取对话内容
 * - 支持音频文件优先发送（如果存在对应的音频文件）
 * - 功能模块化，代码解耦
 */

import { io, Socket } from 'socket.io-client'
// 导入 msgpack 解析器（需要先安装：yarn add socket.io-msgpack-parser）
import msgpackParser from 'socket.io-msgpack-parser'
import { Audio, ChatAssistantResponse, ChatRequest, RequestEvent, ResponseEvent, ResponseFlag } from '@interface/IAgent'
import { CoCoNamespace, GlobalResponse, SocketResponse } from '@interface/ICommon'
import { AudioLoader } from './modules/AudioLoader'
import { ChatDataProvider, Mode } from './modules/ChatDataProvider'
import { StatsCollector } from './modules/StatsCollector'
import { ChatRecorder } from './modules/ChatRecorder'
import * as path from 'path'
import * as fs from 'fs'

function getZHTime() {
    return new Date().toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    })
}

// ======================== 日志管理器 ========================

/**
 * 日志管理器：同时输出到控制台和文件
 */
class LogManager {
    private logFilePath: string
    private errorFilePath: string
    private logStream: fs.WriteStream
    private errorStream: fs.WriteStream

    constructor(outputDir: string, processId?: number) {
        // 确保输出目录存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        // 生成日志文件名（带时间戳和进程ID）
        const timestamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/\s:]/g, '-')
        const processTag = processId ? `-process${processId}` : ''
        this.logFilePath = path.join(outputDir, `load-test-${timestamp}${processTag}.log`)
        this.errorFilePath = path.join(outputDir, `load-test-${timestamp}${processTag}.error.log`)

        // 创建写入流
        this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' })
        this.errorStream = fs.createWriteStream(this.errorFilePath, { flags: 'a' })

        console.log(`日志文件: ${this.logFilePath}`)
        console.log(`错误日志文件: ${this.errorFilePath}`)
    }

    /**
     * 记录普通日志
     */
    log(...args: any[]) {
        const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')

        // 输出到控制台
        console.log(...args)

        // 写入文件
        this.logStream.write(message + '\n')
    }

    /**
     * 记录错误日志
     */
    error(...args: any[]) {
        const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')

        // 输出到控制台
        console.error(...args)

        // 写入普通日志文件
        this.logStream.write(message + '\n')

        // 写入错误日志文件
        this.errorStream.write(message + '\n')
    }

    /**
     * 关闭日志流
     */
    close() {
        return new Promise<void>(resolve => {
            let closedCount = 0
            const checkClose = () => {
                closedCount++
                if (closedCount === 2) {
                    resolve()
                }
            }

            this.logStream.end(checkClose)
            this.errorStream.end(checkClose)
        })
    }
}

// ======================== 配置参数 ========================

// 从命令行参数获取配置
// 用法: tsx socket-load-test.ts <起始客户端ID> <客户端数量> [进程ID]
// 例如: tsx socket-load-test.ts 1 500 1
//      tsx socket-load-test.ts 501 500 2
const args = process.argv.slice(2)
const START_CLIENT_ID = args[0] ? parseInt(args[0]) : 1
const CLIENTS_PER_PROCESS = args[1] ? parseInt(args[1]) : 500
const PROCESS_ID = args[2] ? parseInt(args[2]) : 1

// 服务器地址
const SERVER_URL = 'ws://192.168.10.193:3000/coco-cloud-ts'

// 并发客户端数量
const NUMBER_OF_CLIENTS = CLIENTS_PER_PROCESS

// RTT 发送间隔（毫秒）
const RTT_INTERVAL_IN_MS = 3000

// 每个客户端的 CHAT 轮次
const CHAT_ROUNDS = 1

// 模拟设备 SN 前缀
const DEVICE_SN_PREFIX = 'YC'

// 音频文件目录
const AUDIO_DIR = 'D:/Users/AA/Music/文本声音PCM'

// 对话列表文件路径
const CHAT_LIST_PATH = path.join(AUDIO_DIR, 'chat-list.json')

// 是否优先使用音频
const USE_AUDIO = true

// 对话选择模式：sequential（顺序）或 random（随机）
const CHAT_MODE = Mode.sequential

// 是否启用聊天记录保存
const ENABLE_CHAT_RECORDING = true

// 聊天记录输出目录
const CHAT_LOG_DIR = 'D:\\project\\ts\\coco-cloud-ts\\logs\\chat-logs'

// 文件保存模式：'per-client' 或 'single'
const CHAT_LOG_MODE: 'per-client' | 'single' = 'per-client'

// 测试日志输出目录
const TEST_LOG_DIR = 'D:\\project\\ts\\coco-cloud-ts\\logs\\test-logs'

// Excel 报告输出目录
const EXCEL_REPORT_DIR = 'D:\\project\\ts\\coco-cloud-ts\\logs\\test-reports'

// 全局超时时间（毫秒），防止测试永远不结束
// 计算公式：(CHAT_ROUNDS * 平均每轮时间 + RTT_INTERVAL * 轮次) * 客户端数 + 缓冲时间
const GLOBAL_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟

// ======================== Socket 客户端类 ========================

/**
 * Socket.IO 客户端封装类
 */
class SocketClient {
    private socket: Socket | null = null
    private deviceSN: string
    private serverUrl: string

    constructor(deviceSN: string, serverUrl: string) {
        this.deviceSN = deviceSN
        this.serverUrl = serverUrl
    }

    /**
     * 连接到服务器
     */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const url = this.serverUrl + CoCoNamespace.Agent + `?device=${this.deviceSN}`
                this.socket = io(url, {
                    auth: {
                        'device-sn': this.deviceSN,
                        'device-sign': 'cocowa',
                        'sign-timestamp': Date.now().toString()
                    },
                    transports: ['websocket'],
                    path: '/coco-cloud-ts/socket.io',
                    // 使用 msgpack 解析器：直接传输二进制数据，避免 base64 编解码
                    parser: msgpackParser,
                    reconnection: false
                })

                // 连接成功后 resolve
                this.socket.on('connect', () => {
                    resolve()
                })

                // 连接错误
                this.socket.on('connect_error', (error: Error) => {
                    reject(error)
                })
            } catch (error) {
                reject(error)
            }
        })
    }

    /**
     * 监听事件
     */
    on(event: string, handler: (...args: any[]) => void) {
        if (this.socket) {
            this.socket.on(event, handler)
        }
    }

    /**
     * 发送事件
     */
    emit(event: string, data: any, ack?: (response: any) => void) {
        if (this.socket && this.socket.connected) {
            if (ack) {
                this.socket.emit(event, data, ack)
            } else {
                this.socket.emit(event, data)
            }
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect()
            this.socket = null
        }
    }

    /**
     * 检查是否连接
     */
    isConnected(): boolean {
        return this.socket !== null && this.socket.connected
    }
}

// ======================== 负载测试客户端类 ========================

/**
 * 负载测试客户端类
 */
class LoadTestClient {
    clientId: number
    private deviceSN: string
    private socketClient: SocketClient
    private chatProvider: ChatDataProvider
    private audioLoader: AudioLoader
    statsCollector: StatsCollector
    private chatRecorder: ChatRecorder
    private logManager: LogManager
    private rttInterval: NodeJS.Timeout | null = null
    private currentRound = 0

    constructor(
        clientId: number,
        socketClient: SocketClient,
        chatProvider: ChatDataProvider,
        audioLoader: AudioLoader,
        statsCollector: StatsCollector,
        chatRecorder: ChatRecorder,
        logManager: LogManager
    ) {
        this.clientId = clientId
        this.deviceSN = getDeviceSN(clientId)
        this.socketClient = socketClient
        this.chatProvider = chatProvider
        this.audioLoader = audioLoader
        this.statsCollector = statsCollector
        this.chatRecorder = chatRecorder
        this.logManager = logManager

        // 初始化统计
        this.statsCollector.initClientStats(clientId, this.deviceSN)
    }

    /**
     * 运行测试
     */
    async run(): Promise<void> {
        try {
            // 连接服务器
            await this.socketClient.connect()
            this.statsCollector.recordConnect(this.clientId)
            this.log('已连接到服务器')

            // 设置事件监听器
            this.setupEventListeners()

            // 开始测试
            this.startTesting()
        } catch (error: any) {
            this.statsCollector.recordError(this.clientId)
            this.log('连接失败:', error.message)
            throw error
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        // 连接响应
        this.socketClient.on(ResponseEvent.CONNECT, (data: any) => {
            this.log('收到连接响应:', data)
        })

        // 加入房间响应
        this.socketClient.on(ResponseEvent.JOIN, (data: any) => {
            this.log('收到加入房间响应', data)

            // 发送 DONE 请求，第一轮防止 busy
            this.socketClient.emit(RequestEvent.DONE, { device: this.deviceSN, interrupt: true, idx: -1 }, () => {
                // 发送第一轮 CHAT（后续轮次由 DONE 响应触发）
                this.currentRound = 1
                this.sendChatRequest()
            })
        })

        // CHAT 响应
        this.socketClient.on(ResponseEvent.CHAT, async (data: SocketResponse<ChatAssistantResponse>) => {
            try {
                if (data.code === 200) {
                    // 传递 traceId 用于延迟计算
                    const traceId = data && data.data ? data.data.id : undefined
                    this.statsCollector.recordChatResponse(this.clientId, traceId)

                    // 拼接文本
                    if (data && data.data) {
                        if (data.data.text) {
                            this.chatRecorder.addResponseFragment(data.data.id, data.data.text)
                        }

                        // 结束时保存到文件并发送 DONE
                        if (data.data.flag === ResponseFlag.END) {
                            await this.chatRecorder.finalizeRecord(data.data.id, data.data.flag)
                            this.log(`💾 聊天记录已保存 [TraceId: ${data.data.id}]`)

                            // 立即发送 DONE
                            this.sendDoneRequest()
                        }
                    }
                } else {
                    this.logErr('chat聊天异常：', data)
                    this.statsCollector.recordError(this.clientId)

                    // 异常情况也保存聊天记录
                    if (data && data.data && data.data.id) {
                        await this.chatRecorder.finalizeRecord(
                            data.data.id,
                            data.data.flag,
                            `响应异常: code=${data.code}, message=${data.msg || '未知错误'}`
                        )
                        this.log(`💾 异常聊天记录已保存 [TraceId: ${data.data.id}]`)
                    }

                    // 立即发送 DONE
                    this.sendDoneRequest()
                }
            } catch (e: any) {
                this.logErr('CHAT响应处理异常：', e)
                this.statsCollector.recordError(this.clientId)

                // 捕获异常时也尝试保存聊天记录
                if (data && data.data && data.data.id) {
                    try {
                        await this.chatRecorder.finalizeRecord(
                            data.data.id,
                            data.data.flag,
                            `处理异常: ${e.message || String(e)}`
                        )
                        this.log(`💾 异常聊天记录已保存 [TraceId: ${data.data.id}]`)
                    } catch (saveError: any) {
                        this.logErr('保存异常聊天记录失败：', saveError.message)
                    }
                }

                // 立即发送 DONE
                this.sendDoneRequest()
            }
        })

        this.socketClient.on(ResponseEvent.CHAT_AUDIO, async () => {
            this.statsCollector.recordChatAudioResponse(this.clientId)
        })

        // 错误事件
        this.socketClient.on(GlobalResponse.ERROR, (error: Error) => {
            this.statsCollector.recordError(this.clientId)
            this.log('错误:', error.message)
        })

        // 断开事件
        this.socketClient.on('disconnect', (reason: string) => {
            this.statsCollector.recordDisconnect(this.clientId)
            if (reason === 'io client disconnect') {
                this.log('已断开连接, 原因:', reason)
            } else {
                this.logErr('已断开连接, 原因:', reason)
            }
            // 清理资源，确保定时器被清除
            this.cleanup()
        })
    }

    /**
     * 开始测试
     */
    private startTesting() {
        // 启动 RTT 心跳
        this.rttInterval = setInterval(() => {
            if (this.socketClient.isConnected()) {
                this.socketClient.emit(RequestEvent.RTT, {}, () => {
                    this.statsCollector.recordRTT(this.clientId)
                })
            }
        }, RTT_INTERVAL_IN_MS)
    }

    /**
     * 发送 CHAT 请求
     */
    private async sendChatRequest() {
        try {
            // 获取下一条对话
            const chat = this.chatProvider.getNextChat()
            if (!chat) {
                this.log('没有可用的对话数据')
                return
            }

            const traceId = `trace_${this.deviceSN}_${this.currentRound}_${Date.now()}`
            let audio: Audio | undefined = undefined
            let hasAudio = false

            // 如果启用音频且存在对应的音频文件，加载音频
            if (USE_AUDIO && this.audioLoader.audioExists(chat.text)) {
                const loadedAudio = await this.audioLoader.loadAudio(chat.text, traceId)
                if (loadedAudio) {
                    audio = loadedAudio
                    hasAudio = true
                }
            }

            // 构建 CHAT 请求
            const chatRequest: ChatRequest = {
                traceId,
                end: true,
                text: chat.text,
                state: []
            }

            // 如果有音频，添加到请求中，且去除文本内容
            if (audio) {
                chatRequest.audio = audio
                chatRequest.text = ''
            }

            // 记录请求到 ChatRecorder
            this.chatRecorder.recordRequest(
                traceId,
                this.clientId,
                this.deviceSN,
                chat.text,
                hasAudio,
                this.currentRound
            )

            // 发送 CHAT 事件
            this.socketClient.emit(RequestEvent.CHAT, chatRequest)
            this.statsCollector.recordChat(this.clientId, hasAudio, traceId)

            const audioTag = hasAudio ? '🔊音频' : '📝文本'
            this.log(`${traceId} 发送 CHAT [${this.currentRound}/${CHAT_ROUNDS}] ${audioTag}: ${chat.text}`)
        } catch (error: any) {
            this.statsCollector.recordError(this.clientId)
            this.logErr('${traceId} 发送 CHAT 失败:', error.message)
        }
    }

    /**
     * 发送 DONE 请求
     */
    private sendDoneRequest() {
        if (!this.socketClient.isConnected()) {
            return
        }

        const doneRequest = {
            device: this.deviceSN,
            interrupt: false,
            reason: `完成第 ${this.currentRound} 轮`,
            idx: 888
        }

        this.socketClient.emit(RequestEvent.DONE, doneRequest, (response: any) => {
            // DONE 响应
            this.statsCollector.recordDoneResponse(this.clientId)
            this.log(`DONE ACK [${this.currentRound}/${CHAT_ROUNDS}]`, response)

            // DONE 确认后，发送下一轮 CHAT
            if (this.currentRound < CHAT_ROUNDS) {
                this.currentRound++
                setTimeout(() => {
                    this.sendChatRequest()
                }, 1000)
            } else {
                // 所有轮次完成，清理资源
                this.cleanup()
            }
        })

        this.statsCollector.recordDone(this.clientId)
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 添加幂等性保护，避免重复清理
        if (this.rttInterval === null && !this.socketClient.isConnected()) {
            return
        }

        this.log(`完成测试，准备清理资源`)

        // 清理定时器
        if (this.rttInterval) {
            clearInterval(this.rttInterval)
            this.rttInterval = null
        }

        // 断开连接
        if (this.socketClient.isConnected()) {
            this.socketClient.disconnect()
        }
    }

    /**
     * 日志输出
     */
    private log(...args: any[]) {
        this.logManager.log(`[${getZHTime()}] [客户端 ${this.clientId}] [${this.deviceSN}]`, ...args)
    }
    private logErr(...args: any[]) {
        this.logManager.error(`[${getZHTime()}] [客户端 ${this.clientId}] [${this.deviceSN}]`, ...args)
    }
}

// ======================== 主函数 ========================

function getDeviceSN(clientId: number) {
    // clientId 已经是正确的数字，直接用于生成设备序列号
    return `${DEVICE_SN_PREFIX}${clientId.toString().padStart(4, '0')}`
}

async function main() {
    // 初始化日志管理器
    const logManager = new LogManager(TEST_LOG_DIR, PROCESS_ID)

    {
        logManager.log('========================================')
        logManager.log(`[${getZHTime()}] Socket.IO 客户端并发负载测试（事件驱动模式）`)
        logManager.log('========================================')
        logManager.log(`进程 ID: ${PROCESS_ID}`)
        logManager.log(`起始客户端 ID: ${START_CLIENT_ID}`)
        logManager.log(`结束客户端 ID: ${START_CLIENT_ID + NUMBER_OF_CLIENTS - 1}`)
        logManager.log(`服务器地址: ${SERVER_URL}`)
        logManager.log(`命名空间: ${CoCoNamespace.Agent}`)
        logManager.log(`并发客户端数: ${NUMBER_OF_CLIENTS}`)
        logManager.log(`RTT 间隔: ${RTT_INTERVAL_IN_MS}ms`)
        logManager.log(`每客户端轮次: ${CHAT_ROUNDS}`)
        logManager.log(`设备 SN 前缀: ${DEVICE_SN_PREFIX}`)
        logManager.log(`音频目录: ${AUDIO_DIR}`)
        logManager.log(`对话列表: ${CHAT_LIST_PATH}`)
        logManager.log(`音频优先: ${USE_AUDIO ? '是' : '否'}`)
        logManager.log(`对话模式: ${CHAT_MODE}`)
        logManager.log(`流程模式: CHAT → END → DONE → 下一轮 CHAT（事件驱动）`)
        logManager.log('========================================\n')
    }

    try {
        // 初始化对话数据提供者
        logManager.log(`[${getZHTime()}] 正在加载对话数据...`)
        const chatProvider = new ChatDataProvider({
            chatListPath: CHAT_LIST_PATH,
            mode: CHAT_MODE
        })
        await chatProvider.loadChatList()

        // 初始化音频加载器
        const audioLoader = new AudioLoader({
            audioDir: AUDIO_DIR
        })

        // 初始化统计收集器
        const statsCollector = new StatsCollector(NUMBER_OF_CLIENTS, EXCEL_REPORT_DIR, PROCESS_ID)

        // 初始化聊天记录器
        const chatRecorder = new ChatRecorder({
            outputDir: CHAT_LOG_DIR,
            enabled: ENABLE_CHAT_RECORDING,
            mode: CHAT_LOG_MODE
        })

        logManager.log(`聊天记录保存: ${ENABLE_CHAT_RECORDING ? '启用' : '禁用'}`)
        if (ENABLE_CHAT_RECORDING) {
            logManager.log(`记录保存目录: ${chatRecorder.getOutputDir()}`)
            logManager.log(`保存模式: ${CHAT_LOG_MODE === 'per-client' ? '按客户端分文件' : '单一文件'}`)
        }

        // 创建测试客户端
        const clients: LoadTestClient[] = []
        for (let i = 0; i < NUMBER_OF_CLIENTS; i++) {
            // clientId 与设备序列号的数字部分保持一致
            const clientId = START_CLIENT_ID + i
            const deviceSN = getDeviceSN(clientId)
            const socketClient = new SocketClient(deviceSN, SERVER_URL)

            const client = new LoadTestClient(
                clientId,
                socketClient,
                chatProvider,
                audioLoader,
                statsCollector,
                chatRecorder,
                logManager
            )

            clients.push(client)
        }

        // 连接所有客户端
        logManager.log(`\n[${getZHTime()}] 正在连接 ${NUMBER_OF_CLIENTS} 个客户端...\n`)

        const connectionPromises = clients.map((client, index) => {
            // 错开连接时间，避免同时连接造成压力
            return new Promise(resolve => {
                setTimeout(() => {
                    client
                        .run()
                        .then(() => resolve(true))
                        .catch(error => {
                            logManager.error(`客户端 ${index + 1} 启动失败:`, error.message)
                            client.statsCollector.recordDisconnect(client.clientId)
                            resolve(false)
                        })
                }, index * 100) // 每个客户端间隔 100ms
            })
        })

        await Promise.all(connectionPromises)

        const connectedCount = statsCollector.getGlobalStats().connectedClients
        logManager.log(`\n[${getZHTime()}] 已完成连接尝试，成功连接: ${connectedCount} 个客户端\n`)

        // 定期输出统计信息
        statsCollector.startPeriodicStats(10000)

        // 全局超时保护
        const globalTimeout = setTimeout(() => {
            logManager.error('\n========================================')
            logManager.error(`[${getZHTime()}] ⚠️ 全局超时！测试已运行 ${GLOBAL_TIMEOUT_MS / 1000 / 60} 分钟`)
            logManager.error('强制结束测试并生成报告...')
            logManager.error('========================================\n')

            // 清理检查定时器
            if (checkCompletion) {
                clearInterval(checkCompletion)
            }

            // 停止统计
            statsCollector.stopPeriodicStats()

            // 打印最终统计
            statsCollector.printFinalStats()

            // 清理音频缓存
            audioLoader.clearCache()

            // 强制清理所有客户端
            clients.forEach(client => {
                try {
                    client.cleanup()
                } catch (e) {
                    // 忽略清理错误
                }
            })

            // 关闭日志流并退出
            logManager.close().then(() => {
                setTimeout(() => {
                    process.exit(1)
                }, 1000)
            })
        }, GLOBAL_TIMEOUT_MS)

        // 监听所有客户端完成
        const checkCompletion = setInterval(() => {
            if (statsCollector.isAllClientsComplete()) {
                // 清理超时定时器
                clearTimeout(globalTimeout)
                clearInterval(checkCompletion)
                statsCollector.stopPeriodicStats()

                logManager.log('\n========================================')
                logManager.log(`[${getZHTime()}] ✅ 所有客户端已完成测试`)
                logManager.log('========================================\n')
                statsCollector.printFinalStats()

                // 清理音频缓存
                audioLoader.clearCache()

                // 关闭日志流并等待完成后退出
                logManager.close().then(() => {
                    setTimeout(() => {
                        process.exit(0)
                    }, 1000)
                })
            }
        }, 1000)
    } catch (error: any) {
        console.error('测试初始化失败:', error.message)
        process.exit(1)
    }
}

// ======================== 启动测试 ========================

// 处理未捕获的异常
process.on('uncaughtException', error => {
    console.error('未捕获的异常:', error)
    process.exit(1)
})

process.on('unhandledRejection', reason => {
    console.error('未处理的 Promise 拒绝:', reason)
    process.exit(1)
})

// 启动测试
main().catch(error => {
    console.error('测试启动失败:', error)
    process.exit(1)
})
