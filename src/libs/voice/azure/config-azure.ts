/** @format */

import { SpeechConfig, SpeechSynthesisOutputFormat } from 'microsoft-cognitiveservices-speech-sdk'
import { env } from '@config/env'

export const SPEECH_KEY: string = env.SPEECH_KEY
export const SPEECH_REGION: string = env.SPEECH_REGION
// 默认语言
export const AZURE_DEFAULT_LANGUAGE: string = 'en-US'
// 默认音色名称
export const AZURE_VOICE_TTS_DEFAULT_SPEAKER: string = 'zh-CN-XiaoxiaoMultilingualNeural'
// 默认音量
export const AZURE_DEFAULT_LOUDNESS_RATE: string = '0%'
// 默认语速
export const AZURE_DEFAULT_SPEECH_RATE: string = '0%'

export const speechConfig: SpeechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
// riff-24khz-16bit-mono-pcm  RIFF-24kHz-16bit-单声道 PCM
speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
