/** @format */

import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

// 根据 NODE_ENV 加载对应的 .env 文件
const nodeEnv = process.env.NODE_ENV || 'local'
const envFiles = [`.env.${nodeEnv}`, '.env']

// 按顺序加载环境变量文件
for (const file of envFiles) {
    const filePath = resolve(process.cwd(), file)
    if (existsSync(filePath)) {
        dotenv.config({ path: filePath, override: false })
        console.log(`✓ Loaded env file: ${file}`)
    }
}

const {
    // Server configuration
    NODE_ENV,
    PORT,
    SOCKETIO_PORT,
    LOG_LEVEL,

    // STT service selection
    STT_SERVICE_TYPE,

    // Volcengine configuration
    VOICE_API,
    VOICE_STT_APP_ID,
    VOICE_STT_ACCESS_TOKEN,
    VOICE_STT_API_KEY,
    VOICE_STT_FILE_RESOURCE_ID,
    VOICE_STT_USER_UID,

    // Azure configuration
    AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION,

    // Qwen ASR configuration
    QWEN_ASR_API_KEY,
    QWEN_ASR_WORKSPACE_ID,
    QWEN_ASR_API_HOST,
    QWEN_ASR_WS_URL,
    QWEN_ASR_MODEL,
    QWEN_ASR_REGION,
    QWEN_ASR_COMPATIBLE_BASE_URL,
    QWEN_ASR_ENABLE_ITN,

    // CORS configuration
    CORS_ORIGIN,
    PATH_PREFIX
} = process.env

type NodeEnv = 'local' | 'development' | 'production' | 'test'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const env = {
    // Server
    NODE_ENV: (NODE_ENV as NodeEnv) || 'local',
    PORT: parseInt(PORT || '4001', 10),
    SOCKETIO_PORT: parseInt(SOCKETIO_PORT || '4000', 10),
    LOG_LEVEL: LOG_LEVEL as LogLevel | undefined,
    PATH_PREFIX: PATH_PREFIX || '',

    // STT service selection
    STT_SERVICE_TYPE: STT_SERVICE_TYPE || 'qwen',

    // Volcengine
    VOICE_API: VOICE_API || 'wss://openspeech.bytedance.com',
    VOICE_STT_APP_ID: VOICE_STT_APP_ID || '',
    VOICE_STT_ACCESS_TOKEN: VOICE_STT_ACCESS_TOKEN || '',
    /** v3 HTTP 极速版文件识别专用 API Key；不配则回退为 VOICE_STT_ACCESS_TOKEN */
    VOICE_STT_API_KEY: VOICE_STT_API_KEY || '',
    VOICE_STT_FILE_RESOURCE_ID: VOICE_STT_FILE_RESOURCE_ID || '',
    VOICE_STT_USER_UID: VOICE_STT_USER_UID || '',

    // Azure
    AZURE_SPEECH_KEY: AZURE_SPEECH_KEY || '',
    AZURE_SPEECH_REGION: AZURE_SPEECH_REGION || 'eastasia',

    // Qwen ASR
    QWEN_ASR_API_KEY: QWEN_ASR_API_KEY || '',
    QWEN_ASR_WORKSPACE_ID: QWEN_ASR_WORKSPACE_ID || '',
    QWEN_ASR_API_HOST: QWEN_ASR_API_HOST || '',
    QWEN_ASR_WS_URL: QWEN_ASR_WS_URL || '',
    QWEN_ASR_MODEL: QWEN_ASR_MODEL || 'qwen3-asr-flash',
    QWEN_ASR_REGION: QWEN_ASR_REGION || 'cn-beijing',
    QWEN_ASR_COMPATIBLE_BASE_URL: QWEN_ASR_COMPATIBLE_BASE_URL || '',
    QWEN_ASR_ENABLE_ITN: QWEN_ASR_ENABLE_ITN || false,

    // CORS
    CORS_ORIGIN: CORS_ORIGIN || '*'
}
