/** @format */

import { ResultReason, SpeechSynthesisResult, SpeechSynthesizer } from 'microsoft-cognitiveservices-speech-sdk'
import { PullAudioOutputStreamImpl } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/sdk/Audio/AudioOutputStream'
import {
    AZURE_DEFAULT_LANGUAGE,
    AZURE_DEFAULT_LOUDNESS_RATE,
    AZURE_DEFAULT_SPEECH_RATE,
    AZURE_TTS_SAMPLE_RATE,
    AZURE_VOICE_TTS_DEFAULT_SPEAKER,
    speechConfig
} from './config-azure'
import { getLogger } from '@utils/Logger' // 导入基础TTS服务
import { TTSBaseService, TTSState, WS_TIMEOUT } from '../TTSBaseService'
import { env } from '@config/env'
import { saveDebugWav } from '@utils/pcmToWav'
import { buildSsml } from '@utils/ssml'

/**
 * TTSAzureStreamService 类用于通过 Azure Cognitive Services 的语音 SDK 实现文本转语音（TTS）功能。
 * 该类封装了语音合成的核心逻辑，支持通过环境变量配置密钥、区域和自定义终结点。
 */
export class TTSAzureStreamService extends TTSBaseService {
    log = getLogger(TTSAzureStreamService.name)
    private synthesizer?: SpeechSynthesizer
    private pullStream?: PullAudioOutputStreamImpl
    // 句子缓冲区，用于累积文本直到形成完整句子
    private sentenceBuffer: string = ''
    // 句子列表，用于保存完整句子
    private sentenceArr: string[] = []
    // 当前正在处理的句子索引
    private currentSentenceIndex: number = 0
    // TTS生命周期的索引
    private ttsIndex: number = 0
    // 是否还有句子
    private noSentence: boolean = false
    // 语言参数
    private language: string = AZURE_DEFAULT_LANGUAGE
    // 语速参数
    private speechRate: string = '0%'
    // 音量参数
    private loudnessRate: string = '0%'
    // 情绪参数
    private emotion: string = ''
    // 音色参数
    private speaker: string = AZURE_VOICE_TTS_DEFAULT_SPEAKER

    constructor(uid: string) {
        // Azure TTS 不需要 resource ID，所以传入空字符串
        super(uid, '')
        this.log.info(`【AZURE】TTSAzureStreamService init: ${this.uid} ${this.resourceId}`)
    }

    public override getSampleRate(): number {
        return AZURE_TTS_SAMPLE_RATE
    }

    /**
     * 建立连接（Azure TTS 不需要显式连接，这里为空实现）
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async connect(resourceId?: string): Promise<void> {
        this.setState(TTSState.Connected)
        this.emit('connected', this.uid, this.resourceId)
    }

    /**
     * 断开连接（Azure TTS 不需要显式断开，这里为空实现）
     */
    public async disconnect(): Promise<void> {
        this.cleanResource()
        this.emit('disconnected', this.uid, this.resourceId, 0, 'disconnected')
    }

    /**
     * 清理资源
     * @private
     */
    private cleanResource() {
        // check TTS state
        const state = this.getState()
        if (state === TTSState.Disconnecting || state === TTSState.Disconnected) return

        this.setState(TTSState.Disconnecting)
        this.emit('disconnecting')

        // 清理pullStream
        this.synthesizer = undefined
        this.pullStream = undefined

        // 清空句子缓冲区
        this.sentenceBuffer = ''
        this.sentenceArr = []
        this.currentSentenceIndex = 0
        this.noSentence = true // 确保循环会退出
        this.setState(TTSState.Disconnected)
    }

    /**
     * 中断当前会话
     */
    public interrupt(): void {
        this.cleanResource()
        this.emit('disconnected', this.uid, this.resourceId, 0, 'interrupted')
    }

    /**
     * 启动TTS会话（Azure TTS 为一次性文本输入，这里做初始化工作）
     */
    public async start(
        sessionId: string,
        speaker?: string,
        emotion?: string,
        language?: string,
        loudness_rate?: string,
        speech_rate?: string
    ): Promise<string> {
        this.log.info(
            `【AZURE-START】Azure TTS start: ${this.uid} ${speaker} ${emotion} ${loudness_rate} ${speech_rate}`
        )
        // 如果会话已启动，抛出错误
        const state = this.getState()
        if (state === TTSState.Started) {
            this.log.errorMsg(`TTS session[${sessionId}] already started`)
            return sessionId
        }
        // 保存参数
        this.speaker = speaker || AZURE_VOICE_TTS_DEFAULT_SPEAKER
        this.emotion = emotion || ''
        this.loudnessRate = loudness_rate || AZURE_DEFAULT_LOUDNESS_RATE
        this.speechRate = speech_rate || AZURE_DEFAULT_SPEECH_RATE
        this.language = language || AZURE_DEFAULT_LANGUAGE

        // 初始化句子处理状态
        this.sentenceBuffer = ''
        this.currentSentenceIndex = 0
        this.sentenceArr = []
        this.noSentence = false

        this.setState(TTSState.Started)
        this.emit('started', sessionId, speaker || AZURE_VOICE_TTS_DEFAULT_SPEAKER)

        // 启动消息循环
        this.loop(sessionId).catch(e => {
            this.log.info('Azure语音合成错误：', e)
        })
        return sessionId
    }

    /**
     * 关闭TTS会话
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async close(sessionId: string): Promise<void> {
        this.log.info(`【AZURE-关闭】Azure TTS close: ${this.uid} ${sessionId} `)
        const state = this.getState()
        if (state === TTSState.Closed || state === TTSState.Closing) return

        this.emit('closing') // 触发正在关闭事件
        this.setState(TTSState.Closing) // 更新状态

        // 将剩余的句子加入句子列表
        if (this.sentenceBuffer.length > 0) {
            this.sentenceArr.push(this.sentenceBuffer)
            // 清空缓冲区
            this.sentenceBuffer = ''
        }
        // 发送会话关闭请求
        this.noSentence = true

        // 等待关闭事件 or 超时
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                // if (timeout) clearTimeout(timeout)
                this.off('closed', onClose)
                this.off('error', onError)
            }
            const onClose = () => {
                cleanup()
                resolve()
            }
            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }
            // 超时时间，所有的句子处理预期时间
            // const timeout = setTimeout(
            //     () => {
            //         cleanup()
            //         // 即使超时也resolve，避免阻塞
            //         resolve()
            //         this.log.warn('Timeout waiting for TTS session to close, but continuing')
            //     },
            //     WS_TIMEOUT * 3 + this.sentenceArr.join('').length * 50
            // )

            this.once('closed', onClose).once('error', onError)
        })
        this.setState(TTSState.Closed) // 更新状态为已关闭
    }

    /**
     * 消息循环处理函数
     * @param sessionId
     * @private
     */
    private async loop(sessionId: string): Promise<void> {
        this.log.info(`【AZURE-loop】Azure TTS loop: ${this.uid} ${sessionId} `)
        const time = new Date().getTime()
        try {
            // 等待没有句子可处理
            while (this.getState() === TTSState.Started || this.getState() === TTSState.Closing) {
                // 处理所有可用的句子
                while (this.sentenceArr.length > this.currentSentenceIndex) {
                    const sentence = this.sentenceArr[this.currentSentenceIndex]
                    if (sentence) {
                        try {
                            await this.speakTextAsync(sentence, sessionId + this.currentSentenceIndex)
                        } catch (error) {
                            this.log.error('Error speaking sentence:', error)
                            // 即使出错（没有按规定时间返回）也继续处理下一个句子
                        }
                    }
                    // 增加索引
                    this.currentSentenceIndex++
                    this.ttsIndex++
                }

                // 如果没有更多句子且会话正在关闭，则退出循环
                if (this.noSentence && this.getState() === TTSState.Closing) {
                    break
                }

                // 等待一小段时间或直到有新数据
                await new Promise<void>(resolve => {
                    const timeout = setTimeout(() => {
                        this.off('addSentence')
                        resolve()
                    }, 200)
                    this.once('addSentence', () => {
                        clearTimeout(timeout)
                        resolve()
                    })
                })
            }

            // 循环处理剩余的句子
            while (this.sentenceArr.length > this.currentSentenceIndex) {
                const sentence = this.sentenceArr[this.currentSentenceIndex]
                if (sentence) {
                    try {
                        await this.speakTextAsync(sentence, sessionId + this.currentSentenceIndex)
                    } catch (error) {
                        this.log.error('Error speaking sentence:', error)
                    }
                }
                // 增加索引
                this.currentSentenceIndex++
                this.ttsIndex++
            }
        } catch (error) {
            this.log.error('Error in loop:', error)
        } finally {
            // 确保总是触发关闭事件
            try {
                const completeSentence = this.sentenceArr.join('')
                this.log.warn(
                    `【TTS生命周期时间】:  ${sessionId} ${new Date().getTime() - time}ms，预期时间：${WS_TIMEOUT * 3 + completeSentence.length * 50}ms`
                )
                this.emit('closed', sessionId)
            } catch (error) {
                this.log.error('Error emitting closed event:', error)
            }
        }
    }

    /**
     * LLM生成的文本是一个一个的字或词，Azure是一次性输入文本，然后流式输出音频。
     * push方法需要判断push的text是否可以组成一个句子，是一个句子时，才进行合成。
     * 注意：speakTextAsync：合成的时候句子和句子之间有严格顺序，必须等到前面句子合成完了才进行新的句子合成
     *
     * @param sessionId
     * @param text - 需要进行语音合成的文本内容。
     * @returns 返回一个 Promise，在合成完成时解析，出错时拒绝。
     */
    public async push(sessionId: string, text: string): Promise<void> {
        // 如果会话未启动，抛出错误
        const state = this.getState()
        if (state !== TTSState.Started) {
            this.emit('error', new Error(`TTS session[${sessionId}] not started`))
            return
        }

        // 累积文本到缓冲区
        this.sentenceBuffer += text

        // 检查缓冲区是否包含完整句子（以标点符号结尾）
        const sentences = this.extractCompleteSentences()

        // 如果有完整句子，添加到句子数组中并尝试处理
        if (sentences.length > 0) {
            this.log.info('Azure sentenceBuffer 句子：', text, this.sentenceBuffer, this.sentenceArr)
            this.sentenceArr.push(...sentences)
            this.emit('addSentence')
        }
    }

    /**
     * 从缓冲区中提取完整句子
     * @returns 完整句子数组
     */
    private extractCompleteSentences(): string[] {
        // 如果缓冲区为空，直接返回空数组
        if (!this.sentenceBuffer) return []

        const sentenceEndings = /[。！？；.!?;]/g
        const sentences: string[] = []
        let lastIndex = 0

        // 查找所有标点符号位置
        let match: RegExpExecArray | null
        // 重置正则表达式的lastIndex，确保从头开始匹配
        sentenceEndings.lastIndex = 0
        while ((match = sentenceEndings.exec(this.sentenceBuffer)) !== null) {
            // 检查这个标点符号是否是小数点
            const isDecimalPoint = this.isDecimalPoint(this.sentenceBuffer, match.index)

            if (!isDecimalPoint) {
                // 包含标点符号的句子（如果不是小数点）
                const sentence = this.sentenceBuffer.substring(lastIndex, match.index + 1)
                // 只添加非空句子、也除去单独一个表单符号 例如句子是：‘？’，这个问号会去除
                if (sentence.trim().length > 1) {
                    sentences.push(sentence)
                }
                lastIndex = match.index + 1
            }
        }

        // 保留最后一个不完整的句子在缓冲区中
        this.sentenceBuffer = this.sentenceBuffer.substring(lastIndex)

        return sentences
    }

    /**
     * 判断指定位置的点号是否是小数点
     * @param text 文本内容
     * @param index 点号位置
     * @returns 是否为小数点
     */
    private isDecimalPoint(text: string, index: number): boolean {
        // 只对点号进行检查
        if (text[index] !== '.') {
            return false
        }

        // 检查前后字符是否为数字
        const prevChar = text[index - 1] || ''
        const nextChar = text[index + 1] || ''

        const isPrevDigit = /\d/.test(prevChar)
        const isNextDigit = /\d/.test(nextChar)

        // 如果前后都是数字，则认为是小数点
        return isPrevDigit && isNextDigit
    }

    /**
     * 将文本转为语音
     * 每个句子进行一次 SpeechSynthesizer 实例化
     * @param sentence 句子
     * @param sessionId 语音会话ID+句子索引
     */
    public async speakTextAsync(sentence: string, sessionId: string): Promise<void> {
        // 输出格式统一由 config-azure 设定为 Raw16Khz16BitMonoPcm，
        // 与 getSampleRate() 及端侧期望的 16kHz 保持一致，切勿在此覆写
        this.synthesizer = new SpeechSynthesizer(speechConfig)

        this.pullStream = PullAudioOutputStreamImpl.createPullStream() as PullAudioOutputStreamImpl
        const time = new Date().getTime()

        return new Promise<void>((resolve, reject) => {
            if (this.synthesizer) {
                // 合成开始处理 事件方法重写
                this.synthesizer.synthesisStarted = () => {
                    // 循环处理音频数据 数据推送到 端侧 中
                    this.singleSentenceLoop(sessionId)
                        .then(() => {
                            this.log.info(
                                `Azure 单句 TTS time: ${new Date().getTime() - time}ms，预期时间：${WS_TIMEOUT + sentence.length * 50}ms，句子是：${sentence}`
                            )
                            this.synthesizer?.close()
                            resolve()
                        })
                        .catch(err => {
                            this.log.error('Error in singleSentenceLoop:', err)
                        })
                }
            }
            // // 设置超时处理
            // const timeout = setTimeout(
            //     () => {
            //         this.log.warn('Azure TTS synthesis timeout')
            //         // 不要在这里关闭synthesizer，让它自然完成
            //         reject(new Error('TTS synthesis timeout'))
            //     },
            //     WS_TIMEOUT + sentence.length * 50
            // ) // 动态超时时间

            const ssml = buildSsml(
                sentence,
                this.speaker,
                this.language,
                this.speechRate,
                this.loudnessRate,
            )

            this.synthesizer?.speakSsmlAsync(
                ssml,
                // 合成完成处理
                (result: SpeechSynthesisResult) => {
                    // clearTimeout(timeout)
                    if (result.reason === ResultReason.SynthesizingAudioCompleted) {
                        this.log.info(
                            '【synthesisCompleted】完成合成',
                            `speaker[${this.speaker}]，emotion[${this.emotion}], speech_rate[${this.speechRate}], loudness_rate[${this.loudnessRate}]`
                        )
                    } else {
                        const errorMsg = `语音合成取消:${result.errorDetails || 'Unknown error'}\n检查你是否使用有效的 Azure 语音终结点或提供的 SPEECH_REGION 是否与你的语音资源匹配。`
                        this.log.info('Error: ' + errorMsg)
                        reject(new Error(errorMsg))
                    }
                },
                // 错误处理
                (err: string) => {
                    // clearTimeout(timeout)
                    this.log.info('Error: ' + err)
                    reject(new Error(err))
                },
                this.pullStream
            )
        })
    }

    /**
     * 处理音频数据并触发data事件返回数据给端侧
     */
    private async singleSentenceLoop(sessionId: string): Promise<void> {
        // 检查pullStream是否存在
        if (!this.pullStream) {
            this.log.warn('pullStream is undefined in singleSentenceLoop')
            return
        }

        // 创建一个数组来存储当前sessionId的音频数据
        const audioBuffers: Buffer[] = []

        let fistChunk = true
        const date = new Date().getTime()
        try {
            // 添加一个标志来检查pullStream是否仍然有效
            while (this.pullStream && !this.pullStream.isClosed) {
                const dataBuffer: ArrayBuffer = new ArrayBuffer(6 * 1024)
                const read = await this.pullStream.read(dataBuffer)
                if (read > 0) {
                    if (fistChunk) {
                        this.log.warn(`首个 6kb 数据 返回耗时：${new Date().getTime() - date}ms`)
                        fistChunk = false
                    }
                    // 将读取的数据添加到数组中
                    const buffer = Buffer.from(dataBuffer.slice(0, read))
                    if (env.SAVE_PCM) {
                        audioBuffers.push(buffer)
                    }
                    // 触发data事件，流式输出
                    this.emit('data', buffer)
                } else {
                    // 如果没有读取到数据，短暂等待
                    await new Promise(resolve => setTimeout(resolve, 10))
                }
            }
        } catch (error) {
            this.log.error('Error in singleSentenceLoop:', error)
        }

        // SAVE_PCM 开启时，把本句音频落盘便于试听排查
        const wavFilename = `${this.ttsIndex}.${sessionId}.${this.speaker}.${this.emotion}.${this.speechRate}.${this.loudnessRate}.wav`
        saveDebugWav(Buffer.concat(audioBuffers), wavFilename, AZURE_TTS_SAMPLE_RATE)
    }
}
