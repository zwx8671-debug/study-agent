/** @format */
import * as dotenv from 'dotenv'
import * as path from 'path'

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true })

// 从环境变量获取 Azure TTS 配置
const SPEECH_KEY = process.env.SPEECH_KEY || ''
const SPEECH_REGION = process.env.SPEECH_REGION || 'eastus'

if (!SPEECH_KEY) {
    console.error('请设置 SPEECH_KEY 环境变量')
    process.exit(1)
}

async function inspectVoiceInfo() {
    const { SpeechSynthesizer, SpeechConfig } = await import('microsoft-cognitiveservices-speech-sdk')

    // 创建语音配置
    const speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
    const synthesizer = new SpeechSynthesizer(speechConfig)

    try {
        // 获取中文声音列表
        console.log('获取中文声音列表...')
        const zhResult = await synthesizer.getVoicesAsync('zh-CN')

        if (zhResult.voices.length > 0) {
            const firstVoice = zhResult.voices[0]
            console.log('VoiceInfo 对象的属性:')
            console.log(Object.keys(firstVoice))
            console.log('\nVoiceInfo 对象的值:')
            console.log(firstVoice)
        }
    } catch (error) {
        console.error('检查 VoiceInfo 时出错:', error)
    } finally {
        synthesizer.close()
    }
}

inspectVoiceInfo().then(() => console.log('VoiceInfo 检查完成'))
