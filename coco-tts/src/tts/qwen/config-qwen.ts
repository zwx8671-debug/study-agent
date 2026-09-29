/** @format */

import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/IAgent'

export const QWEN_TTS_API_KEY = env.QWEN_API_KEY
export const QWEN_TTS_WORKSPACE_ID = env.QWEN_WORKSPACE_ID
export const QWEN_TTS_WS_URL = env.QWEN_TTS_WS_URL
export const QWEN_TTS_MODEL = env.QWEN_TTS_MODEL || 'qwen-audio-3.0-tts-flash'
export const QWEN_TTS_DEFAULT_SPEAKER = env.QWEN_TTS_DEFAULT_SPEAKER || 'longanhuan_v3.6'
export const QWEN_TTS_FORMAT = AudioFormatEnum.PCM
export const QWEN_TTS_SAMPLE_RATE = env.QWEN_TTS_SAMPLE_RATE
export const QWEN_TTS_VOLUME = env.QWEN_TTS_VOLUME
export const QWEN_TTS_RATE = env.QWEN_TTS_RATE
export const QWEN_TTS_PITCH = env.QWEN_TTS_PITCH
