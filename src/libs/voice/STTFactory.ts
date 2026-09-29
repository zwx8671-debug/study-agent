/** @format */

import { STTBaseService } from './STTBaseService'
import { STTVolcengineStreamService } from './volcengine/STTVolcengineStreamService'
import { STTAzureStreamService } from './azure/STTAzureStreamService'
import { MockSTTService } from './mock/MockSTTService'
import { STTSocketIOService } from './socketio/STTSocketIOService'
import { getLogger } from '@utils/Logger'

// STT服务类型枚举
export enum STTServiceType {
    Volcengine = 'volcengine',
    Azure = 'azure',
    Mock = 'mock',
    SocketIO = 'socketio'
}

const log = getLogger('STTFactory')
/**
 * STT工厂类
 * 根据配置创建相应的STT服务实例
 */
export class STTFactory {
    /**
     * 创建STT服务实例
     * @param type STT服务类型
     * @param uid 用户ID（设备序列号）
     * @returns STT服务实例
     */
    public static createSTT(type: STTServiceType, uid: string): STTBaseService {
        switch (type) {
            case STTServiceType.Volcengine:
                return new STTVolcengineStreamService(uid)
            case STTServiceType.Azure:
                return new STTAzureStreamService(uid)
            case STTServiceType.Mock:
                return new MockSTTService(uid)
            case STTServiceType.SocketIO:
                return new STTSocketIOService(uid)
            default:
                throw new Error(`Unsupported STT service type: ${type}`)
        }
    }

    /**
     * 根据环境变量配置创建STT服务实例
     * @param uid 用户ID（设备序列号）
     * @returns STT服务实例
     */
    public static createSTTFromConfig(uid: string): STTBaseService {
        // 从环境变量获取STT服务类型配置
        const sttServiceType = process.env.STT_SERVICE_TYPE || STTServiceType.Volcengine

        log.info(`【${sttServiceType}】 create STT service`)
        switch (sttServiceType.toLowerCase()) {
            case STTServiceType.Volcengine:
                return new STTVolcengineStreamService(uid)
            case STTServiceType.Azure:
                return new STTAzureStreamService(uid)
            case STTServiceType.Mock:
                log.info(`Using Mock STT service for testing`)
                return new MockSTTService(uid)
            case STTServiceType.SocketIO:
                log.info(`Using Socket.IO STT service`)
                return new STTSocketIOService(uid)
            default:
                // 默认使用火山STT服务
                return new STTVolcengineStreamService(uid)
        }
    }
}
