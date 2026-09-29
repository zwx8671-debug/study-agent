/** @format */

import {io, Socket} from 'socket.io-client'
import * as fs from 'fs'
import * as path from 'path'
import MsgpackParser from "socket.io-msgpack-parser";
import {AudioFormatEnum, ClientToServerEvents, ServerToClientEvents, STTEventData, STTResponse} from "@interface/ISTT";
import {getLogger} from "@utils/Logger";

/**
 * Socket.IO STT 测试客户端
 */
class STTSocketClient {

    private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
    private serverUrl: string
    private sessionId: string
    private deviceSN: string
    private traceId: string
    private recognitionResults: { text: string; timestamp: number }[] = []

    constructor(serverUrl: string) {
        this.serverUrl = serverUrl
        this.sessionId = this.generateId()
        this.deviceSN = 'TEST-DEVICE-001'
        this.traceId = this.generateId()
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * 连接到Socket.IO服务器
     */
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`\n🔌 正在连接到服务器: ${this.serverUrl}`)

            this.socket = io(this.serverUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                parser: MsgpackParser
            })

            // 连接成功
            this.socket.on('connect', () => {
                console.log(`✅ 已连接到服务器，Socket ID: ${this.socket?.id}`)
                resolve()
            })

            // 连接错误
            this.socket.on('connect_error', (error) => {
                console.error(`❌ 连接错误: ${error.message}`)
                reject(error)
            })

            // 断开连接
            this.socket.on('disconnect', (reason) => {
                console.log(`🔌 已断开连接: ${reason}`)
            })

            // 设置超时
            setTimeout(() => {
                if (!this.socket?.connected) {
                    reject(new Error('连接超时'))
                }
            }, 10000)
        })
    }

    /**
     * 注册事件监听器
     */
    private registerEventListeners() {
        if (!this.socket) {
            throw new Error('Socket 未初始化')
        }

        // STT 启动成功
        this.socket.on('stt:started', (response: STTResponse) => {
            console.log('✅ STT 会话已启动:', response)
        })

        // STT 识别数据
        this.socket.on('stt:data', (data: STTEventData) => {
            // 存储识别结果
            this.recognitionResults.push({
                text: data.text,
                timestamp: Date.now()
            })

            console.log(`📝 识别结果: "${data.text}"`)
        })

        // STT 结束
        this.socket.on('stt:ended', (response) => {
            console.log('✅ STT 会话已结束:', response)
            // 🎯 新功能：打印最终识别文本
            if (response.text) {
                console.log('📝 最终识别文本:', response.text)
            }
        })

        // STT 错误
        this.socket.on('stt:error', (response) => {
            console.error('❌ STT 错误:', response)
        })
    }

    /**
     * 启动STT会话
     */
    public async startSTT(): Promise<void> {
        if (!this.socket?.connected) {
            throw new Error('Socket 未连接')
        }

        this.registerEventListeners()

        console.log(`\n🎤 启动 STT 会话...`)
        console.log(`   - Session ID: ${this.sessionId}`)
        console.log(`   - Device SN: ${this.deviceSN}`)
        console.log(`   - Trace ID: ${this.traceId}`)

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('启动 STT 超时'))
            }, 10000)

            this.socket!.once('stt:started', (response) => {
                clearTimeout(timeout)
                if (response.success) {
                    resolve()
                } else {
                    reject(new Error(response.error))
                }
            })

            this.socket!.once('stt:error', (response) => {
                clearTimeout(timeout)
                reject(new Error(response.error))
            })

            this.socket!.emit('stt:start', {
                deviceSN: this.deviceSN,
                sessionId: this.sessionId,
                traceId: this.traceId,
                format: AudioFormatEnum.PCM
            })
        })
    }

    /**
     * 发送音频数据
     */
    public sendAudio(data: Buffer, format: AudioFormatEnum): void {
        if (!this.socket?.connected) {
            throw new Error('Socket 未连接')
        }

        this.socket.emit('stt:audio', {
            deviceSN: this.deviceSN,
            sessionId: this.sessionId,
            format,
            audio: [data],
            traceId: this.traceId
        })
    }

    /**
     * 从文件发送音频
     */
    public async sendAudioFromFile(
        filePath: string,
        chunkSize: number = 3200,
        interval: number = 500
    ): Promise<void> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`音频文件不存在: ${filePath}`)
        }

        console.log(`\n🎵 开始发送音频文件: ${path.basename(filePath)}`)
        console.log(`   - 完整路径: ${filePath}`)
        console.log(`   - 块大小: ${chunkSize} 字节`)
        console.log(`   - 发送间隔: ${interval} 毫秒`)

        const audioBuffer = fs.readFileSync(filePath)
        const ext = path.extname(filePath).toLowerCase().replace('.', '')
        const format = ['pcm', 'wav', 'mp3', 'opus'].includes(ext) ? ext : 'pcm'

        console.log(`   - 音频格式: ${format}`)
        console.log(`   - 文件大小: ${audioBuffer.length} 字节`)
        console.log(`   - 预计发送时长: ${((audioBuffer.length / chunkSize) * interval / 1000).toFixed(1)} 秒`)

        let offset = 0
        let chunkIndex = 0
        const startTime = Date.now()

        return new Promise((resolve, reject) => {
            const sendChunk = () => {
                try {
                    if (offset >= audioBuffer.length) {
                        const elapsed = Date.now() - startTime
                        console.log(`✅ 音频发送完成`)
                        console.log(`   - 共发送: ${chunkIndex} 个块`)
                        console.log(`   - 耗时: ${(elapsed / 1000).toFixed(2)} 秒`)
                        console.log(`   - 平均速率: ${(audioBuffer.length / 1024 / (elapsed / 1000)).toFixed(2)} KB/s`)
                        resolve()
                        return
                    }

                    const end = Math.min(offset + chunkSize, audioBuffer.length)
                    const chunk = audioBuffer.slice(offset, end)

                    this.sendAudio(chunk, format as AudioFormatEnum)

                    chunkIndex++
                    if (chunkIndex % 10 === 0) {
                        const progress = ((offset / audioBuffer.length) * 100).toFixed(1)
                        console.log(`   📤 已发送: ${chunkIndex} 块 (${progress}%)`)
                    }

                    offset = end
                    setTimeout(sendChunk, interval)
                } catch (error) {
                    reject(error)
                }
            }

            sendChunk()
        })
    }

    /**
     * 结束STT会话
     */
    public async endSTT(): Promise<void> {
        if (!this.socket?.connected) {
            throw new Error('Socket 未连接')
        }

        console.log(`\n🛑 结束 STT 会话...`)

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('结束 STT 超时'))
            }, 10000)

            this.socket!.once('stt:ended', (response) => {
                clearTimeout(timeout)
                if (response.success) {
                    resolve()
                } else {
                    reject(new Error(response.error))
                }
            })

            this.socket!.once('stt:error', (response) => {
                clearTimeout(timeout)
                reject(new Error(response.error))
            })

            this.socket!.emit('stt:end', {
                deviceSN: this.deviceSN,
                sessionId: this.sessionId,
                traceId: this.traceId
            })
        })
    }

    /**
     * 断开连接
     */
    public disconnect(): void {
        if (this.socket) {
            console.log('\n🔌 断开连接...')
            this.socket.disconnect()
            this.socket = null
        }
    }


    /**
     * 打印识别结果统计
     */
    public printRecognitionSummary(): void {
        console.log('\n📊 识别结果统计:')
        console.log(`   - 总识别次数: ${this.recognitionResults.length}`)

        if (this.recognitionResults.length > 0) {
            console.log('\n🎯 识别文本:')
            this.recognitionResults.forEach((result, index) => {
                console.log(`   ${index + 1}. ${result.text}`)
            })

            const fullText = this.recognitionResults.map(r => r.text).join(' ')
            console.log(`\n📝 完整文本: "${fullText}"`)
        }
    }
}

/**
 * 测试单个音频文件
 */
async function testSingleFile(serverUrl: string, audioFile: string): Promise<void> {
    console.log('========================================')
    console.log('   Socket.IO STT 单文件测试')
    console.log('========================================')

    const client = new STTSocketClient(serverUrl)

    try {
        // 1. 连接到服务器
        await client.connect()
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 2. 启动STT会话
        await client.startSTT()
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 3. 发送音频文件
        await client.sendAudioFromFile(audioFile)

        // 4. 等待识别结果
        await new Promise((resolve) => setTimeout(resolve, 4000))
        console.log('等待了三秒... ')

        // 5. 结束STT会话
        await client.endSTT()
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 6. 打印识别结果统计
        client.printRecognitionSummary()

        // 7. 断开连接
        client.disconnect()

        console.log('\n========================================')
        console.log('   ✅ 测试完成')
        console.log('========================================\n')
    } catch (error) {
        console.error('\n❌ 测试失败:', error)
        client.disconnect()
        throw error
    }
}

/**
 * 测试目录中的所有音频文件（复用 testSingleFile）
 */
async function testDirectory(serverUrl: string, dirPath: string): Promise<void> {
    console.log('========================================')
    console.log('   Socket.IO STT 批量测试')
    console.log('========================================')
    console.log(`\n📁 扫描目录: ${dirPath}\n`)

    if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`)
    }

    // 获取所有音频文件
    const files = fs.readdirSync(dirPath)
        .filter(file => {
            const ext = path.extname(file).toLowerCase()
            return ['.pcm', '.wav', '.mp3', '.opus'].includes(ext)
        })
        .map(file => path.join(dirPath, file))

    if (files.length === 0) {
        console.log('⚠️  未找到音频文件')
        return
    }

    console.log(`📋 找到 ${files.length} 个音频文件:\n`)
    files.forEach((file, index) => {
        const size = fs.statSync(file).size
        console.log(`   ${index + 1}. ${path.basename(file)} (${(size / 1024).toFixed(2)} KB)`)
    })

    const testResults: {
        file: string
        success: boolean
        error?: string
    }[] = []

    // 逐个测试（复用 testSingleFile）
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`\n${'='.repeat(60)}`)
        console.log(`   测试 ${i + 1}/${files.length}: ${path.basename(file)}`)
        console.log('='.repeat(60))

        try {
            // 🎯 直接复用 testSingleFile
            await testSingleFile(serverUrl, file)

            testResults.push({
                file: path.basename(file),
                success: true
            })

            // 间隔一下再测试下一个
            if (i < files.length - 1) {
                console.log('\n⏱️  等待 2 秒后继续下一个测试...')
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        } catch (error) {
            console.error(`\n❌ 测试失败:`, error)
            testResults.push({
                file: path.basename(file),
                success: false,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    // 打印测试总结
    console.log('\n\n')
    console.log('='.repeat(80))
    console.log('   📊 批量测试总结')
    console.log('='.repeat(80))

    const successCount = testResults.filter(r => r.success).length
    const failCount = testResults.filter(r => !r.success).length

    console.log(`\n✅ 成功: ${successCount}/${testResults.length}`)
    console.log(`❌ 失败: ${failCount}/${testResults.length}`)

    console.log('\n📝 详细结果:\n')
    testResults.forEach((result, index) => {
        const status = result.success ? '✅' : '❌'
        console.log(`${status} ${index + 1}. ${result.file}`)
        if (!result.success && result.error) {
            console.log(`   错误: ${result.error}`)
        }
    })

    console.log('='.repeat(80))
    console.log('\n')
}

/**
 * 主测试函数
 */
async function main() {
    const args = process.argv.slice(2)

    // 解析命令行参数
    let serverUrl = 'http://192.168.10.193:4000'
    let audioPath = ''
    let mode = 'file' // 'file', 'dir'

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--server' || arg === '-s') {
            serverUrl = args[++i] || serverUrl
        } else if (arg === '--file' || arg === '-f') {
            audioPath = args[++i] || ''
            mode = 'file'
        } else if (arg === '--dir' || arg === '-d') {
            audioPath = args[++i] || ''
            mode = 'dir'
        } else if (arg === '--simulate') {
            mode = 'simulate'
        } else if (!audioPath && arg && !arg.startsWith('-')) {
            // 如果没有指定选项，第一个参数默认为文件或目录
            audioPath = arg
        }
    }

    // 默认测试路径
    if (!audioPath) {
        audioPath = 'D:\\Users\\AA\\Music\\文本声音PCM\\帮我讲个笑话.pcm'
    }

    try {
        if (mode === 'dir') {
            // 批量测试目录
            await testDirectory(serverUrl, audioPath)
        } else if (mode === 'file') {
            // 测试单个文件
            await testSingleFile(serverUrl, audioPath)
        } else {
            console.log('\n========================================')
            console.log('   ✅ 测试完成')
            console.log('========================================\n')
        }

        process.exit(0)
    } catch (error) {
        console.error('\n❌ 测试失败:', error)
        process.exit(1)
    }
}

// 如果直接运行此文件，执行主测试函数
if (require.main === module) {
    main().catch((error) => {
        console.error('未捕获的错误:', error)
        process.exit(1)
    })
}

// 导出客户端类供其他模块使用
export {STTSocketClient}
