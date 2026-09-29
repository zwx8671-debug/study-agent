/** @format */

import { TTSFactory, TTSServiceType } from '../src/libs/voice/TTSFactory'

async function testTTSFactory() {
    console.log('Testing TTS Factory...')

    // 测试创建火山TTS服务
    console.log('Creating Volcengine TTS service...')
    const volcengineTTS = TTSFactory.createTTS(TTSServiceType.Volcengine, 'test-device-001')
    console.log('Volcengine TTS service created successfully')
    console.log('Service type:', volcengineTTS.constructor.name)
    console.log('Initial state:', volcengineTTS.getState())

    // 测试创建Azure TTS服务
    console.log('\nCreating Azure TTS service...')
    const azureTTS = TTSFactory.createTTS(TTSServiceType.Azure, 'test-device-002')
    console.log('Azure TTS service created successfully')
    console.log('Service type:', azureTTS.constructor.name)
    console.log('Initial state:', azureTTS.getState())

    // 测试事件监听
    volcengineTTS.on('created', () => {
        console.log('Volcengine TTS created event fired')
    })

    azureTTS.on('created', () => {
        console.log('Azure TTS created event fired')
    })

    console.log('\nTest completed!')
}

// 运行测试
testTTSFactory().catch(console.error)
