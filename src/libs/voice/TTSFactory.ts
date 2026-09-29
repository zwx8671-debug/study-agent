/** @format */

import { TTSBaseService } from './TTSBaseService'
import { TTSVolcengineStreamService } from './volcengine/TTSVolcengineStreamService'
import { TTSAzureStreamService } from './azure/TTSAzureStreamService'
import { MockTTSService } from './mock/MockTTSService'
import { VoiceAttr } from '../xml/handler/XmlVoiceElementHandler'
import { TTSAzureService } from './azure/TTSAzureService'
import { TTSVolcEngineService } from './volcengine/TTSVolcEngineService'
import { env } from '@config/env'
import { AZURE_VOICE_TTS_DEFAULT_SPEAKER } from './azure/config-azure'
import { VOLC_VOICE_TTS_DEFAULT_SPEAKER } from './volcengine/config-volcengine'
import { convertPcmToWav2 } from '@utils/pcmToWav'
import fs from 'node:fs'
import { AudioFormatEnum } from '@interface/IAgent'
import { v4 } from 'uuid'

const flag = env.SAVE_PCM === 'true'

// TTS服务类型枚举
export enum TTSServiceType {
    Volcengine = 'volcengine',
    Azure = 'azure',
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
     * 根据配置创建并返回相应的TTS服务实例
     * @param text 需要合成的文本
     * @param voiceAttr 语音属性
     * @returns Promise<TTSResult>
     */
    public static get getDefaultSpeaker(): string {
        switch (env.TTS_SERVICE_TYPE) {
            case TTSServiceType.Azure:
                return AZURE_VOICE_TTS_DEFAULT_SPEAKER
            case TTSServiceType.Volcengine:
                return VOLC_VOICE_TTS_DEFAULT_SPEAKER
            case TTSServiceType.Mock:
                return 'mock-speaker'
            default:
                throw new Error(`Unsupported TTS service type: ${env.TTS_SERVICE_TYPE}`)
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
            case TTSServiceType.Mock:
                return new MockTTSService(uid)
            default:
                throw new Error(`Unsupported TTS service type: ${type}`)
        }
    }

    /**
     * 根据配置创建并返回相应的TTS服务实例
     * @param text 需要合成的文本
     * @param voiceAttr 语音属性
     * @returns Promise<TTSResult>
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
            default:
                throw new Error(`Unsupported TTS service type: ${env.TTS_SERVICE_TYPE}`)
        }

        if (flag) {
            const fullBuffer = Buffer.from(data.audio, 'base64')
            try {
                if (data.format !== AudioFormatEnum.PCM) {
                    fs.writeFileSync(`${v4()}.${data.format}`, fullBuffer)
                } else if (data.format === AudioFormatEnum.PCM) {
                    convertPcmToWav2(
                        fullBuffer,
                        `${voiceAttr.speaker}-${voiceAttr.emotion}-${voiceAttr.loudness_rate}-${voiceAttr.speech_rate}-${v4()}.wav`
                    )
                }
            } catch (error) {
                console.log('Error converting PCM to WAV:', error)
            }
        }
        return data
    }

    /**
     * 根据环境变量配置创建TTS服务实例
     * @param uid 用户ID（设备序列号）
     * @returns TTS服务实例
     */
    public static createTTSFromConfig(uid: string): TTSBaseService {
        // 从环境变量获取TTS服务类型配置
        const ttsServiceType = process.env.TTS_SERVICE_TYPE || TTSServiceType.Volcengine

        switch (ttsServiceType.toLowerCase()) {
            case TTSServiceType.Volcengine:
                return new TTSVolcengineStreamService(uid)
            case TTSServiceType.Azure:
                return new TTSAzureStreamService(uid)
            case TTSServiceType.Mock:
                console.log(`Using Mock TTS service for testing`)
                return new MockTTSService(uid)
            default:
                // 默认使用火山TTS服务
                return new TTSVolcengineStreamService(uid)
        }
    }
}
