/** @format */

import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/IAgent'

export const { VOICE_API, VOICE_TTS_APP_ID, VOICE_TTS_ACCESS_TOKEN } = env

// TTS
export const VOICE_TTS_API = `${VOICE_API}/api/v3/tts/bidirection`
export const VOICE_TTS_FORMAT: AudioFormatEnum = AudioFormatEnum.PCM
export const VOICE_TTS_SAMPLE_RATE = 16000
// https://www.volcengine.com/docs/6561/1257544
export const VOICE_TTS_RESOURCE_ID = env.VOICE_TTS_RESOURCE_ID
export const VOLC_VOICE_TTS_DEFAULT_SPEAKER = 'zh_female_wanwanxiaohe_moon_bigtts'
export const VOICE_TTS_DEFAULT_EMOTION = ''
export const VOICE_TTS_DEFAULT_SPEECH_RATE = '0'
export const VOICE_TTS_DEFAULT_LOUDNESS_RATE = '0'

