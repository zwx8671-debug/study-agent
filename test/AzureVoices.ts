/** @format */
import { SpeechConfig, SpeechSynthesizer } from 'microsoft-cognitiveservices-speech-sdk'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { AZURE_DEFAULT_LANGUAGE } from '../src/libs/voice/azure/config-azure'

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

// 创建语音配置
const speechConfig: SpeechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)

// 定义音色数据类型
interface VoiceData {
    voice_name: string
    voice_type: string
    language: string
    emotion: string[]
}

async function testAzureTTS() {
    const synthesizer: SpeechSynthesizer = new SpeechSynthesizer(speechConfig)

    try {
        // 获取中文声音列表
        console.log('获取中文声音列表...')
        const zhResult = await synthesizer.getVoicesAsync('zh-CN')
        console.log('中文声音数量:', zhResult.voices.length)

        // 显示前几个中文声音
        console.log('\n前5个中文声音:')
        zhResult.voices.slice(0, 5).forEach((voice, index) => {
            console.log(`${index + 1}. 名称: ${voice.name}`)
            console.log(`   本地化名称: ${voice.localName}`)
            console.log(`   简介: ${voice.localeName}`)
            console.log(`   性别: ${voice.gender === 1 ? 'Female' : voice.gender === 2 ? 'Male' : 'Unknown'}`)
            console.log(`   地区: ${voice.locale}`)
            console.log(`   样式数量: ${voice.styleList?.length || 0}`)
            if (voice.styleList && voice.styleList.length > 0) {
                console.log(`   样式: ${voice.styleList.join(', ')}`)
            }
            console.log('---')
        })

        // 获取英文声音列表
        console.log('\n获取英文声音列表...')
        const enResult = await synthesizer.getVoicesAsync(AZURE_DEFAULT_LANGUAGE)
        console.log('英文声音数量:', enResult.voices.length)

        // 显示前几个英文声音
        console.log('\n前5个英文声音:')
        enResult.voices.slice(0, 5).forEach((voice, index) => {
            console.log(`${index + 1}. 名称: ${voice.name}`)
            console.log(`   本地化名称: ${voice.localName}`)
            console.log(`   简介: ${voice.localeName}`)
            console.log(`   性别: ${voice.gender === 1 ? 'Female' : voice.gender === 2 ? 'Male' : 'Unknown'}`)
            console.log(`   地区: ${voice.locale}`)
            console.log(`   样式数量: ${voice.styleList?.length || 0}`)
            if (voice.styleList && voice.styleList.length > 0) {
                console.log(`   样式: ${voice.styleList.join(', ')}`)
            }
            console.log('---')
        })

        // 生成 JSON 格式的音色配置
        console.log('\n生成音色配置JSON...')
        generateVoiceConfigJSON(zhResult.voices, enResult.voices)
    } catch (error) {
        console.error('获取声音列表时出错:', error)
    } finally {
        synthesizer.close()
    }
}

function generateVoiceConfigJSON(chineseVoices: any[], englishVoices: any[]) {
    const voiceData: VoiceData[] = []

    // 处理中文音色
    chineseVoices.forEach(voice => {
        // 提取情绪/样式
        const emotions = voice.styleList && voice.styleList.length > 0 ? voice.styleList : ['neutral'] // 默认情绪

        voiceData.push({
            voice_name: voice.localName,
            voice_type: voice.name,
            language: '中文',
            emotion: emotions
        })
    })

    // 处理英文音色
    englishVoices.forEach(voice => {
        // 提取情绪/样式
        const emotions = voice.styleList && voice.styleList.length > 0 ? voice.styleList : ['neutral'] // 默认情绪

        voiceData.push({
            voice_name: voice.localName,
            voice_type: voice.name,
            language: '英文',
            emotion: emotions
        })
    })

    const config = {
        voice_data: voiceData
    }

    console.log('\nAzure TTS 音色配置 (JSON格式):')
    console.log(JSON.stringify(config, null, 2))

    // 保存到文件
    const fs = require('fs')
    fs.writeFileSync(path.resolve(__dirname, '../assets/azure_tts.json'), JSON.stringify(config, null, 2), 'utf-8')
    console.log('\n配置已保存到: assets/azure_tts.json')
}

testAzureTTS().then(() => console.log('Azure TTS test completed'))
