/** @format */

import { PathOrFileDescriptor, readFileSync } from 'fs'
import { resolve } from 'path'
import { env } from '@config/env'
import { TTSServiceType } from '../libs/voice/TTSFactory'

// 定义TTS语音数据接口
export interface TTSVoiceData {
    voice_name: string
    voice_type: string
    language: string
    emotion: string[]
}

// 定义TTS配置接口
export interface TTSConfig {
    voice_data: TTSVoiceData[]
}

/**
 * TTS配置管理类
 */
class VolcTTSConfigManager {
    private config: TTSConfig | null = null
    private voiceMapByName: Map<string, TTSVoiceData> = new Map()
    private voiceMapByType: Map<string, TTSVoiceData> = new Map()

    constructor() {
        this.loadConfig()
    }

    /**
     * 加载TTS配置文件
     */
    private loadConfig(): void {
        try {
            let configPath: PathOrFileDescriptor
            if (env.TTS_SERVICE_TYPE === TTSServiceType.Azure) {
                configPath = resolve(__dirname, '../../assets/azure_tts_simplified.json')
            } else {
                configPath = resolve(__dirname, '../../assets/volc_tts.json')
            }
            const configFile = readFileSync(configPath, 'utf-8')
            this.config = JSON.parse(configFile) as TTSConfig

            // 构建快速查找映射
            if (this.config.voice_data) {
                for (const voice of this.config.voice_data) {
                    this.voiceMapByName.set(voice.voice_name, voice)
                    this.voiceMapByType.set(voice.voice_type, voice)
                }
            }
        } catch (error) {
            throw new Error(`Failed to load TTS config: ${error}`)
        }
    }

    /**
     * 获取所有语音数据
     * @returns TTS语音数据数组
     */
    public getAllVoices(): TTSVoiceData[] {
        if (!this.config) {
            return []
        }
        return this.config.voice_data
    }

    /**
     * 获取所有情感（去重）
     * @returns 所有情感的数组
     */
    public getAllEmotions(): string[] {
        if (!this.config) {
            return []
        }

        const allEmotions = this.config.voice_data.flatMap(voice => voice.emotion)

        return [...new Set(allEmotions)]
    }

    /**
     * 获取所有情感（去重）
     * @returns 所有情感的数组
     */
    public getAllVoiceNames(): string[] {
        if (!this.config) {
            return []
        }

        return this.config.voice_data.flatMap(voice => voice.voice_name)
    }

    /**
     * 根据语音名称查找语音类型
     * @param voiceName 语音名称
     * @returns 语音类型，如果未找到则返回null
     */
    public getVoiceTypeByName(voiceName: string): string | null {
        const voice = this.voiceMapByName.get(voiceName)
        return voice ? voice.voice_type : null
    }

    /**
     * 根据语音类型查找语音数据
     * @param voiceType 语音类型
     * @returns 语音数据，如果未找到则返回null
     */
    public getVoiceByType(voiceType: string): TTSVoiceData | null {
        return this.voiceMapByType.get(voiceType) || null
    }

    /**
     * 根据语音名称查找语音数据
     * @param voiceName 语音名称
     * @returns 语音数据，如果未找到则返回null
     */
    public getVoiceByName(voiceName: string): TTSVoiceData | null {
        return this.voiceMapByName.get(voiceName) || null
    }

    /**
     * 验证指定语音类型是否支持指定情感
     * @param voiceType 语音类型
     * @param emotion 情感
     * @returns 是否支持该情感
     */
    public validateEmotionForVoiceType(voiceType: string, emotion: string): boolean {
        const voice = this.voiceMapByType.get(voiceType)
        if (!voice) {
            return false
        }
        return voice.emotion.includes(emotion)
    }

    /**
     * 验证指定语音名称是否支持指定情感
     * @param voiceName 语音名称
     * @param emotion 情感
     * @returns 是否支持该情感
     */
    public validateEmotionForVoiceName(voiceName: string, emotion: string): boolean {
        const voice = this.voiceMapByName.get(voiceName)
        if (!voice) {
            return false
        }
        return voice.emotion.includes(emotion)
    }

    /**
     * 获取指定语音类型支持的所有情感
     * @param voiceType 语音类型
     * @returns 支持的情感数组
     */
    public getEmotionsForVoiceType(voiceType: string): string[] {
        const voice = this.voiceMapByType.get(voiceType)
        return voice ? [...voice.emotion] : []
    }

    /**
     * 获取指定语音名称支持的所有情感
     * @param voiceName 语音名称
     * @returns 支持的情感数组
     */
    public getEmotionsForVoiceName(voiceName: string): string[] {
        const voice = this.voiceMapByName.get(voiceName)
        return voice ? [...voice.emotion] : []
    }

    /**
     * 生成可用的声音和情感详细列表
     * @returns 格式化的声音和情感列表字符串
     */
    public generateVoiceEmotionList(): string {
        // 从tts.json获取所有声音数据
        const voiceData = getAllVoices() // 假设已有此方法获取tts数据

        let result = '\n  **中文声音**:\n'

        voiceData.forEach(voice => {
            if (voice.language.includes('中文')) {
                const emotions = voice.emotion.join(', ')
                result += `  - ${voice.voice_name}: ${emotions}\n`
            }
        })

        result += '\n  **英文声音**:\n'

        voiceData.forEach(voice => {
            if (voice.language.includes('英语')) {
                const emotions = voice.emotion.join(', ')
                result += `  - ${voice.voice_name}: ${emotions}\n`
            }
        })

        return result
    }
}

// 创建单例实例
export const ttsConfigManager = new VolcTTSConfigManager()

// 导出便捷方法
export const getAllVoices = (): TTSVoiceData[] => ttsConfigManager.getAllVoices()
export const getAllEmotions = (): string[] => ttsConfigManager.getAllEmotions()
export const getAllVoiceNames = (): string[] => ttsConfigManager.getAllVoiceNames()
export const getVoiceTypeByName = (voiceName: string): string | null => ttsConfigManager.getVoiceTypeByName(voiceName)
export const getVoiceByType = (voiceType: string): TTSVoiceData | null => ttsConfigManager.getVoiceByType(voiceType)
export const generateVoiceEmotionList = (): string => ttsConfigManager.generateVoiceEmotionList()
export const getVoiceByName = (voiceName: string): TTSVoiceData | null => ttsConfigManager.getVoiceByName(voiceName)
export const validateEmotionForVoiceType = (voiceType: string, emotion: string): boolean =>
    ttsConfigManager.validateEmotionForVoiceType(voiceType, emotion)
export const validateEmotionForVoiceName = (voiceName: string, emotion: string): boolean =>
    ttsConfigManager.validateEmotionForVoiceName(voiceName, emotion)
export const getEmotionsForVoiceType = (voiceType: string): string[] =>
    ttsConfigManager.getEmotionsForVoiceType(voiceType)
export const getEmotionsForVoiceName = (voiceName: string): string[] =>
    ttsConfigManager.getEmotionsForVoiceName(voiceName)
