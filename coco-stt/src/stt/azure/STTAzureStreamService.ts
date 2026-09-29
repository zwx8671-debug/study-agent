/** @format */

import {
    AudioConfig,
    AudioInputStream,
    CancellationReason,
    PushAudioInputStream,
    ResultReason,
    SpeechConfig,
    SpeechRecognizer
} from 'microsoft-cognitiveservices-speech-sdk'
import { SPEECH_KEY, SPEECH_REGION } from './config-azure'
import { STTBaseService, STTState } from '../STTBaseService'
import { AudioFormatEnum, STTStreamOptions } from '@interface/ISTT'
import { getLogger } from '@utils/Logger'

const AZURE_STT_CLOSE_TIMEOUT = 10000

/**
 * Azure STT流服务实现
 * 实现STTBaseService抽象类定义的接口
 */
export class STTAzureStreamService extends STTBaseService {
    private pushStream?: PushAudioInputStream
    private audioConfig?: AudioConfig
    private speechRecognizer?: SpeechRecognizer
    private log = getLogger(STTAzureStreamService.name)
    private options?: STTStreamOptions

    constructor(uid: string, options?: STTStreamOptions) {
        super(uid)
        this.options = options
        this.setState(STTState.Created)
    }

    /**
     * 启动STT会话
     */
    public async start(format: AudioFormatEnum = AudioFormatEnum.PCM): Promise<STTBaseService> {
        if (this.getState() >= STTState.Starting) return this
        this.setState(STTState.Starting)

        // 创建音频流
        this.pushStream = AudioInputStream.createPushStream()
        this.audioConfig = AudioConfig.fromStreamInput(this.pushStream)
        // 每会话独立 SpeechConfig，避免并发会话互相覆盖语言
        const speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
        speechConfig.speechRecognitionLanguage = this.options?.language || 'zh-CN'
        this.speechRecognizer = new SpeechRecognizer(speechConfig, this.audioConfig)

        // 绑定事件处理器
        this.speechRecognizer.recognized = (s, e) => {
            if (e.result.reason == ResultReason.RecognizedSpeech) {
                this.emit('data', e.result.text)
            } else if (e.result.reason == ResultReason.NoMatch) {
                // 不触发事件，因为没有匹配的文本
            }
        }

        // 开始连续识别
        await new Promise<void>((resolve, reject) => {
            this.speechRecognizer?.startContinuousRecognitionAsync(
                () => {
                    this.setState(STTState.Started)
                    resolve()
                },
                err => {
                    this.emit('error', new Error(err)) // 修复类型错误
                    reject(new Error(err)) // 修复类型错误
                }
            )
        })

        return this
    }

    /**
     * 推送音频数据进行STT转换
     * @param audioData 音频 Buffer 数据
     */
    public push(audioData: Buffer): void {
        if (!this.pushStream) {
            this.emit('error', new Error('STT service not started'))
            return
        }

        try {
            // Buffer 可能只是底层 ArrayBuffer 的一个切片，必须只发送有效区间。
            this.pushStream.write(Uint8Array.from(audioData).buffer)
        } catch (error) {
            this.emit('error', error as Error)
        }
    }

    /**
     * 关闭STT会话
     */
    public async close(): Promise<STTBaseService> {
        if (this.getState() >= STTState.Closing) return this
        this.setState(STTState.Closing)

        if (this.speechRecognizer) {
            await new Promise<void>((resolve, reject) => {
                let settled = false
                const finish = (error?: Error) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timeout)
                    error ? reject(error) : resolve()
                }

                const timeout = setTimeout(() => {
                    this.disconnect()
                    finish(new Error('Azure STT close timeout: session did not stop'))
                }, AZURE_STT_CLOSE_TIMEOUT)

                // 必须先监听结束事件，再关闭输入流，避免错过同步或快速到达的回调。
                this.speechRecognizer!.canceled = (_sender, event) => {
                    if (event.reason === CancellationReason.Error) {
                        const error = new Error(`CANCELED: ErrorDetails=${event.errorDetails}`)
                        this.emit('error', error)
                        this.log.error('【Azure】音频流异常。')
                        finish(error)
                        return
                    }
                    if (event.reason === CancellationReason.EndOfStream) {
                        this.log.info('【Azure】音频流已结束。')
                        finish()
                    }
                }
                this.speechRecognizer!.sessionStopped = () => finish()
                this.pushStream?.close()
            })
        }

        this.speechRecognizer?.stopContinuousRecognitionAsync()
        this.speechRecognizer?.close()
        this.speechRecognizer = undefined
        this.pushStream = undefined
        this.audioConfig = undefined
        this.setState(STTState.Closed)

        return this
    }

    public disconnect(): void {
        this.setState(STTState.Closed)
        this.pushStream?.close()
        this.speechRecognizer?.stopContinuousRecognitionAsync()
        this.speechRecognizer?.close()
        this.speechRecognizer = undefined
        this.pushStream = undefined
        this.audioConfig = undefined
    }
}
