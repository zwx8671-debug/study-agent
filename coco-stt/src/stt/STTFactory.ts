/** @format */

import { env } from '@config/env'
import { STTServiceType, STTStreamOptions } from '@interface/ISTT'
import { STTBaseService } from './STTBaseService'
import { STTVolcengineStreamService } from './volcengine/STTVolcengineStreamService'
import { STTAzureStreamService } from './azure/STTAzureStreamService'
import { STTQwenStreamService } from './qwen/STTQwenStreamService'
import { MockSTTService } from './mock/MockSTTService'
import { getLogger } from '@utils/Logger'

const log = getLogger('STTFactory')

/**
 * STT工厂类 - 按请求供应商或环境变量创建 STT 服务实例
 */
export class STTFactory {
    /**
     * 解析供应商：请求入参优先，否则用 STT_SERVICE_TYPE
     * @param provider 客户端指定的供应商
     */
    public static resolveType(provider?: string): string {
        const requested = provider?.trim()
        const sttServiceType = (requested || env.STT_SERVICE_TYPE || STTServiceType.Qwen).toLowerCase()

        switch (sttServiceType) {
            case STTServiceType.Volcengine:
            case STTServiceType.Azure:
            case STTServiceType.Qwen:
            case STTServiceType.Mock:
                return sttServiceType
            default:
                if (requested) {
                    throw new Error(`Unsupported STT provider: ${requested}`)
                }
                log.warn(`Unknown STT service type: ${sttServiceType}, using qwen as default`)
                return STTServiceType.Qwen
        }
    }

    /**
     * 该提供商的密钥是否已配置（未配置仍可被选中，识别时会失败）
     */
    public static isConfigured(type?: string): boolean {
        const resolved = this.resolveType(type)
        switch (resolved) {
            case STTServiceType.Volcengine:
                return Boolean(env.VOICE_STT_APP_ID && env.VOICE_STT_ACCESS_TOKEN)
            case STTServiceType.Azure:
                return Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION)
            case STTServiceType.Qwen:
                return Boolean(env.QWEN_ASR_API_KEY)
            case STTServiceType.Mock:
                return true
            default:
                return false
        }
    }

    /**
     * 创建STT服务实例
     * @param uid 用户ID（设备序列号或会话ID）
     * @param provider 供应商，缺省走环境变量
     * @param options 本次会话识别参数
     */
    public static create(uid: string, provider?: string, options?: STTStreamOptions): STTBaseService {
        const sttServiceType = this.resolveType(provider)

        log.info(`Creating STT service: ${sttServiceType}${provider ? ' (from request)' : ' (from config)'}`)

        switch (sttServiceType) {
            case STTServiceType.Volcengine:
                return new STTVolcengineStreamService(uid, options)
            case STTServiceType.Azure:
                return new STTAzureStreamService(uid, options)
            case STTServiceType.Qwen:
                return new STTQwenStreamService(uid, options)
            case STTServiceType.Mock:
                log.info('Using Mock STT service for testing')
                return new MockSTTService(uid)
            default:
                return new STTQwenStreamService(uid, options)
        }
    }
}
