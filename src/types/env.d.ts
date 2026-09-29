/** @format */

declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test'
        LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
        HOST?: string
        PORT?: string

        // Database configuration
        DB_TYPE?: 'postgres' | 'mysql' | 'sqlite'
        DB_PORT?: string
        DB_HOST?: string
        DB_USER?: string
        DB_PASS?: string
        DB_NAME?: string
        DB_SCHEMA?: string

        // LLM API configurations
        // OPENAI GPT
        OPENAI_API?: string
        OPENAI_KEY?: string

        // Anthropic Claude
        ANTHROPIC_API?: string
        ANTHROPIC_KEY?: string

        // Google AI Studio
        GOOGLE_AI_API?: string
        GOOGLE_AI_KEY?: string

        // ZHIPU AI
        ZHIPU_AI_API?: string
        ZHIPU_AI_KEY?: string

        // Local model
        OTHER_API?: string

        // SPARK
        FLY_APP_ID?: string
        FLY_API_KEY?: string
        FLY_API_SECRET?: string
        FLY_API_PASS?: string

        // Baidu Wenxin Workshop
        BAIDU_API_KEY?: string
        BAIDU_SECRET_KEY?: string

        // Moonshot
        MOONSHOT_KEY?: string

        // AliYun QianWen
        ALI_KEY?: string

        // X.AI Grok
        X_AI_API?: string
        X_AI_KEY?: string

        // ==============================================Audio/Speech API================================================
        // ByteDance 火山引擎
        VOICE_API?: string
        VOICE_TTS_APP_ID?: string
        VOICE_TTS_ACCESS_TOKEN?: string
        VOICE_STT_APP_ID?: string
        VOICE_STT_ACCESS_TOKEN?: string

        // redis
        REDIS_HOST?: string
        REDIS_PORT?: string
        REDIS_PASS?: string
    }
}
