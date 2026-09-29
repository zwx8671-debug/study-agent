/** @format */

import { TTSBaseService } from './TTSBaseService'
import { TTSVolcengineStreamService } from './volcengine/TTSVolcengineStreamService'
import { TTSAzureStreamService } from './azure/TTSAzureStreamService'
import { MockTTSService } from './mock/MockTTSService'
import { TTSAzureService, VoiceAttr } from './azure/TTSAzureService'
import { TTSVolcEngineService } from './volcengine/TTSVolcEngineService'
import { TTSQwenStreamService } from './qwen/TTSQwenStreamService'
import { TTSQwenHttpService } from './qwen/TTSQwenHttpService'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import { AZURE_TTS_SAMPLE_RATE, AZURE_VOICE_TTS_DEFAULT_SPEAKER } from './azure/config-azure'
import { QWEN_TTS_DEFAULT_SPEAKER, QWEN_TTS_FORMAT, QWEN_TTS_SAMPLE_RATE } from './qwen/config-qwen'
import {
    VOICE_TTS_FORMAT,
    VOICE_TTS_SAMPLE_RATE,
    VOLC_VOICE_TTS_DEFAULT_SPEAKER
} from './volcengine/config-volcengine'
import { saveDebugWav } from '@utils/pcmToWav'
import { AudioFormatEnum } from '@interface/IAgent'
import { v4 } from 'uuid'

const log = getLogger('TTSFactory')

// TTS服务类型枚举
export enum TTSServiceType {
    Volcengine = 'volcengine',
    Azure = 'azure',
    Qwen = 'qwen',
    Mock = 'mock'
}

export interface TTSResult {
    audio: string
    format: AudioFormatEnum
}

/**
 * TTS工厂类
 * 根据配置创建相应的TTS服务实例
 */
export class TTSFactory {
    /**
     * 解析提供商名称；未传时回落到环境变量 TTS_SERVICE_TYPE
     */
    public static resolveType(type?: string): TTSServiceType {
        const raw = (type || env.TTS_SERVICE_TYPE || TTSServiceType.Volcengine).toLowerCase()
        if ((Object.values(TTSServiceType) as string[]).includes(raw)) {
            return raw as TTSServiceType
        }
        throw new Error(`未知 TTS 提供商: ${type}，可选 volcengine / azure / qwen / mock`)
    }

    /**
     * 指定提供商的默认音色
     */
    public static getDefaultSpeakerFor(type: TTSServiceType): string {
        switch (type) {
            case TTSServiceType.Azure:
                return AZURE_VOICE_TTS_DEFAULT_SPEAKER
            case TTSServiceType.Volcengine:
                return VOLC_VOICE_TTS_DEFAULT_SPEAKER
            case TTSServiceType.Qwen:
                return QWEN_TTS_DEFAULT_SPEAKER
            case TTSServiceType.Mock:
                return 'mock-speaker'
            default:
                throw new Error(`Unsupported TTS service type: ${type}`)
        }
    }

    /**
     * 获取当前 TTS 服务类型下的默认音色
     */
    public static get getDefaultSpeaker(): string {
        return this.getDefaultSpeakerFor(this.resolveType())
    }

    /**
     * 指定提供商的输出音频元信息
     */
    public static getAudioMetaFor(type: TTSServiceType): { format: string; sampleRate: number } {
        switch (type) {
            case TTSServiceType.Azure:
                return { format: AudioFormatEnum.PCM, sampleRate: AZURE_TTS_SAMPLE_RATE }
            case TTSServiceType.Volcengine:
                return { format: VOICE_TTS_FORMAT, sampleRate: VOICE_TTS_SAMPLE_RATE }
            case TTSServiceType.Qwen:
                return { format: QWEN_TTS_FORMAT, sampleRate: QWEN_TTS_SAMPLE_RATE }
            default:
                return { format: AudioFormatEnum.PCM, sampleRate: 16000 }
        }
    }

    /**
     * 当前 TTS 服务类型的输出音频元信息，无需建立上游连接，供 /health、/tts/status 使用
     */
    public static get audioMeta(): { format: string; sampleRate: number } {
        try {
            return this.getAudioMetaFor(this.resolveType())
        } catch {
            return { format: AudioFormatEnum.PCM, sampleRate: 16000 }
        }
    }

    /**
     * 该提供商的密钥是否已配置（未配置仍可被选中，合成时会失败）
     */
    public static isConfigured(type: TTSServiceType): boolean {
        switch (type) {
            case TTSServiceType.Volcengine:
                return Boolean(env.VOICE_TTS_APP_ID && env.VOICE_TTS_ACCESS_TOKEN)
            case TTSServiceType.Azure:
                return Boolean(env.AZURE_TTS_KEY && env.AZURE_TTS_REGION)
            case TTSServiceType.Qwen:
                return Boolean(env.QWEN_API_KEY)
            case TTSServiceType.Mock:
                return true
            default:
                return false
        }
    }

    /**
     * 创建TTS服务实例
     * @param type TTS服务类型
     * @param uid 用户ID（设备序列号）
     * @returns TTS服务实例
     */
    public static createTTS(type: TTSServiceType, uid: string): TTSBaseService {
        switch (type) {
            case TTSServiceType.Volcengine:
                return new TTSVolcengineStreamService(uid)
            case TTSServiceType.Azure:
                return new TTSAzureStreamService(uid)
            case TTSServiceType.Qwen:
                return new TTSQwenStreamService(uid)
            case TTSServiceType.Mock:
                return new MockTTSService(uid)
            default:
                throw new Error(`Unsupported TTS service type: ${type}`)
        }
    }

    /**
     * 根据环境变量配置创建TTS服务实例
     * @param uid 用户ID（设备序列号）
     * @returns TTS服务实例
     */
    public static createTTSFromConfig(uid: string): TTSBaseService {
        const ttsServiceType = env.TTS_SERVICE_TYPE

        switch (ttsServiceType) {
            case TTSServiceType.Volcengine:
                return new TTSVolcengineStreamService(uid)
            case TTSServiceType.Azure:
                return new TTSAzureStreamService(uid)
            case TTSServiceType.Qwen:
                return new TTSQwenStreamService(uid)
            case TTSServiceType.Mock:
                log.info('Using Mock TTS service for testing')
                return new MockTTSService(uid)
            default:
                log.warn(`Unknown TTS_SERVICE_TYPE[${ttsServiceType}], fallback to volcengine`)
                return new TTSVolcengineStreamService(uid)
        }
    }

    /**
     * 一次性合成（非流式），火山 / Azure / Qwen 支持
     * @param text 需要合成的文本
     * @param voiceAttr 语音属性
     */
    public static async synthesizeSpeech(text: string, voiceAttr: VoiceAttr): Promise<TTSResult | null> {
        text = text.trim()
        if (!text) {
            return null
        }

        let data: TTSResult
        switch (env.TTS_SERVICE_TYPE) {
            case TTSServiceType.Azure: {
                data = await TTSAzureService.synthesizeSpeech(text, voiceAttr)
                break
            }
            case TTSServiceType.Volcengine: {
                data = await TTSVolcEngineService.synthesizeSpeech(text, voiceAttr, AudioFormatEnum.PCM)
                break
            }
            case TTSServiceType.Qwen: {
                const result = await TTSQwenHttpService.synthesizeSpeech(text, voiceAttr)
                data = { audio: result.audio, format: result.format }
                break
            }
            default:
                throw new Error(`Unsupported TTS service type: ${env.TTS_SERVICE_TYPE}`)
        }

        if (env.SAVE_PCM && data.format === AudioFormatEnum.PCM) {
            const name = `${voiceAttr.speaker}-${voiceAttr.emotion}-${voiceAttr.loudness_rate}-${voiceAttr.speech_rate}-${v4()}.wav`
            saveDebugWav(Buffer.from(data.audio, 'base64'), name)
        }

        return data
    }
}
