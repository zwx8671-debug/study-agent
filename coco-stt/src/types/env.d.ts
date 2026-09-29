/** @format */

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // 服务配置
            PORT?: string
            NODE_ENV?: string
            LOG_LEVEL?: string

            // STT 服务配置
            STT_SERVICE_TYPE?: string

            // 火山引擎配置
            VOICE_API?: string
            VOICE_STT_APP_ID?: string
            VOICE_STT_ACCESS_TOKEN?: string
            VOICE_STT_CLUSTER?: string
            /** v3 HTTP 极速版文件识别；不配则使用 VOICE_STT_ACCESS_TOKEN 作为 x-api-key */
            VOICE_STT_API_KEY?: string
            /** 极速版资源 ID，默认 volc.bigasr.auc_turbo */
            VOICE_STT_FILE_RESOURCE_ID?: string
            VOICE_STT_USER_UID?: string

            // Azure 配置
            AZURE_SPEECH_KEY?: string
            AZURE_SPEECH_REGION?: string

            // Socket.IO 配置
            CORS_ORIGIN?: string
        }
    }
}

export {}
