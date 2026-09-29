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
    PATH_PREFIX,

    // TTS service selection
    TTS_SERVICE_TYPE,

    // Volcengine configuration
    VOICE_API,
    VOICE_TTS_APP_ID,
    VOICE_TTS_ACCESS_TOKEN,
    VOICE_TTS_RESOURCE_ID,
    VOLC_APPID,
    VOLC_ACCESS_TOKEN,

    // Azure configuration
    SPEECH_KEY,
    SPEECH_REGION,
    AZURE_TTS_KEY,
    AZURE_TTS_REGION,

    // Qwen / Aliyun Model Studio configuration
    QWEN_API_KEY,
    QWEN_WORKSPACE_ID,
    QWEN_TTS_WS_URL,
    QWEN_TTS_HTTP_URL,
    QWEN_TTS_MODEL,
    QWEN_TTS_HTTP_MODEL,
    QWEN_TTS_DEFAULT_SPEAKER,
    QWEN_TTS_HTTP_DEFAULT_SPEAKER,
    QWEN_TTS_SAMPLE_RATE,
    QWEN_TTS_VOLUME,
    QWEN_TTS_RATE,
    QWEN_TTS_PITCH,

    // TTS runtime tuning
    TTS_WS_TIMEOUT,

    // Debug
    SAVE_PCM,
    SAVE_PCM_DIR,

    // CORS configuration
    CORS_ORIGIN
} = process.env

type NodeEnv = 'local' | 'development' | 'production' | 'test'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const env = {
    // Server
    NODE_ENV: (NODE_ENV as NodeEnv) || 'local',
    /** Fastify HTTP API 端口 */
    PORT: parseInt(PORT || '3003', 10),
    /** Socket.IO（uWebSockets.js）端口 */
    SOCKETIO_PORT: parseInt(SOCKETIO_PORT || '3002', 10),
    LOG_LEVEL: LOG_LEVEL as LogLevel | undefined,
    PATH_PREFIX: PATH_PREFIX || '',

    // TTS service selection: volcengine | azure | qwen | mock
    TTS_SERVICE_TYPE: (TTS_SERVICE_TYPE || 'volcengine').toLowerCase(),

    // Volcengine（VOLC_* 为旧变量名，保留兼容）
    VOICE_API: VOICE_API || 'wss://openspeech.bytedance.com',
    VOICE_TTS_APP_ID: VOICE_TTS_APP_ID || VOLC_APPID || '',
    VOICE_TTS_ACCESS_TOKEN: VOICE_TTS_ACCESS_TOKEN || VOLC_ACCESS_TOKEN || '',
    /** 大模型语音合成资源 ID，见 https://www.volcengine.com/docs/6561/1257544 */
    VOICE_TTS_RESOURCE_ID: VOICE_TTS_RESOURCE_ID || 'volc.service_type.10029',

    // Azure（SPEECH_* 与主工程保持一致，AZURE_TTS_* 为旧变量名，保留兼容）
    AZURE_TTS_KEY: SPEECH_KEY || AZURE_TTS_KEY || '',
    AZURE_TTS_REGION: SPEECH_REGION || AZURE_TTS_REGION || 'eastus',

    // Qwen / 阿里云百炼（中国区，北京），实时 TTS: qwen-audio-3.0-tts-flash
    QWEN_API_KEY: QWEN_API_KEY || '',
    QWEN_WORKSPACE_ID: QWEN_WORKSPACE_ID || '',
    QWEN_TTS_WS_URL:
        QWEN_TTS_WS_URL ||
        (QWEN_WORKSPACE_ID ? `wss://${QWEN_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference` : ''),
    QWEN_TTS_HTTP_URL:
        QWEN_TTS_HTTP_URL || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    QWEN_TTS_MODEL: QWEN_TTS_MODEL || 'qwen-audio-3.0-tts-flash',
    QWEN_TTS_HTTP_MODEL: QWEN_TTS_HTTP_MODEL || 'qwen3-tts-flash',
    QWEN_TTS_DEFAULT_SPEAKER: QWEN_TTS_DEFAULT_SPEAKER || 'longanhuan_v3.6',
    QWEN_TTS_HTTP_DEFAULT_SPEAKER: QWEN_TTS_HTTP_DEFAULT_SPEAKER || 'Cherry',
    QWEN_TTS_SAMPLE_RATE: parseInt(QWEN_TTS_SAMPLE_RATE || '16000', 10),
    QWEN_TTS_VOLUME: parseInt(QWEN_TTS_VOLUME || '50', 10),
    QWEN_TTS_RATE: Number(QWEN_TTS_RATE || '1'),
    QWEN_TTS_PITCH: Number(QWEN_TTS_PITCH || '1'),

    /** WebSocket 握手/关闭等待超时，单位毫秒 */
    TTS_WS_TIMEOUT: parseInt(TTS_WS_TIMEOUT || '10000', 10),

    /** 调试用：将合成音频落盘为 WAV */
    SAVE_PCM: SAVE_PCM === 'true',
    SAVE_PCM_DIR: SAVE_PCM_DIR || './logs/pcm',

    // CORS
    CORS_ORIGIN: CORS_ORIGIN || '*'
}
