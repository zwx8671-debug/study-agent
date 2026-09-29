/** @format */

import { SpeechConfig, SpeechSynthesisOutputFormat } from 'microsoft-cognitiveservices-speech-sdk'
import { env } from '@config/env'

export const SPEECH_KEY: string = env.AZURE_TTS_KEY
export const SPEECH_REGION: string = env.AZURE_TTS_REGION
// 默认语言
export const AZURE_DEFAULT_LANGUAGE: string = 'en-US'
// 默认音色名称
export const AZURE_VOICE_TTS_DEFAULT_SPEAKER: string = 'zh-CN-XiaoxiaoMultilingualNeural'
// 默认音量
export const AZURE_DEFAULT_LOUDNESS_RATE: string = '0%'
// 默认语速
export const AZURE_DEFAULT_SPEECH_RATE: string = '0%'
// 输出音频采样率，需与 speechSynthesisOutputFormat 保持一致
export const AZURE_TTS_SAMPLE_RATE: number = 16000

// 延迟初始化 speechConfig，避免在模块加载时因为缺少环境变量而报错
let _speechConfig: SpeechConfig | null = null

export function getSpeechConfig(): SpeechConfig {
    if (!_speechConfig) {
        if (!SPEECH_KEY || !SPEECH_REGION) {
            throw new Error('Azure Speech Key or Region is not configured. Please set SPEECH_KEY and SPEECH_REGION in environment variables.')
        }
        _speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
        // riff-24khz-16bit-mono-pcm  RIFF-24kHz-16bit-单声道 PCM
        _speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
    }
    return _speechConfig
}

// 为了向后兼容，保留 speechConfig 的访问方式，但使用 getter
export const speechConfig = new Proxy({} as SpeechConfig, {
    get(target, prop) {
        const config = getSpeechConfig()
        return (config as any)[prop]
    },
    set(target, prop, value) {
        const config = getSpeechConfig()
        ;(config as any)[prop] = value
        return true
    }
})
