/** @format */

import dotenv from 'dotenv'
import { strict as assert } from 'assert'
import { existsSync } from 'fs'
import { resolve } from 'path'

// 根据 NODE_ENV 加载对应的 .env 文件
const nodeEnv = process.env.NODE_ENV || 'development'
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
    // Debug mode
    DEBUG,

    // 启用 uWebSockets.js
    ENABLE_UWS,

    // 返回数据包格式，base64、byte
    MSG_PACKET,

    // 测试用，保存TTS音频文件
    SAVE_PCM,

    // TTS功能开关
    ENABLE_TTS,

    // 快速响应功能开关
    ENABLE_VECTOR,

    // LLM MOCK
    USE_MOCK_LLM,

    // Web server configuration
    NODE_ENV,
    PORT,
    SOCKETIO_PORT,
    LOG_LEVEL,
    HOST,
    PATH_PREFIX,
    SERVICE_NAME,

    // LLM API keys and endpoints
    OPENAI_API,
    OPENAI_KEY,
    ANTHROPIC_API,
    ANTHROPIC_KEY,
    GOOGLE_AI_API,
    GOOGLE_AI_KEY,
    ZHIPU_AI_API,
    ZHIPU_AI_KEY,
    OTHER_API,
    OTHER_API_KEY,
    FLY_APP_ID,
    FLY_API_KEY,
    FLY_API_SECRET,
    FLY_API_PASS,
    BAIDU_API_KEY,
    BAIDU_SECRET_KEY,
    MOONSHOT_KEY,
    ALI_KEY,
    X_AI_API,
    X_AI_KEY,

    // Memory service configuration
    MEMORY_API_URL,
    MEMORY_API_KEY,
    /** cocolamp 记忆服务根地址 */
    LAMP_MEMORY_BASE_URL,

    // COCOADMIN service configuration
    COCOADMIN_API_URL,
    COCOADMIN_API_KEY,

    // Audio/voice/speech API keys (ByteDance)
    VOICE_API,
    VOICE_TTS_APP_ID,
    VOICE_TTS_ACCESS_TOKEN,
    VOICE_STT_APP_ID,
    VOICE_STT_ACCESS_TOKEN,

    // Azure TTS configuration
    SPEECH_KEY,
    SPEECH_REGION,

    // TTS service selection
    TTS_SERVICE_TYPE,

    // STT service selection
    STT_SERVICE_TYPE,

    // STT server URL (for Socket.IO STT service)
    STT_SERVER_URL,

    // STT HTTP service URL (for HTTP recognize proxy)
    STT_HTTP_URL,

    // Embedding service selection
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL,

    // redis
    REDIS_HOST,
    REDIS_PORT,
    REDIS_USER,
    REDIS_PASS,
    REDIS_DB,
    REDIS_PREFIX,
    REDIS_TLS,
    REDIS_CLUSTER,

    // JWT configuration
    JWT_SECRET_KEY
} = process.env

// The required environment variables for various services
assert(VOICE_API, 'VOICE_API is required')
assert(VOICE_TTS_APP_ID, 'VOICE_TTS_APP_ID is required')
assert(VOICE_TTS_ACCESS_TOKEN, 'VOICE_TTS_ACCESS_TOKEN is required')
assert(VOICE_STT_APP_ID, 'VOICE_STT_APP_ID is required')
assert(VOICE_STT_ACCESS_TOKEN, 'VOICE_STT_ACCESS_TOKEN is required')
assert(REDIS_HOST, 'REDIS_HOST is required')
assert(REDIS_PORT, 'REDIS_PORT is required')
assert(COCOADMIN_API_URL, 'COCOADMIN_API_URL is required')
assert(COCOADMIN_API_KEY, 'COCOADMIN_API_KEY is required')

// 选用字符串字面量类型提升类型安全
type NodeEnv = 'development' | 'production' | 'test'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// 导出一个配置对象，自动用类型推断
export const env = {
    // Debug mode
    DEBUG: DEBUG || 'false',

    // 启用 uWebSockets.js（默认开启，兼容的 Node.js 22-24 版本）
    ENABLE_UWS: ENABLE_UWS === 'true',

    // msg_packet 返回类型
    MSG_PACKET: MSG_PACKET,

    // 返回类型是不是字节流
    get IS_BYTE() {
        return this.MSG_PACKET === 'BYTE'
    },

    // 测试用，保存TTS音频文件
    SAVE_PCM: SAVE_PCM || 'false',

    // TTS功能开关，默认开启以保持向后兼容
    ENABLE_TTS: ENABLE_TTS ? ENABLE_TTS === 'true' : true,
    // Vector功能开关，默认开启以保持向后兼容
    ENABLE_VECTOR: ENABLE_VECTOR ? ENABLE_VECTOR === 'true' : true,
    // Vector功能开关，默认开启以保持向后兼容
    USE_MOCK_LLM: USE_MOCK_LLM ? USE_MOCK_LLM === 'true' : false,

    // web server
    NODE_ENV: (NODE_ENV as NodeEnv) || 'development', // default is 'development'
    HOST: HOST || '0.0.0.0',
    PORT: parseInt(PORT || '3001', 10), // Fastify HTTP API 端口，默认 3001
    SOCKETIO_PORT: parseInt(SOCKETIO_PORT || '3000', 10), // Socket.IO 端口（仅在 ENABLE_UWS=true 时使用），默认 3000
    LOG_LEVEL: LOG_LEVEL as LogLevel | undefined,
    PATH_PREFIX: PATH_PREFIX || '', // 路径前缀，默认为空（根路径），用于 k8s ingress 部署
    SERVICE_NAME: SERVICE_NAME || 'coco-cloud-ts-unknown',

    // 计算服务器ID（格式：SERVICE_NAME，与Nginx配置保持一致）
    get SERVER_ID() {
        return `${this.SERVICE_NAME}`
    },

    // LLM API configurations (all optional)
    // OpenAI GPT
    OPENAI_API: OPENAI_API || '',
    OPENAI_KEY: OPENAI_KEY || '',

    // Anthropic Claude
    ANTHROPIC_API: ANTHROPIC_API || '',
    ANTHROPIC_KEY: ANTHROPIC_KEY || '',

    // Google AI Studio
    GOOGLE_AI_API: GOOGLE_AI_API || '',
    GOOGLE_AI_KEY: GOOGLE_AI_KEY || '',

    // ZHIPU AI
    ZHIPU_AI_API: ZHIPU_AI_API || '',
    ZHIPU_AI_KEY: ZHIPU_AI_KEY || '',

    // Local model
    OTHER_API: OTHER_API || '',
    OTHER_API_KEY: OTHER_API_KEY || '',

    // SPARK
    FLY_APP_ID: FLY_APP_ID || '',
    FLY_API_KEY: FLY_API_KEY || '',
    FLY_API_SECRET: FLY_API_SECRET || '',
    FLY_API_PASS: FLY_API_PASS || '',

    // Baidu Wenxin Workshop
    BAIDU_API_KEY: BAIDU_API_KEY || '',
    BAIDU_SECRET_KEY: BAIDU_SECRET_KEY || '',

    // Moonshot
    MOONSHOT_KEY: MOONSHOT_KEY || '',

    // AliYun QianWen
    ALI_KEY: ALI_KEY || '',

    // X.AI Grok
    X_AI_API: X_AI_API || '',
    X_AI_KEY: X_AI_KEY || '',

    // Memory service
    MEMORY_API_URL: MEMORY_API_URL || '',
    MEMORY_API_KEY: MEMORY_API_KEY || '',
    /** 未配置时沿用原开发机默认值，生产环境请显式设置 */
    LAMP_MEMORY_BASE_URL: LAMP_MEMORY_BASE_URL || 'http://192.168.10.234:8082',

    // COCOADMIN service
    COCOADMIN_API_URL: COCOADMIN_API_URL || '',
    COCOADMIN_API_KEY: COCOADMIN_API_KEY || '',

    // audio/voice/speech API keys
    VOICE_API: VOICE_API,
    VOICE_TTS_APP_ID: VOICE_TTS_APP_ID,
    VOICE_TTS_ACCESS_TOKEN: VOICE_TTS_ACCESS_TOKEN,
    VOICE_STT_APP_ID: VOICE_STT_APP_ID,
    VOICE_STT_ACCESS_TOKEN: VOICE_STT_ACCESS_TOKEN,

    // Azure TTS configuration
    SPEECH_KEY: SPEECH_KEY || '',
    SPEECH_REGION: SPEECH_REGION || 'eastus',

    // TTS service selection
    TTS_SERVICE_TYPE: TTS_SERVICE_TYPE || 'volcengine',

    // STT service selection
    STT_SERVICE_TYPE: STT_SERVICE_TYPE || 'volcengine',

    // STT server URL (for Socket.IO STT service)
    STT_SERVER_URL: STT_SERVER_URL || 'http://localhost:4000',

    // STT HTTP service URL (for HTTP recognize proxy)
    STT_HTTP_URL: STT_HTTP_URL || 'http://127.0.0.1:4002',

    // Embedding service selection
    EMBEDDING_PROVIDER: EMBEDDING_PROVIDER || 'other', // 'other' (via LiteLLM) or 'aliyun' (direct)
    EMBEDDING_MODEL: EMBEDDING_MODEL || 'text-embedding-v4',

    // redis
    REDIS_HOST: REDIS_HOST,
    REDIS_PORT: parseInt(REDIS_PORT || '6379', 10),
    REDIS_USER: REDIS_USER, // AWS MemoryDB requires username (optional for local dev)
    REDIS_PASS: REDIS_PASS || '',
    REDIS_DB: parseInt(REDIS_DB || '0', 10),
    // 用来数据隔离，例如zwx，避免和测试服务器的数据混合
    REDIS_PREFIX: REDIS_PREFIX || '',
    REDIS_TLS: REDIS_TLS === 'true', // Enable TLS for AWS MemoryDB (default: false)
    REDIS_CLUSTER: REDIS_CLUSTER === 'true', // Use Cluster mode for AWS MemoryDB (default: false)

    // JWT configuration
    JWT_SECRET_KEY: JWT_SECRET_KEY || 'your-secret-key-change-in-production'
}
