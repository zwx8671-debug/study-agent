/** @format */

import { io, Socket } from 'socket.io-client'
import MsgpackParser from 'socket.io-msgpack-parser'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import {
    ClientToServerEvents,
    ServerToClientEvents,
    TTSConnectResponse,
    TTSDataResponse,
    TTSDisconnectResponse,
    TTSEndResponse,
    TTSErrorResponse,
    TTSStartResponse
} from '@interface/ITTSSocket'
import { convertPcmToWavBuffer } from '@utils/pcmToWav'

const SERVER_URL = process.env.TTS_SERVER_URL || 'http://127.0.0.1:3002'
const OUTPUT_DIR = path.resolve(process.cwd(), 'test/output')

/**
 * 单个会话的合成结果
 */
interface SessionResult {
    sessionId: string
    /** 音频块数量 */
    chunks: number
    /** 音频总字节数 */
    size: number
    /** 采样率 */
    sampleRate: number
    /** 音频格式 */
    format: string
    /** 首次 push 到首个音频包的延迟（毫秒） */
    firstAudioLatency: number | null
    /** 从首次 push 到 tts:end 的总耗时（毫秒） */
    totalCost: number
    /** 落盘的 WAV 路径 */
    wavPath?: string
    /** 服务端回报的音频块数量 */
    serverChunks: number
}

/**
 * Socket.IO TTS 测试客户端
 *
 * 模拟主工程的调用方式：一条连接上串行开启多个会话，
 * 每个会话把文本一小段一小段地增量 push（等价于 LLM 流式输出），音频分块流式返回。
 */
export class TTSSocketClient {
    private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
    private readonly serverUrl: string
    private readonly deviceSN: string
    private readonly traceId: string

    /** 当前会话收到的音频块 */
    private audioChunks: Buffer[] = []
    private currentSessionId = ''
    private firstPushTime = 0
    private firstAudioTime = 0
    private audioMeta = { format: 'pcm', sampleRate: 16000 }
    private lastError: string | null = null

    constructor(serverUrl: string, deviceSN = 'TEST-TTS-DEVICE-001') {
        this.serverUrl = serverUrl
        this.deviceSN = deviceSN
        this.traceId = randomUUID()
    }

    /**
     * 建立 Socket.IO 连接
     */
    public connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`\n🔌 正在连接 TTS 服务: ${this.serverUrl}`)

            this.socket = io(this.serverUrl, {
                transports: ['websocket'],
                reconnection: false,
                parser: MsgpackParser,
                timeout: 10000
            })

            this.socket.on('connect', () => {
                console.log(`✅ Socket 已连接，Socket ID: ${this.socket?.id}`)
                this.registerEventListeners()
                resolve()
            })

            this.socket.on('connect_error', error => {
                console.error(`❌ 连接错误: ${error.message}`)
                reject(error)
            })

            this.socket.on('disconnect', reason => {
                console.log(`🔌 Socket 已断开: ${reason}`)
            })

            setTimeout(() => {
                if (!this.socket?.connected) reject(new Error('连接超时'))
            }, 10000)
        })
    }

    private registerEventListeners() {
        const socket = this.socket!

        socket.on('tts:data', (res: TTSDataResponse) => {
            if (!this.firstAudioTime) {
                this.firstAudioTime = Date.now()
            }
            // msgpack 反序列化后可能是 Uint8Array，统一转成 Buffer
            const buffer = Buffer.isBuffer(res.buffer) ? res.buffer : Buffer.from(res.buffer as unknown as Uint8Array)
            this.audioChunks.push(buffer)
            this.audioMeta = { format: res.format, sampleRate: res.sampleRate }

            if (res.index === 0) {
                console.log(
                    `🔊 收到首个音频包: index=${res.index}, flag=${res.flag}, size=${buffer.length}, ` +
                        `${res.format}@${res.sampleRate}Hz`
                )
            }
        })

        socket.on('tts:error', (res: TTSErrorResponse) => {
            this.lastError = res.error
            console.error(`❌ 服务端错误: ${res.error}`)
        })

        socket.on('tts:disconnected', (res: TTSDisconnectResponse) => {
            console.log(`🔌 上游 TTS 已断开: code=${res.code}, reason=${res.reason}`)
        })
    }

    /**
     * 建立上游 TTS 连接
     */
    public connectTTS(): Promise<TTSConnectResponse> {
        return this.request<TTSConnectResponse>(
            'tts:connected',
            () => this.socket!.emit('tts:connect', { deviceSN: this.deviceSN, traceId: this.traceId }),
            15000
        )
    }

    /**
     * 跑一个完整会话：start → 增量 push → close
     *
     * @param textChunks 文本分片，逐片推送以模拟 LLM 流式输出
     * @param pushIntervalMs 每片之间的间隔，模拟 LLM 出字速度
     * @param speaker 音色
     */
    public async runSession(textChunks: string[], pushIntervalMs = 60, speaker?: string): Promise<SessionResult> {
        const sessionId = randomUUID()
        this.currentSessionId = sessionId
        this.audioChunks = []
        this.firstPushTime = 0
        this.firstAudioTime = 0
        this.lastError = null

        const fullText = textChunks.join('')
        console.log(`\n▶️  开启会话 ${sessionId}`)
        console.log(`   文本(${fullText.length}字，分${textChunks.length}片): ${fullText}`)

        const started = await this.request<TTSStartResponse>(
            'tts:started',
            () => this.socket!.emit('tts:start', { sessionId, speaker, traceId: this.traceId }),
            15000
        )
        if (!started.success) {
            throw new Error(`会话启动失败: ${started.error}`)
        }
        console.log(`   会话已启动，音色: ${started.speaker}`)

        // 增量推送文本：这是"流式文本输入"的核心验证点
        for (const [index, chunk] of textChunks.entries()) {
            if (!this.firstPushTime) this.firstPushTime = Date.now()
            this.socket!.emit('tts:push', { sessionId, text: chunk, traceId: this.traceId })
            console.log(`   ⌨️  push[${index}] ${JSON.stringify(chunk)}`)
            if (pushIntervalMs > 0) await sleep(pushIntervalMs)
        }

        const end = await this.request<TTSEndResponse>(
            'tts:end',
            () => this.socket!.emit('tts:close', { sessionId, traceId: this.traceId }),
            60000
        )
        if (!end.success) {
            throw new Error(`会话关闭失败: ${end.error}`)
        }
        if (this.lastError) {
            throw new Error(`会话过程中出现错误: ${this.lastError}`)
        }

        const audio = Buffer.concat(this.audioChunks)
        const result: SessionResult = {
            sessionId,
            chunks: this.audioChunks.length,
            size: audio.length,
            sampleRate: this.audioMeta.sampleRate,
            format: this.audioMeta.format,
            firstAudioLatency: this.firstAudioTime ? this.firstAudioTime - this.firstPushTime : null,
            totalCost: Date.now() - this.firstPushTime,
            serverChunks: end.index
        }

        if (audio.length > 0) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true })
            const wavPath = path.join(OUTPUT_DIR, `${sessionId}.wav`)
            fs.writeFileSync(wavPath, convertPcmToWavBuffer(audio, result.sampleRate))
            result.wavPath = wavPath
        }

        this.currentSessionId = ''
        return result
    }

    /**
     * 断开上游 TTS 连接并关闭 Socket
     */
    public async close(): Promise<void> {
        if (!this.socket) return

        if (this.socket.connected) {
            this.socket.emit('tts:disconnect', { traceId: this.traceId })
            // 给服务端一点时间优雅释放上游连接
            await sleep(500)
        }
        this.socket.removeAllListeners()
        this.socket.disconnect()
        this.socket = null
    }

    /**
     * 发一个请求并等待指定响应事件
     */
    private request<T>(event: keyof ServerToClientEvents, send: () => void, timeoutMs: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const socket = this.socket
            if (!socket?.connected) {
                reject(new Error('Socket 未连接'))
                return
            }

            const onError = (res: TTSErrorResponse) => {
                cleanup()
                reject(new Error(res.error))
            }
            const onResponse = (res: any) => {
                cleanup()
                resolve(res as T)
            }
            const cleanup = () => {
                clearTimeout(timer)
                socket.off(event as any, onResponse)
                socket.off('tts:error', onError)
            }
            const timer = setTimeout(() => {
                cleanup()
                reject(new Error(`等待 ${String(event)} 超时(${timeoutMs}ms)`))
            }, timeoutMs)

            socket.once(event as any, onResponse)
            socket.once('tts:error', onError)
            send()
        })
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function printResult(title: string, result: SessionResult) {
    console.log(`\n${'='.repeat(72)}`)
    console.log(`✅ ${title}`)
    console.log(`${'-'.repeat(72)}`)
    console.log(`  会话ID        : ${result.sessionId}`)
    console.log(`  音频格式      : ${result.format} @ ${result.sampleRate}Hz`)
    console.log(`  音频块数      : ${result.chunks}（服务端计数 ${result.serverChunks}）`)
    console.log(`  音频大小      : ${result.size} bytes ≈ ${(result.size / (result.sampleRate * 2)).toFixed(2)} 秒`)
    console.log(`  首包延迟      : ${result.firstAudioLatency !== null ? result.firstAudioLatency + ' ms' : 'N/A'}`)
    console.log(`  总耗时        : ${result.totalCost} ms`)
    console.log(`  WAV 文件      : ${result.wavPath || '(无音频)'}`)
    console.log(`${'='.repeat(72)}`)
}

async function main() {
    const client = new TTSSocketClient(SERVER_URL)

    try {
        await client.connectSocket()

        const connected = await client.connectTTS()
        if (!connected.success) {
            throw new Error(`上游 TTS 连接失败: ${connected.error}`)
        }
        console.log(
            `✅ 上游 TTS 已连接: resourceId=${connected.resourceId}, ` +
                `音频=${connected.format}@${connected.sampleRate}Hz`
        )

        // 会话1：模拟 LLM 逐词流式输出
        const result1 = await client.runSession(
            ['你好，', '我是', '可可台灯。', '今天', '天气', '很好，', '适合', '出去', '散步。'],
            60
        )
        printResult('会话1（流式文本输入）完成', result1)
        assert(result1.size > 0, '会话1 未收到任何音频')
        assert(result1.chunks > 1, '会话1 音频未分块返回，可能不是流式')
        assert(result1.chunks === result1.serverChunks, '客户端与服务端音频块数量不一致')

        // 会话2：同一条连接上串行开启第二个会话，验证连接复用
        const result2 = await client.runSession(['第二个会话，', '用于验证', '同一条连接可以', '复用。'], 40)
        printResult('会话2（连接复用）完成', result2)
        assert(result2.size > 0, '会话2 未收到任何音频')

        console.log('\n🎉 全部断言通过：TTS 独立进程支持流式文本输入 + 流式音频输出，且连接可复用\n')
    } finally {
        await client.close()
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`断言失败: ${message}`)
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(`\n❌ 测试失败: ${error instanceof Error ? error.message : error}\n`)
            process.exit(1)
        })
}
