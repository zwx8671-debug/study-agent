/** @format */

import {
    AudioConfig,
    AudioInputStream,
    CancellationReason,
    PushAudioInputStream,
    ResultReason,
    SpeechRecognizer
} from 'microsoft-cognitiveservices-speech-sdk'
import { speechConfig } from './config-azure'
import { STTBaseService, STTState } from '../STTBaseService'
import { AudioFormatEnum } from '@interface/IAgent'
import { getLogger } from '@utils/Logger'

/**
 * Azure STT流服务实现
 * 实现STTBaseService抽象类定义的接口
 */
export class STTAzureStreamService extends STTBaseService {
    private pushStream?: PushAudioInputStream
    private audioConfig?: AudioConfig
    private speechRecognizer?: SpeechRecognizer
    private log = getLogger(STTAzureStreamService.name)

    constructor(uid: string) {
        super(uid)
        this.emit('created')
        this.setState(STTState.Created)
    }

    /**
     * 启动STT会话
     */
    public async start(format: AudioFormatEnum = AudioFormatEnum.PCM): Promise<STTBaseService> {
        if (this.getState() >= STTState.Starting) return this
        this.setState(STTState.Starting)
        this.emit('starting')

        // 创建音频流
        this.pushStream = AudioInputStream.createPushStream()
        this.audioConfig = AudioConfig.fromStreamInput(this.pushStream)
        // 语言不对的话，翻译一定错误，不指名的话默认英文
        speechConfig.speechRecognitionLanguage = 'zh-CN'
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
                    this.emit('started')
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
            this.pushStream.write(audioData.buffer as ArrayBuffer)
            this.emit('add')
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
        this.emit('closing')

        if (this.pushStream) {
            this.pushStream.close()
        }

        if (this.speechRecognizer) {
            await new Promise<void>((resolve, reject) => {
                // const timeout = setTimeout(() => {
                //     this.emit('disconnecting', this.uid)
                //     reject(new Error('STT close timeout: disconnecting took too long'))
                // }, 30000)
                //
                // const cleanup = () => {
                //     clearTimeout(timeout)
                // }

                if (this.speechRecognizer) {
                    // 监听会话取消
                    this.speechRecognizer.canceled = (s, e) => {
                        // 流异常
                        if (e.reason == CancellationReason.Error) {
                            this.emit('error', new Error(`CANCELED: ErrorDetails=${e.errorDetails}`))
                            this.log.error('【Azure】音频流异常。')
                            reject(e)
                        }
                        // 流结束
                        if (e.reason == CancellationReason.EndOfStream) {
                            this.log.info('【Azure】音频流已结束。')
                            resolve()
                        }

                        // cleanup()
                        this.speechRecognizer?.stopContinuousRecognitionAsync()
                    }
                    // 监听会话结束
                    this.speechRecognizer.sessionStopped = (s, e) => {
                        // cleanup()
                        resolve()
                        this.speechRecognizer?.stopContinuousRecognitionAsync()
                    }
                }
            })
        }
        this.setState(STTState.Closed)
        this.emit('closed')

        return this
    }

    public disconnect(): void {
        this.emit('disconnecting', this.uid)
        // cleanup()
        this.speechRecognizer?.stopContinuousRecognitionAsync()
        this.speechRecognizer?.close()
    }
}
