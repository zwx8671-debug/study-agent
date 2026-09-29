/** @format */

import { env } from '@config/env'
import { AudioFormatEnum } from '@interface/ISTT'

export const {
    VOICE_API,
    VOICE_STT_APP_ID,
    VOICE_STT_ACCESS_TOKEN,
    VOICE_STT_API_KEY
} = env

/** v3 极速版 X-Api-Resource-Id，文档固定值 volc.bigasr.auc_turbo */
export const VOICE_STT_FILE_RESOURCE_ID = env.VOICE_STT_FILE_RESOURCE_ID || 'volc.bigasr.auc_turbo'

/** flash 请求体 user.uid */
export const VOICE_STT_FILE_USER_UID = env.VOICE_STT_USER_UID || 'coco-stt'

// ==================== 流式 STT（WebSocket 大模型）====================
export const VOICE_STT_API = `${VOICE_API}/api/v3/sauc/bigmodel_async`
export const VOICE_STT_FORMAT: AudioFormatEnum = AudioFormatEnum.PCM
export const VOICE_STT_SAMPLE_RATE = 16000
export const VOICE_STT_LANGUAGE = 'zh-CN'
export const VOICE_STT_MODEL = 'bigmodel'
export const VOICE_STT_MODEL_VER = '400'
export const VOICE_STT_TIMEOUT = 5000 // timeout for stt start (ms)
export const VOICE_STT_RESOURCE_ID = 'volc.bigasr.sauc.duration'

// ==================== 录音文件识别极速版 HTTP（同步）====================
// 文档：https://docs.volcengine.com/docs/6561/2608628?lang=zh
const VOICE_HTTP_BASE = VOICE_API.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')

/** v3 bigmodel AUC 极速版 — 一次请求返回识别结果 */
export const VOICE_FILE_BIGMODEL_FLASH_URL = `${VOICE_HTTP_BASE}/api/v3/auc/bigmodel/recognize/flash`

/** 同步识别最大等待时间（毫秒），默认 10 分钟 */
export const VOICE_FILE_RECOGNIZE_TIMEOUT_MS = 10 * 60 * 1000
