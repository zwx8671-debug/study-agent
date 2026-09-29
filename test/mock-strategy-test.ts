/** @format */

/**
 * Mock 策略模式测试
 * 测试 STT、LLM、TTS 的 Mock 实现
 */

import { MockSTTService } from '../src/libs/voice/mock/MockSTTService'
import { MockLLMService } from '../src/libs/voice/mock/MockLLMService'
import { MockTTSService } from '../src/libs/voice/mock/MockTTSService'
import { AudioFormatEnum } from '../src/interfaces/IAgent'

/**
 * 测试 MockSTTService
 */
async function testMockSTT() {
    console.log('\n========== 测试 MockSTTService ==========')

    const stt = new MockSTTService('test-device-001')

    // 监听事件
    stt.on('starting', () => console.log('✓ Event: starting'))
    stt.on('connecting', (uid, url) => console.log(`✓ Event: connecting to ${url}`))
    stt.on('connected', (uid, url) => console.log(`✓ Event: connected to ${url}`))
    stt.on('started', () => console.log('✓ Event: started'))
    stt.on('data', text => console.log(`✓ Event: data received - "${text}"`))
    stt.on('closing', () => console.log('✓ Event: closing'))
    stt.on('closed', () => console.log('✓ Event: closed'))
    stt.on('disconnected', (uid, code, reason) => console.log(`✓ Event: disconnected (${code}: ${reason})`))

    try {
        // 启动 STT
        await stt.start(AudioFormatEnum.PCM)

        // 模拟推送多个音频块
        for (let i = 0; i < 5; i++) {
            const mockAudioData = Buffer.from(`mock-audio-data-${i}`)
            stt.push(mockAudioData)
            await sleep(100)
        }

        // 关闭 STT（会输出识别结果）
        await stt.close()

        // 断开连接
        stt.disconnect()

        console.log('✓ MockSTT 测试完成')
    } catch (error) {
        console.error('✗ MockSTT 测试失败:', error)
    }
}

/**
 * 测试 MockLLMService
 */
async function testMockLLM() {
    console.log('\n========== 测试 MockLLMService ==========')

    try {
        const stream = await MockLLMService.chat()
        let fullText = ''
        let chunkCount = 0

        stream.on('data', (chunk: Buffer) => {
            const char = chunk.toString()
            fullText += char
            chunkCount++

            // 每 50 个字符输出一次
            if (chunkCount % 50 === 0) {
                console.log(`✓ Received ${chunkCount} characters...`)
            }
        })

        stream.on('end', () => {
            console.log(`✓ Stream ended`)
            console.log(`✓ Total characters: ${fullText.length}`)
            console.log(`✓ Preview: ${fullText.substring(0, 100)}...`)
            console.log('✓ MockLLM 测试完成')
        })

        stream.on('error', error => {
            console.error('✗ MockLLM 测试失败:', error)
        })
    } catch (error) {
        console.error('✗ MockLLM 测试失败:', error)
    }
}

/**
 * 测试 MockTTSService
 */
async function testMockTTS() {
    console.log('\n========== 测试 MockTTSService ==========')

    const tts = new MockTTSService('test-device-001', 'test-resource-001')

    // 监听事件
    tts.on('connecting', () => console.log('✓ Event: connecting'))
    tts.on('connected', (uid, resourceId) => console.log(`✓ Event: connected (uid: ${uid}, resourceId: ${resourceId})`))
    tts.on('started', (sessionId, speaker) =>
        console.log(`✓ Event: started (session: ${sessionId}, speaker: ${speaker})`)
    )
    tts.on('data', buffer => console.log(`✓ Event: data (${buffer.length} bytes)`))
    tts.on('closed', sessionId => console.log(`✓ Event: closed (session: ${sessionId})`))
    tts.on('disconnected', (uid, resourceId, code, reason) => console.log(`✓ Event: disconnected (${code}: ${reason})`))
    tts.on('addSentence', () => console.log('✓ Event: addSentence'))

    try {
        // 连接
        await tts.connect()

        // 启动会话
        const sessionId = 'test-session-001'
        await tts.start(sessionId, 'test-speaker', 'happy', 'zh-CN')

        // 推送多个文本（模拟 LLM 输出）
        const texts = [
            '这是第一段测试文本。',
            '这是第二段测试文本，会被转换为音频。',
            '最后一段文本，测试音频输出功能。'
        ]

        for (const text of texts) {
            await tts.push(sessionId, text)
            await sleep(200)
        }

        // 等待音频输出完成
        await sleep(1000)

        // 关闭会话
        await tts.close(sessionId)

        // 断开连接
        await tts.disconnect()

        console.log('✓ MockTTS 测试完成')
    } catch (error) {
        console.error('✗ MockTTS 测试失败:', error)
    }
}

/**
 * 集成测试：模拟完整的 STT -> LLM -> TTS 流程
 */
async function testIntegratedFlow() {
    console.log('\n========== 集成测试：STT -> LLM -> TTS ==========')

    try {
        // 1. STT 阶段
        console.log('\n--- 阶段 1: STT 音频转文本 ---')
        const stt = new MockSTTService('test-device-002')
        let sttResult = ''

        stt.on('data', text => {
            sttResult = text
        })

        await stt.start(AudioFormatEnum.PCM)
        stt.push(Buffer.from('mock-audio'))
        await stt.close()
        stt.disconnect()

        console.log(`✓ STT 结果: "${sttResult}"`)

        // 2. LLM 阶段
        console.log('\n--- 阶段 2: LLM 生成回复 ---')
        const llmStream = await MockLLMService.chat()
        let llmResult = ''

        await new Promise<void>((resolve, reject) => {
            llmStream.on('data', (chunk: Buffer) => {
                llmResult += chunk.toString()
            })
            llmStream.on('end', () => {
                console.log(`✓ LLM 输出字符数: ${llmResult.length}`)
                resolve()
            })
            llmStream.on('error', reject)
        })

        // 3. TTS 阶段
        console.log('\n--- 阶段 3: TTS 文本转音频 ---')
        const tts = new MockTTSService('test-device-002')
        let audioChunkCount = 0

        tts.on('data', () => {
            audioChunkCount++
        })

        await tts.connect()
        const sessionId = 'integrated-test-session'
        await tts.start(sessionId)

        // 将 LLM 的输出作为 TTS 的输入（分段）
        const sentences = llmResult.match(/[^。！？]+[。！？]/g) || [llmResult]
        for (const sentence of sentences.slice(0, 3)) {
            await tts.push(sessionId, sentence)
            await sleep(100)
        }

        await sleep(1000)
        await tts.close(sessionId)
        await tts.disconnect()

        console.log(`✓ TTS 输出音频块数: ${audioChunkCount}`)
        console.log('\n✓ 集成测试完成')
    } catch (error) {
        console.error('✗ 集成测试失败:', error)
    }
}

/**
 * 辅助函数：延迟
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 主测试函数
 */
async function main() {
    console.log('开始 Mock 策略模式测试...\n')

    try {
        // 单独测试每个 Mock 服务
        await testMockSTT()
        await sleep(500)

        await testMockLLM()
        await sleep(2000) // LLM 需要更长时间完成

        await testMockTTS()
        await sleep(500)

        // 集成测试
        await testIntegratedFlow()

        console.log('\n========================================')
        console.log('✓ 所有测试完成！')
        console.log('========================================\n')

        console.log('提示：在 .env.local 中设置以下环境变量可以启用 Mock 模式：')
        console.log('  STT_SERVICE_TYPE=mock')
        console.log('  TTS_SERVICE_TYPE=mock')
        console.log('  USE_MOCK_LLM=true')
    } catch (error) {
        console.error('\n✗ 测试失败:', error)
        process.exit(1)
    }
}

// 运行测试
main().catch(console.error)
