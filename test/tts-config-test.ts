/** @format */

import {
    getAllVoices,
    getEmotionsForVoiceName,
    getEmotionsForVoiceType,
    getVoiceByName,
    getVoiceTypeByName,
    validateEmotionForVoiceName,
    validateEmotionForVoiceType
} from '@utils/VolcTTSConfigManager'

// 测试所有功能
function runTests() {
    console.log('开始测试TTS配置管理功能...\n')

    // 测试1: 获取所有语音数据
    console.log('测试1: 获取所有语音数据')
    const allVoices = getAllVoices()
    console.log(`总共加载了 ${allVoices.length} 个语音配置\n`)

    // 测试2: 根据语音名称查找语音类型
    console.log('测试2: 根据语音名称查找语音类型')
    const voiceName = '冷酷哥哥'
    const voiceType = getVoiceTypeByName(voiceName)
    console.log(`语音名称 "${voiceName}" 对应的语音类型: ${voiceType}\n`)

    // 测试3: 根据语音名称查找语音数据
    console.log('测试3: 根据语音名称查找语音数据')
    const voiceData = getVoiceByName(voiceName)
    if (voiceData) {
        console.log(`语音名称 "${voiceName}" 的详细信息:`)
        console.log(`  - 语音类型: ${voiceData.voice_type}`)
        console.log(`  - 语言: ${voiceData.language}`)
        console.log(`  - 支持的情感: ${voiceData.emotion.join(', ')}\n`)
    }

    // 测试4: 验证语音类型是否支持指定情感
    console.log('测试4: 验证语音类型是否支持指定情感')
    const emotion1 = 'happy'
    const isValid1 = validateEmotionForVoiceType(voiceType || '', emotion1)
    console.log(`语音类型 "${voiceType}" 是否支持情感 "${emotion1}": ${isValid1}`)

    const emotion2 = 'unknown_emotion'
    const isValid2 = validateEmotionForVoiceType(voiceType || '', emotion2)
    console.log(`语音类型 "${voiceType}" 是否支持情感 "${emotion2}": ${isValid2}\n`)

    // 测试5: 验证语音名称是否支持指定情感
    console.log('测试5: 验证语音名称是否支持指定情感')
    const isValid3 = validateEmotionForVoiceName(voiceName, emotion1)
    console.log(`语音名称 "${voiceName}" 是否支持情感 "${emotion1}": ${isValid3}\n`)

    // 测试6: 获取语音类型支持的所有情感
    console.log('测试6: 获取语音类型支持的所有情感')
    const emotions1 = getEmotionsForVoiceType(voiceType || '')
    console.log(`语音类型 "${voiceType}" 支持的所有情感: ${emotions1.join(', ')}\n`)

    // 测试7: 获取语音名称支持的所有情感
    console.log('测试7: 获取语音名称支持的所有情感')
    const emotions2 = getEmotionsForVoiceName(voiceName)
    console.log(`语音名称 "${voiceName}" 支持的所有情感: ${emotions2.join(', ')}\n`)

    // 测试8: 测试不存在的语音
    console.log('测试8: 测试不存在的语音')
    const nonExistentVoice = '不存在的语音'
    const nonExistentType = getVoiceTypeByName(nonExistentVoice)
    console.log(`不存在的语音名称 "${nonExistentVoice}" 对应的语音类型: ${nonExistentType}`)
    const isValid4 = validateEmotionForVoiceName(nonExistentVoice, 'happy')
    console.log(`不存在的语音名称 "${nonExistentVoice}" 是否支持情感 "happy": ${isValid4}\n`)

    console.log('所有测试完成!')
}

// 运行测试
runTests()
