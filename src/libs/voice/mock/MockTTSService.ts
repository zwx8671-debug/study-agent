/** @format */

import { TTSBaseService, TTSState } from '../TTSBaseService'
import { getLogger } from '@utils/Logger'

const logger = getLogger('MockTTSService')

/**
 * Mock TTS 服务 - 策略模式实现
 * 不管输入什么文本，都对准备好的音频一个个输出
 * 模拟真实的 TTS 音频生成流程
 */
export class MockTTSService extends TTSBaseService {
    // 音频数据池（预设的音频 buffer）
    private static readonly AUDIO_BUFFERS: Buffer[] = MockTTSService.generateMockAudioBuffers()
    // WebSocket 连接状态（模拟）
    private isConnected: boolean = false
    // 当前活跃的会话
    private activeSessions: Map<string, SessionInfo> = new Map()

    constructor(uid: string, resourceId: string = 'mock-resource') {
        super(uid, resourceId)
        logger.infoMsg(`Created for user: ${uid}, resourceId: ${resourceId}`)
    }

    /**
     * 生成模拟音频数据
     * 创建一些假的音频 buffer 用于测试
     */
    private static generateMockAudioBuffers(): Buffer[] {
        const buffers: Buffer[] = []

        // 生成 10 个不同大小的音频 buffer
        for (let i = 0; i < 10; i++) {
            // 每个 buffer 大小在 1024-4096 字节之间
            const size = 1024 + Math.floor(Math.random() * 3072)
            const buffer = Buffer.alloc(size)

            // 填充一些模拟的音频数据（正弦波模式）
            for (let j = 0; j < size; j++) {
                buffer[j] = Math.floor(128 + 127 * Math.sin((j / 100) * Math.PI * 2))
            }

            buffers.push(buffer)
        }

        logger.infoMsg(`Generated ${buffers.length} mock audio buffers`)
        return buffers
    }

    /**
     * 建立连接
     */
    public async connect(resourceId?: string): Promise<void> {
        if (this.isConnected) {
            logger.infoMsg('Already connected')
            return
        }

        logger.infoMsg('Connecting...')
        this.setState(TTSState.Connecting)
        this.emit('connecting')

        // 模拟连接延迟
        await this.sleep(650)

        this.isConnected = true
        this.resourceId = resourceId || this.resourceId
        this.setState(TTSState.Connected)
        this.emit('connected', this.uid, this.resourceId)

        logger.infoMsg('Connected successfully')
    }

    /**
     * 优雅关闭连接
     */
    public async disconnect(): Promise<void> {
        logger.infoMsg('Disconnecting...')
        this.setState(TTSState.Disconnecting)
        this.emit('disconnecting')

        // 等待所有活跃会话完成
        for (const [sessionId] of this.activeSessions.entries()) {
            logger.infoMsg(`Waiting for session ${sessionId} to complete...`)
            await this.close(sessionId)
        }

        // 模拟断开延迟
        await this.sleep(100)

        this.isConnected = false
        this.setState(TTSState.Disconnected)
        this.emit('disconnected', this.uid, this.resourceId, 1000, 'Normal closure')

        logger.infoMsg('Disconnected')
    }

    /**
     * 强制中断连接
     */
    public interrupt(): void {
        logger.infoMsg('Force interrupting...')

        // 立即停止所有会话
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.intervalId) {
                clearInterval(session.intervalId)
            }
            logger.infoMsg(`Session ${sessionId} interrupted`)
        }

        this.activeSessions.clear()
        this.isConnected = false
        this.setState(TTSState.Disconnected)
        this.emit('disconnected', this.uid, this.resourceId, 1006, 'Abnormal closure')

        logger.infoMsg('Interrupted')
    }

    /**
     * 启动 TTS 会话
     */
    public async start(
        sessionId: string,
        speaker?: string,
        emotion?: string,
        language?: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _loudness_rate?: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _speech_rate?: string
    ): Promise<string> {
        if (!this.isConnected) {
            throw new Error('TTS not connected')
        }

        if (this.activeSessions.has(sessionId)) {
            logger.warn(`Session ${sessionId} already exists`)
            return sessionId
        }

        logger.infoMsg(`Starting session ${sessionId}`)
        logger.infoMsg(`Parameters: speaker=${speaker}, emotion=${emotion}, language=${language}`)

        // 创建新会话
        const session: SessionInfo = {
            sessionId,
            speaker: speaker || 'default',
            emotion: emotion || 'neutral',
            language: language || 'zh-CN',
            textQueue: [],
            isProcessing: false,
            audioIndex: 0
        }

        this.activeSessions.set(sessionId, session)
        this.setState(TTSState.Started)
        this.emit('started', sessionId, speaker || 'default')

        logger.infoMsg(`Session ${sessionId} started`)
        return sessionId
    }

    /**
     * 推送文本进行 TTS 转换
     * 注意：忽略实际文本内容，使用预设的音频数据
     */
    public async push(sessionId: string, text: string): Promise<void> {
        const session = this.activeSessions.get(sessionId)
        if (!session) {
            throw new Error(`Session ${sessionId} not found`)
        }

        logger.debug(`Session ${sessionId} received text (length: ${text.length}): "${text.substring(0, 30)}..."`)

        // 将文本加入队列（虽然我们不会真正使用它）
        session.textQueue.push(text)

        // 如果还没有开始处理，启动处理循环
        if (!session.isProcessing) {
            this.startProcessing(session)
        }
    }

    /**
     * 关闭 TTS 会话
     */
    public async close(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId)
        if (!session) {
            logger.warn(`Session ${sessionId} not found`)
            return
        }

        logger.infoMsg(`Closing session ${sessionId}`)
        this.setState(TTSState.Closing)
        this.emit('closing')

        // 等待当前处理完成
        while (session.isProcessing || session.textQueue.length > 0) {
            await this.sleep(100)
        }

        // 停止定时器
        if (session.intervalId) {
            clearInterval(session.intervalId)
        }

        // 移除会话
        this.activeSessions.delete(sessionId)
        this.setState(TTSState.Closed)
        this.emit('closed', sessionId)

        logger.infoMsg(`Session ${sessionId} closed`)
    }

    /**
     * 开始处理音频输出
     */
    private startProcessing(session: SessionInfo): void {
        session.isProcessing = true

        // 使用定时器逐个输出音频块
        session.intervalId = setInterval(() => {
            // 如果队列为空，停止处理
            if (session.textQueue.length === 0) {
                session.isProcessing = false
                if (session.intervalId) {
                    clearInterval(session.intervalId)
                    session.intervalId = undefined
                }
                return
            }

            // 取出一个文本（虽然不使用）
            session.textQueue.shift()

            // 输出预设的音频数据
            this.outputAudioChunks(session)
        }, 50) // 每 150ms 处理一次
    }

    /**
     * 输出音频块
     */
    private outputAudioChunks(session: SessionInfo): void {
        // 每次输出 3-5 个音频块
        const chunkCount = 3 + Math.floor(Math.random() * 3)

        for (let i = 0; i < chunkCount; i++) {
            // 从音频池中随机选择一个 buffer
            const audioBuffer = this.getRandomAudioBuffer()

            // 触发 data 事件
            this.emit('data', audioBuffer)

            logger.debug(
                `Session ${session.sessionId} output audio chunk ${session.audioIndex++} (size: ${audioBuffer.length} bytes)`
            )
        }
    }

    /**
     * 从音频池中随机选择一个 buffer
     */
    private getRandomAudioBuffer(): Buffer {
        const index = Math.floor(Math.random() * MockTTSService.AUDIO_BUFFERS.length)
        return MockTTSService.AUDIO_BUFFERS[index]
    }

    /**
     * 辅助方法：延迟
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

/**
 * TTS 会话信息
 */
interface SessionInfo {
    sessionId: string
    speaker: string
    emotion: string
    language: string
    textQueue: string[]
    isProcessing: boolean
    audioIndex: number
    intervalId?: NodeJS.Timeout
}
