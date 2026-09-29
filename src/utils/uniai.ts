/** @format */

import UniAI from 'uniai'
import { env } from '@config/env'

export default new UniAI({
    OpenAI: {
        key: env.OPENAI_KEY,
        proxy: env.OPENAI_API
    },
    Anthropic: {
        key: env.ANTHROPIC_KEY,
        proxy: env.ANTHROPIC_API
    },
    Google: {
        key: env.GOOGLE_AI_KEY,
        proxy: env.GOOGLE_AI_API
    },
    GLM: {
        key: env.ZHIPU_AI_KEY,
        proxy: env.ZHIPU_AI_API
    },
    XAI: {
        key: env.X_AI_KEY
    },
    MoonShot: {
        key: env.MOONSHOT_KEY
    },
    AliYun: {
        key: env.ALI_KEY
    },
    Other: {
        api: env.OTHER_API,
        key: env.OTHER_API_KEY
    }
})
