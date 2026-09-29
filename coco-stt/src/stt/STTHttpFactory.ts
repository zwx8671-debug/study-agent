/** @format */
import { STTHttpBaseService } from './STTHttpBaseService'
import { STTAzureHttpService } from './azure/STTAzureService'
import { MockSTTHttpService } from './mock/MockSTTHttpService'
import { STTVolcengineBigmodelAucHttpService } from './volcengine/STTVolcengineBigmodelAucHttpService'
import { STTQwenHttpService } from './qwen/STTQwenHttpService'
import { STTFactory } from './STTFactory'
import { STTServiceType } from '@interface/ISTT'
import { getLogger } from '@utils/Logger'
const log = getLogger('STTHttpFactory')
/**
 * HTTP STT 工厂类
 * 与流式的 STTFactory 对称，根据 STT_SERVICE_TYPE 环境变量
 * 创建对应的一次性（HTTP）语音识别服务实例。
 *
 * 支持情况：
 *   azure      → STTAzureHttpService          （完整实现）
 *   volcengine → STTVolcengineBigmodelAucHttpService （v3 AUC bigmodel 极速版同步识别）
 *   qwen       → STTQwenHttpService           （Qwen3-ASR-Flash OpenAI 兼容接口）
 *   mock       → MockSTTHttpService            （测试用）
 */
export class STTHttpFactory {
    /**
     * 创建 HTTP STT 服务实例
     * @param provider 供应商，缺省走环境变量
     */
    public static create(provider?: string): STTHttpBaseService {
        const sttServiceType = STTFactory.resolveType(provider)
        log.info(`创建 HTTP STT 服务: ${sttServiceType}${provider ? ' (from request)' : ' (from config)'}`)
        switch (sttServiceType) {
            case STTServiceType.Azure:
                return new STTAzureHttpService()
            case STTServiceType.Volcengine:
                log.info('使用火山引擎 v3 bigmodel AUC 极速版同步识别 HTTP 服务')
                return new STTVolcengineBigmodelAucHttpService()
            case STTServiceType.Qwen:
                log.info('使用 Qwen3-ASR-Flash OpenAI 兼容 HTTP 服务')
                return new STTQwenHttpService()
            case STTServiceType.Mock:
                log.info('使用 Mock HTTP STT 服务（测试模式）')
                return new MockSTTHttpService()
            default:
                log.warn(`未知 STT 服务类型: ${sttServiceType}，已降级使用 Mock 服务`)
                return new MockSTTHttpService()
        }
    }

    /**
     * 创建火山引擎 v3 bigmodel AUC 极速版同步识别服务实例
     */
    public static createVolcengineFileService(): STTVolcengineBigmodelAucHttpService {
        return new STTVolcengineBigmodelAucHttpService()
    }
}
