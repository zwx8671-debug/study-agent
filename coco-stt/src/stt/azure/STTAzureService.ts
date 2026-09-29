/** @format */

import {
    AudioConfig,
    CancellationDetails,
    CancellationReason,
    ResultReason,
    SpeechConfig,
    SpeechRecognizer
} from 'microsoft-cognitiveservices-speech-sdk'
import { SPEECH_KEY, SPEECH_REGION } from './config-azure'
import { STTHttpBaseService } from '../STTHttpBaseService'
import { getLogger } from '@utils/Logger'

const log = getLogger('STTAzureHttpService')

/**
 * Azure 非流式（一次性）语音识别服务
 * 继承 STTHttpBaseService，适用于 HTTP 接口场景。
 * 收到完整的 WAV 音频 Buffer 后，调用 Azure recognizeOnceAsync 完成识别。
 */
export class STTAzureHttpService extends STTHttpBaseService {
    /**
     * 一次性识别音频 Buffer
     * @param audio    WAV 格式音频 Buffer（需包含完整 WAV 文件头）
     * @param language 语言代码，默认 zh-CN
     * @returns 识别文字；无匹配时返回空字符串
     */
    public recognize(audio: Buffer, language: string = 'zh-CN'): Promise<string> {
        // 每次请求独立创建 SpeechConfig，避免并发请求间的语言设置互相覆盖
        const speechConfig: SpeechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
        speechConfig.speechRecognitionLanguage = language

        // 从内存 Buffer 创建音频配置（Azure SDK 接受含 WAV 头的 Buffer）
        const audioConfig: AudioConfig = AudioConfig.fromWavFileInput(audio)
        const recognizer: SpeechRecognizer = new SpeechRecognizer(speechConfig, audioConfig)

        log.info(`开始识别: language=${language}, audioSize=${audio.length} bytes`)

        return new Promise<string>((resolve, reject) => {
            recognizer.recognizeOnceAsync(
                result => {
                    // 识别完毕后立即释放资源
                    recognizer.close()

                    switch (result.reason) {
                        case ResultReason.RecognizedSpeech:
                            log.info(`识别成功: text="${result.text}"`)
                            resolve(result.text)
                            break

                        case ResultReason.NoMatch:
                            // 音频中未检测到语音，返回空字符串而非抛出异常
                            log.warn('未匹配到语音内容 (NoMatch)')
                            resolve('')
                            break

                        case ResultReason.Canceled: {
                            const cancellation: CancellationDetails = CancellationDetails.fromResult(result)
                            if (cancellation.reason === CancellationReason.Error) {
                                const errMsg = `Azure STT 取消(Error): code=${cancellation.ErrorCode}, details=${cancellation.errorDetails}`
                                log.error(errMsg)
                                reject(new Error(errMsg))
                            } else {
                                // EndOfStream 等非错误取消，返回空字符串
                                log.warn(`Azure STT 取消(非错误): reason=${cancellation.reason}`)
                                resolve('')
                            }
                            break
                        }

                        default:
                            log.warn(`未知识别结果: reason=${result.reason}`)
                            resolve('')
                    }
                },
                err => {
                    // SDK 内部错误回调
                    recognizer.close()
                    const errMsg = typeof err === 'string' ? err : String(err)
                    log.error(`Azure STT SDK 错误: ${errMsg}`)
                    reject(new Error(errMsg))
                }
            )
        })
    }
}
