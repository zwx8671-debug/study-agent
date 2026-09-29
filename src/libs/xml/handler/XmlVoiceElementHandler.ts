/**
 * XML VOICE元素处理器
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { Shell } from '../Shell'
import { ReservedXMLTags } from '../constants.js'
import {
    VOICE_TTS_DEFAULT_EMOTION,
    VOICE_TTS_DEFAULT_LOUDNESS_RATE,
    VOICE_TTS_DEFAULT_SPEECH_RATE,
    VOLC_VOICE_TTS_DEFAULT_SPEAKER
} from '../../voice/volcengine/config-volcengine'
import {
    generateVoiceEmotionList,
    getAllEmotions,
    getAllVoiceNames,
    getVoiceByName,
    getVoiceByType,
    validateEmotionForVoiceType
} from '@utils/VolcTTSConfigManager'
import { correctAzureConvertSpeed, correctVolcEngineConvertSpeed } from '@utils/convert-rate'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'
import { env } from '@config/env'
import { TTSFactory, TTSServiceType } from '../../voice/TTSFactory'
import { AZURE_DEFAULT_LANGUAGE, AZURE_VOICE_TTS_DEFAULT_SPEAKER } from '../../voice/azure/config-azure'

export interface VoiceAttr {
    speaker: string
    emotion: string
    language: string
    speech_rate: string
    loudness_rate: string
}
/**
 * XML VOICE元素处理器
 * 用于处理<VOICE>标签
 */
export class XmlVoiceElementHandler extends AbstractXmlElementHandler {
    /**
     * 声音属性
     * @private
     */
    private voiceAttr: VoiceAttr = { emotion: '', language: '', loudness_rate: '', speaker: '', speech_rate: '' }

    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)
        // 设置voice属性
        this.setVoice(element)
        this.register()
    }

    /**
     * 声音属性处理
     * @param element
     * @private
     */
    private setVoice(element: XmlElement) {
        this.setVoice2(
            element.attr.role,
            element.attr.emotion,
            Number(element.attr.speech_rate),
            Number(element.attr.loudness_rate)
        )
    }

    /**
     * 重写onData - VOICE标签需要传递声音属性
     * @param e - XML元素
     * @protected
     */
    protected onData(e: XmlElement): void {
        // 属性传递给其他标签，方便其他标签传递声音属性【注意：不要使用attr，声音属性不属于非voice标签自带】
        e.tempAttr.speaker = this.voiceAttr.speaker
        e.tempAttr.emotion = this.voiceAttr.emotion
        e.tempAttr.speech_rate = String(this.voiceAttr.speech_rate)
        e.tempAttr.loudness_rate = String(this.voiceAttr.loudness_rate)

        // 调用父类的onData处理
        super.onData(e)
    }

    /**
     * 处理关闭标签XML元素
     * @param e - 关闭标签元素
     * @protected
     */
    protected onClose(e: XmlElement): void {
        super.onClose(e)
        // 只在VOICE标签闭合时重置音色
        if (e.name.toLowerCase() === ReservedXMLTags.VOICE) {
            // 重置音色
            e.tempAttr.speaker = VOLC_VOICE_TTS_DEFAULT_SPEAKER
            e.tempAttr.emotion = VOICE_TTS_DEFAULT_EMOTION
            e.tempAttr.language = AZURE_DEFAULT_LANGUAGE
            e.tempAttr.speech_rate = String(VOICE_TTS_DEFAULT_SPEECH_RATE)
            e.tempAttr.loudness_rate = String(VOICE_TTS_DEFAULT_LOUDNESS_RATE)
        }
    }

    public static replaced(content: string) {
        // 获取所有语音数据
        const roleList = getAllVoiceNames()
            .map((name: string) => `"${name}"`)
            .join(', ')

        // 获取所有情感
        const allEmotions = getAllEmotions()
            .map((emotion: string) => `"${emotion}"`)
            .join(', ')

        const voiceEmotionList = generateVoiceEmotionList()

        // 替换插值
        content = content.replace(/\${roleList}/g, roleList)
        content = content.replace(/\${allEmotions}/g, allEmotions)
        const result = content.replace(/\${voiceEmotionList}/g, voiceEmotionList)
        return result
    }

    private setVoice2(voiceName: string, emotion: string, speech_rate: number, loudness_rate: number) {
        // 设置voice自带属性
        const voice = getVoiceByName(voiceName)
        const voiceLanguage = voice?.language
        const voiceType = voice?.voice_type

        // 语言
        if (voiceLanguage) {
            this.voiceAttr.language = voiceLanguage
        } else {
            this.voiceAttr.language = AZURE_DEFAULT_LANGUAGE
        }

        // 设置speaker（voice_name）
        if (voiceType) {
            this.voiceAttr.speaker = voiceType
        } else {
            if (env.TTS_SERVICE_TYPE === TTSServiceType.Volcengine) {
                this.voiceAttr.speaker = VOLC_VOICE_TTS_DEFAULT_SPEAKER
            } else if (env.TTS_SERVICE_TYPE === TTSServiceType.Azure) {
                this.voiceAttr.speaker = AZURE_VOICE_TTS_DEFAULT_SPEAKER
            }
        }

        // 设置emotion
        // 如果这个情感没有，则使用默认
        if (validateEmotionForVoiceType(this.voiceAttr.speaker, emotion)) {
            this.voiceAttr.emotion = emotion
        } else {
            // 火山和微软都是没有则使用默认
            this.voiceAttr.emotion = ''
            this.log.warn(`语音类型 ${this.voiceAttr.speaker} 不支持 ${emotion} 情感，已使用默认情感 `)
        }

        // 音量、语速
        if (env.TTS_SERVICE_TYPE === TTSServiceType.Volcengine) {
            this.voiceAttr.loudness_rate = correctVolcEngineConvertSpeed(loudness_rate)
            this.voiceAttr.speech_rate = correctVolcEngineConvertSpeed(speech_rate)
        } else if (env.TTS_SERVICE_TYPE === TTSServiceType.Azure) {
            this.voiceAttr.loudness_rate = correctAzureConvertSpeed(loudness_rate)
            this.voiceAttr.speech_rate = correctAzureConvertSpeed(speech_rate)
        }

        this.log.info(
            `this.voiceAttr 语音类型 ${this.voiceAttr.speaker} 情感 ${this.voiceAttr.emotion} 语速 ${this.voiceAttr.speech_rate} 音量 ${this.voiceAttr.loudness_rate}`
        )
    }

    static getDefaultVoiceAttr(serviceType?: string) {
        if (!serviceType) {
            serviceType = env.TTS_SERVICE_TYPE
        }

        const voiceAttr: VoiceAttr = { emotion: '', language: '', loudness_rate: '', speaker: '', speech_rate: '' }
        const voiceType = TTSFactory.getDefaultSpeaker
        // 设置voice自带属性
        const voice = getVoiceByType(voiceType)
        if (!voice) {
            throw new Error(`语音类型 ${voiceType} 不存在`)
        }
        const voiceLanguage = voice.language

        // 语言
        if (voiceLanguage) {
            voiceAttr.language = voiceLanguage
        } else {
            voiceAttr.language = AZURE_DEFAULT_LANGUAGE
        }

        // 设置speaker（voice_name）
        if (voiceType) {
            voiceAttr.speaker = voiceType
        } else {
            if (serviceType === TTSServiceType.Volcengine) {
                voiceAttr.speaker = VOLC_VOICE_TTS_DEFAULT_SPEAKER
            } else if (serviceType === TTSServiceType.Azure) {
                voiceAttr.speaker = AZURE_VOICE_TTS_DEFAULT_SPEAKER
            }
        }

        // 设置emotion
        // 火山和微软都是没有则使用默认
        voiceAttr.emotion = ''

        // 音量、语速
        if (serviceType === TTSServiceType.Volcengine) {
            voiceAttr.loudness_rate = correctVolcEngineConvertSpeed(1)
            voiceAttr.speech_rate = correctVolcEngineConvertSpeed(1)
        } else if (serviceType === TTSServiceType.Azure) {
            voiceAttr.loudness_rate = correctAzureConvertSpeed(1)
            voiceAttr.speech_rate = correctAzureConvertSpeed(1)
        }

        return voiceAttr
    }

    static getVoiceAttr(
        voiceName: string,
        emotion: string,
        speech_rate: number,
        loudness_rate: number,
        serviceType?: string
    ) {
        if (!serviceType) {
            serviceType = env.TTS_SERVICE_TYPE
        }

        const voiceAttr: VoiceAttr = { emotion: '', language: '', loudness_rate: '', speaker: '', speech_rate: '' }
        // 设置voice自带属性
        const voice = getVoiceByName(voiceName)
        const voiceLanguage = voice?.language
        const voiceType = voice?.voice_type

        // 语言
        if (voiceLanguage) {
            voiceAttr.language = voiceLanguage
        } else {
            voiceAttr.language = AZURE_DEFAULT_LANGUAGE
        }

        // 设置speaker（voice_name）
        if (voiceType) {
            voiceAttr.speaker = voiceType
        } else {
            if (serviceType === TTSServiceType.Volcengine) {
                voiceAttr.speaker = VOLC_VOICE_TTS_DEFAULT_SPEAKER
            } else if (serviceType === TTSServiceType.Azure) {
                voiceAttr.speaker = AZURE_VOICE_TTS_DEFAULT_SPEAKER
            }
        }

        // 设置emotion
        // 如果这个情感没有，则使用默认
        if (validateEmotionForVoiceType(voiceAttr.speaker, emotion)) {
            voiceAttr.emotion = emotion
        } else {
            // 火山和微软都是没有则使用默认
            voiceAttr.emotion = ''
        }

        // 音量、语速
        if (serviceType === TTSServiceType.Volcengine) {
            voiceAttr.loudness_rate = correctVolcEngineConvertSpeed(loudness_rate)
            voiceAttr.speech_rate = correctVolcEngineConvertSpeed(speech_rate)
        } else if (serviceType === TTSServiceType.Azure) {
            voiceAttr.loudness_rate = correctAzureConvertSpeed(loudness_rate)
            voiceAttr.speech_rate = correctAzureConvertSpeed(speech_rate)
        }

        return voiceAttr
    }
}
