/** @format */

import { STTHttpBaseService } from '../STTHttpBaseService'
import { getLogger } from '@utils/Logger'

const log = getLogger('MockSTTHttpService')

/**
 * Mock HTTP 一次性语音识别服务
 * 用于测试/开发环境，模拟识别延迟后随机返回预设文本，不调用任何真实 STT API。
 */
export class MockSTTHttpService extends STTHttpBaseService {
    /** 预设文本池，随机选取一条作为识别结果 */
    private static readonly TEXT_POOL: string[] = [
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

    /**
     * 模拟一次性识别：延迟 200ms 后随机返回预设文本
     * @param audio    音频 Buffer（Mock 模式下仅记录大小，不做实际解析）
     * @param language 语言代码（Mock 模式下忽略，仅记录日志）
     */
    public async recognize(audio: Buffer, language: string = 'zh-CN'): Promise<string> {
        log.info(`[Mock] 收到识别请求: language=${language}, audioSize=${audio.length} bytes`)

        // 模拟网络 + 处理延迟
        await new Promise<void>(resolve => setTimeout(resolve, 200))

        const idx = Math.floor(Math.random() * MockSTTHttpService.TEXT_POOL.length)
        const text = MockSTTHttpService.TEXT_POOL[idx]

        log.info(`[Mock] 返回识别结果: "${text}"`)
        return text
    }
}

