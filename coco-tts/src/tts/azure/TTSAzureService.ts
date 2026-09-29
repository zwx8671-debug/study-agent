/** @format */

import { ResultReason, SpeechSynthesisResult, SpeechSynthesizer } from 'microsoft-cognitiveservices-speech-sdk'
import { AZURE_TTS_SAMPLE_RATE, AZURE_VOICE_TTS_DEFAULT_SPEAKER, speechConfig } from './config-azure'
import { getLogger } from '@utils/Logger'
import { buildSsml } from '@utils/ssml'
import { TTSResult } from '../TTSFactory'
import { AudioFormatEnum } from '@interface/IAgent'
import type { TTSHttpAudioResult, TTSHttpSseHandlers, TTSHttpSseResult } from '../TTSHttp.types'

export interface VoiceAttr {
    speaker: string
    emotion: string
    language: string
    speech_rate: string
    loudness_rate: string
}


/**
 * TTSAzureService 类用于通过 Azure Cognitive Services 的语音 SDK 实现文本转语音（TTS）功能。
 * 该类封装了语音合成的核心逻辑，支持通过环境变量配置密钥、区域和自定义终结点。
 */
export class TTSAzureService {
    private static log = getLogger(TTSAzureService.name)
    /**
     * 将输入的文本合成为语音并保存为音频文件。
     * 同步输出 ssml
     *
     * @param text - 需要进行语音合成的文本内容。
     * @param voiceAttr
     * @returns 返回一个 Promise，在合成完成时解析，出错时拒绝。
     */
    public static async synthesizeSpeech(text: string, voiceAttr: VoiceAttr): Promise<TTSResult> {
        text = buildSsml(
            text,
            voiceAttr.speaker || AZURE_VOICE_TTS_DEFAULT_SPEAKER,
            voiceAttr.language || 'zh-CN',
            voiceAttr.speech_rate || '1.0',
            voiceAttr.loudness_rate || '0%',
        )
        const synthesizer: SpeechSynthesizer = new SpeechSynthesizer(speechConfig)

        return await new Promise((resolve: (value: TTSResult) => void, reject) => {
            // const timeout = setTimeout(
            //     () => {
            //         synthesizer.close()
            //         reject(new Error('Azure语音合成超时'))
            //     },
            //     30000 + text.length * 50
            // )

            // 合成完成处理 事件方法重写
            synthesizer.synthesisCompleted = (s, e) => {
                TTSAzureService.log.info('e.result.resultId: ', e.result.resultId)
                TTSAzureService.log.info('e.result.audioDuration: ', e.result.audioDuration)
                TTSAzureService.log.info('e.result.properties: ', e.result.properties)
                // 将 audioData 转换为 base64
                const audioDataBase64 = Buffer.from(e.result.audioData).toString('base64')

                // clearTimeout(timeout)
                synthesizer.close()
                resolve({
                    audio: audioDataBase64,
                    format: AudioFormatEnum.PCM
                })
            }

            // 执行异步(没有stream参数就是同步)语音合成操作  speakSsmlAsync、speakTextAsync
            synthesizer.speakSsmlAsync(
                text,
                // 合成完成处理
                (result: SpeechSynthesisResult) => {
                    if (result.reason === ResultReason.SynthesizingAudioCompleted) {
                        // 成功处理已在 synthesisCompleted 中完成
                    } else {
                        const errorMsg = `语音合成取消:${result.errorDetails || 'Unknown error'}`
                        // clearTimeout(timeout)
                        synthesizer.close()
                        TTSAzureService.log.info('Error: ' + errorMsg)
                        reject(new Error(errorMsg))
                    }
                },
                // 错误处理
                (err: string): void => {
                    // clearTimeout(timeout)
                    synthesizer.close()
                    TTSAzureService.log.info('Error: ' + err)
                    reject(new Error(err))
                }
            )
        })
    }

    /**
     * HTTP 一次性合成（Azure Speech SDK REST）
     */
    public static async synthesizeHttp(text: string, voiceAttr: VoiceAttr): Promise<TTSHttpAudioResult | null> {
        const result = await this.synthesizeSpeech(text, voiceAttr)
        const audio = Buffer.from(result.audio, 'base64')
        return {
            audio,
            format: result.format,
            sampleRate: AZURE_TTS_SAMPLE_RATE,
            chunks: audio.length > 0 ? 1 : 0
        }
    }

    /**
     * Azure 无 HTTP+SSE，为空
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static async synthesizeHttpSse(
        _text: string,
        _voiceAttr: VoiceAttr,
        _handlers: TTSHttpSseHandlers
    ): Promise<TTSHttpSseResult | null> {
        return null
    }
}
/*

/!**
 * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice
 *!/
let ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
    <voice name="zh-CN-XiaomoNeural">
        女儿看见父亲走了进来，问道：
        <mstts:express-as role="YoungAdultFemale" style="calm">
            “您来的挺快的，怎么过来的？”
        </mstts:express-as>
        父亲放下手提包，说：
        <mstts:express-as role="OlderAdultMale" style="calm">
            “刚打车过来的，路上还挺顺畅。”
        </mstts:express-as>
    </voice>
</speak>
`
ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
    <voice name="zh-CN-XiaomoNeural">
        当下
    </voice>
</speak>
`
// 调用示例：将指定文本合成为语音
TTSAzureService.synthesizeSpeech('当下').then(audioData => console.log('Audio data:', audioData))
*/
