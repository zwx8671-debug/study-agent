/** @format */

import { getLogger } from '@utils/Logger'
import {
    VOICE_TTS_ACCESS_TOKEN,
    VOICE_TTS_APP_ID,
    VOICE_TTS_RESOURCE_ID,
    VOICE_TTS_SAMPLE_RATE
} from './config-volcengine'
import { VoiceAttr } from '../../xml/handler/XmlVoiceElementHandler'
import axios, { AxiosResponse } from 'axios'
import { v7 } from 'uuid'
import { TTSResult } from '../TTSFactory'
import { AudioFormatEnum } from '@interface/IAgent'
import { Readable } from 'stream'
import $ from '@utils/util'

interface VolcData {
    code: number
    message: string
    data: string
    sentence: string
}
/**
 * TTSAzureService 类用于通过 Azure Cognitive Services 的语音 SDK 实现文本转语音（TTS）功能。
 * 该类封装了语音合成的核心逻辑，支持通过环境变量配置密钥、区域和自定义终结点。
 */
export class TTSVolcEngineService {
    private static log = getLogger(TTSVolcEngineService.name)
    /**
     * 将输入的文本合成为语音并保存为音频文件。
     * 同步输出 ssml
     *
     * @param text - 需要进行语音合成的文本内容。
     * @param voiceAttr
     * @param fileType
     * @returns 返回一个 Promise，在合成完成时解析，出错时拒绝。
     */

    public static async synthesizeSpeechStream(
        text: string,
        voiceAttr: VoiceAttr,
        fileType: AudioFormatEnum
    ): Promise<Readable> {
        const ttsId = v7()
        const data = JSON.stringify({
            user: {
                uid: ttsId
            },
            req_params: {
                text: text,
                speaker: voiceAttr.speaker,
                audio_params: {
                    format: fileType,
                    sample_rate: VOICE_TTS_SAMPLE_RATE,
                    emotion: voiceAttr.emotion,
                    speech_rate: Number(voiceAttr.speech_rate),
                    loudness_rate: Number(voiceAttr.loudness_rate)
                },
                additions: $.stringify({
                    // 是否开启markdown解析过滤，
                    // 为true时，解析并过滤markdown语法，例如，**你好**，会读为“你好”，
                    // 为false时，不解析不过滤，例如，**你好**，会读为“星星‘你好’星星”
                    disable_markdown_filter: true,
                    // 开启emoji表情在文本中不过滤显示，默认为false，建议搭配时间戳参数一起使用。
                    disable_emoji_filter: true,
                    // 自动识别语种
                    enable_language_detector: true,
                    // 是否过滤括号内的部分，0为不过滤，100为过滤
                    max_length_to_filter_parenthesis: 100,
                    // 是否可以播报latex公式，需将disable_markdown_filter设为true
                    enable_latex_tn: false
                })
            }
        })

        const res: AxiosResponse = await axios({
            method: 'post' as const,
            url: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
            headers: {
                'X-Api-App-Key': VOICE_TTS_APP_ID, // 应用ID
                'X-Api-Access-Key': VOICE_TTS_ACCESS_TOKEN, // 访问令牌
                'X-Api-Resource-Id': VOICE_TTS_RESOURCE_ID // 资源ID
            },
            data: data,
            responseType: 'stream' as const // 改为 stream 模式
        })

        return res.data // 返回可读流
    }

    // 保留原有的非流式方法
    public static async synthesizeSpeech(
        text: string,
        voiceAttr: VoiceAttr,
        fileType: AudioFormatEnum
    ): Promise<TTSResult> {
        const stream = await this.synthesizeSpeechStream(text, voiceAttr, fileType)
        const bufferObj: Buffer[] = []
        let linesData = ''

        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => {
                linesData += chunk.toString()
            })

            stream.on('end', () => {
                linesData
                    .split('\n')
                    .filter((line: string) => line.trim().length > 0)
                    .forEach((line: string) => {
                        try {
                            const data = JSON.parse(line) as VolcData
                            if (data.code === 0 && data.data) {
                                bufferObj.push(Buffer.from(data.data, 'base64'))
                            } else if (data.code === 0 && data.sentence) {
                                // console.log('sentence_data:', data)
                            } else if (data.code === 20000000) {
                                // 流结束
                            } else if (data.code > 0) {
                                console.error(`error response:${data}`)
                            }
                        } catch (e) {
                            console.log('line:', line)
                            console.error('Parse error:', e)
                        }
                    })

                const concat = Buffer.concat(bufferObj)
                const audioData = concat.toString('base64')

                resolve({
                    audio: audioData,
                    format: fileType
                })
            })

            stream.on('error', err => {
                reject(err)
            })
        })
    }
}
