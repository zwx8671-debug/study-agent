/** @format */

import { STTBaseService, STTState } from '../STTBaseService'
import { AudioFormatEnum } from '@interface/IAgent'
import { getLogger } from '@utils/Logger'

const logger = getLogger('MockSTTService')

/**
 * Mock STT 服务 - 策略模式实现
 * 模拟 STT 的内存消耗和事件循环
 * 随机选择预设文本作为转译结果
 */
export class MockSTTService extends STTBaseService {
    // 预设文本池
    private static readonly TEXT_POOL = [
        '你好，我是智能助手，很高兴为您服务',
        '今天天气真不错，适合出去走走',
        '请问有什么可以帮助您的吗？',
        '我能回答各种问题，也可以和您聊天',
        '感谢您的使用，祝您生活愉快',
        '人工智能正在改变我们的生活方式',
        '学习是一个持续的过程，需要不断积累',
        '技术创新推动着社会的进步与发展',
        '保持好奇心和学习的热情很重要',
        '每一天都是新的开始，充满无限可能'
    ]

    // 模拟音频数据缓冲区（模拟内存消耗）
    private audioBuffer: Buffer[] = []
    // 累计接收的音频数据大小（字节）
    private totalAudioSize: number = 0
    // 模拟处理中标志
    private isProcessing: boolean = false

    constructor(uid: string) {
        super(uid)
        logger.infoMsg(`Created for user: ${uid}`)
    }

    /**
     * 启动 STT 会话
     */
    public async start(format?: AudioFormatEnum): Promise<STTBaseService> {
        logger.infoMsg(`Starting with format: ${format}`)
        this.setState(STTState.Starting)
        this.emit('starting')

        // 模拟连接过程
        const mockUrl = `ws://mock-stt-server.local/${this.uid}`
        this.emit('connecting', this.uid, mockUrl)

        // 模拟异步连接延迟
        await this.sleep(300)

        this.emit('connected', this.uid, mockUrl)
        this.setState(STTState.Started)
        this.emit('started')

        logger.infoMsg('Started successfully')
        return this
    }

    /**
     * 推送音频数据（模拟内存消耗）
     * @param audioData 音频 Buffer 数据
     */
    public push(audioData: Buffer): void {
        if (this.state !== STTState.Started) {
            logger.warnMsg(`Cannot push data, current state: ${this.state}`)
            return
        }

        // 模拟内存消耗：累积音频数据
        this.audioBuffer.push(audioData)
        this.totalAudioSize += audioData.length

        logger.debug(
            `Pushed audio chunk (size: ${audioData.length} bytes), ` +
                `total: ${this.audioBuffer.length} chunks, ${this.totalAudioSize} bytes`
        )

        this.emit('add')

        // 模拟事件循环中的处理
        this.simulateEventLoop()
    }

    /**
     * 关闭 STT 会话
     */
    public async close(): Promise<STTBaseService> {
        logger.infoMsg('Closing...')
        this.setState(STTState.Closing)
        this.emit('closing')

        // 等待正在处理的任务完成
        while (this.isProcessing) {
            await this.sleep(50)
        }

        // 模拟最终处理延迟
        await this.sleep(200)

        // 从文本池中随机选择一个文本作为识别结果
        const recognizedText = this.getRandomText()
        logger.infoMsg(`Recognition result: "${recognizedText}"`)

        // 发送识别结果
        this.emit('data', recognizedText)

        // 清理缓冲区
        logger.infoMsg(`Clearing buffer (${this.audioBuffer.length} chunks, ${this.totalAudioSize} bytes)`)
        this.audioBuffer = []
        this.totalAudioSize = 0

        this.setState(STTState.Closed)
        this.emit('closed')

        logger.infoMsg('Closed successfully')
        return this
    }

    /**
     * 断开连接
     */
    public disconnect(): void {
        logger.infoMsg('Disconnecting...')
        this.emit('disconnecting', this.uid)

        // 清理资源
        this.audioBuffer = []
        this.totalAudioSize = 0
        this.isProcessing = false

        this.emit('disconnected', this.uid, 1000, 'Normal closure')
        logger.infoMsg('Disconnected')
    }

    /**
     * 模拟事件循环中的处理
     * 使用 setTimeout 模拟异步处理
     */
    private simulateEventLoop(): void {
        if (this.isProcessing) {
            return // 已有处理任务在运行
        }

        this.isProcessing = true

        // 模拟事件循环中的异步处理
        setTimeout(
            () => {
                // 模拟一些音频处理工作
                const processedChunks = Math.min(3, this.audioBuffer.length)
                logger.debugMsg(`Event loop processing ${processedChunks} chunks...`)

                // 这里可以添加更复杂的模拟逻辑，如：
                // - 模拟 CPU 占用
                // - 模拟网络传输
                // - 模拟中间识别结果

                this.isProcessing = false
            },
            500 + Math.random() * 1000
        ) // 500-1500ms 随机延迟
    }

    /**
     * 从文本池中随机选择一个文本
     */
    private getRandomText(): string {
        const index = Math.floor(Math.random() * MockSTTService.TEXT_POOL.length)
        return MockSTTService.TEXT_POOL[index]
    }

    /**
     * 辅助方法：延迟
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
