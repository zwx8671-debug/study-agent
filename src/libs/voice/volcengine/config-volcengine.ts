/** @format */

import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/IAgent'

export const { VOICE_API, VOICE_TTS_APP_ID, VOICE_TTS_ACCESS_TOKEN, VOICE_STT_APP_ID, VOICE_STT_ACCESS_TOKEN } = env

// TTS
export const VOICE_TTS_API = `${VOICE_API}/api/v3/tts/bidirection`
export const VOICE_TTS_FORMAT: AudioFormatEnum = AudioFormatEnum.PCM
export const VOICE_TTS_SAMPLE_RATE = 16000
// https://www.volcengine.com/docs/6561/1257544
export const VOICE_TTS_RESOURCE_ID = 'volc.service_type.10029'
export const VOLC_VOICE_TTS_DEFAULT_SPEAKER = 'zh_female_wanwanxiaohe_moon_bigtts'
export const VOICE_TTS_DEFAULT_EMOTION = ''
export const VOICE_TTS_DEFAULT_SPEECH_RATE = '0'
export const VOICE_TTS_DEFAULT_LOUDNESS_RATE = '0'

// STT
export const VOICE_STT_API = `${VOICE_API}/api/v3/sauc/bigmodel_async`
export const VOICE_STT_FORMAT: AudioFormatEnum = AudioFormatEnum.PCM
export const VOICE_STT_SAMPLE_RATE = 16000
export const VOICE_STT_LANGUAGE = 'zh-CN'
export const VOICE_STT_MODEL = 'bigmodel'
export const VOICE_STT_MODEL_VER = '400'
export const VOICE_STT_TIMEOUT = 5000 // timeout for stt start (ms)
export const VOICE_STT_RESOURCE_ID = 'volc.bigasr.sauc.duration'
