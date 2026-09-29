/** @format */
import WebSocket from 'ws'
// 导入协议相关的事件类型和函数
import { EventType, finishSession, MsgType, receiveMessage, startSession, taskRequest } from './protocol'
// 导入配置常量
import {
    VOICE_TTS_ACCESS_TOKEN,
    VOICE_TTS_API,
    VOICE_TTS_APP_ID,
    VOICE_TTS_DEFAULT_EMOTION,
    VOICE_TTS_DEFAULT_LOUDNESS_RATE,
    VOICE_TTS_DEFAULT_SPEECH_RATE,
    VOICE_TTS_FORMAT,
    VOICE_TTS_RESOURCE_ID,
    VOICE_TTS_SAMPLE_RATE,
    VOLC_VOICE_TTS_DEFAULT_SPEAKER
} from './config-volcengine'
// 导入工具函数
import $ from '@utils/util'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import type { IncomingMessage } from 'http'
// 导入基础TTS服务
import { TTSBaseService, TTSState, WS_TIMEOUT } from '../TTSBaseService'
import { AZURE_DEFAULT_LANGUAGE } from '../azure/config-azure'
import { saveDebugWav } from '@utils/pcmToWav'

// TTS类，继承自TTSBaseService以支持统一接口
export class TTSVolcengineStreamService extends TTSBaseService {
    private ws?: WebSocket // WebSocket连接实例
    private log = getLogger(TTSVolcengineStreamService.name)

    // 构造函数，初始化TTS实例
    constructor(uid: string) {
        super(uid, VOICE_TTS_RESOURCE_ID)
        this.ws = undefined

        this.log.infoMsg(`【火山】TTSVolcengineStreamService init: ${this.uid} ${this.resourceId}`)
    }

    public override getAudioFormat(): string {
        return VOICE_TTS_FORMAT
    }

    public override getSampleRate(): number {
        return VOICE_TTS_SAMPLE_RATE
    }

    /**
     * 建立WebSocket连接，语音合成大模型-字符版，最多10个并发
     * https://console.volcengine.com/speech/service/10007?AppID=6589383180
     * @param resourceId
     */
    public async connect(resourceId?: string): Promise<void> {
        // 如果已有WebSocket连接
        if (this.ws) {
            // 如果连接已打开
            if (this.ws.readyState === WebSocket.OPEN) {
                // 如果资源ID未改变或未指定，返回现有连接
                if (!resourceId || this.resourceId === resourceId) return
                // 如果资源ID改变，关闭现有连接
                else await this.disconnect()
            } else {
                const old = this.ws
                this.ws = undefined
                old.removeAllListeners()
                if (old.readyState < WebSocket.CLOSING) old.terminate()
            }
        }

        // 如果指定了资源ID，则更新
        if (resourceId) this.resourceId = resourceId

        // 创建新的WebSocket连接
        this.ws = new WebSocket(VOICE_TTS_API, {
            headers: {
                'X-Api-App-Key': VOICE_TTS_APP_ID, // 应用ID
                'X-Api-Access-Key': VOICE_TTS_ACCESS_TOKEN, // 访问令牌
                'X-Api-Resource-Id': this.resourceId, // 资源ID
                'X-Api-Connect-Id': Date.now().toString() // 连接ID
            },
            // 添加超时配置
            handshakeTimeout: WS_TIMEOUT
        })

        // 添加全局错误处理器，防止未捕获的错误导致进程崩溃
        this.ws.on('error', (error: Error) => {
            this.log.errorMsg(`WebSocket error for uid ${this.uid}:`, { errorMsg: error })
            this.emit('error', error)
        })

        // 更新状态为连接中
        this.setState(TTSState.Connecting)
        // 触发连接中事件
        this.emit('connecting')

        // 等待连接建立或出错，或超时
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                // clear timeout
                if (timeout) clearTimeout(timeout)
                // remove listeners
                this.ws?.off('open', onResolve)
                this.ws?.off('error', onError)
                this.ws?.off('close', onClose)
                this.ws?.off('unexpected-response', onUnexpected)
            }
            const onResolve = () => {
                cleanup()
                resolve()
            }
            const onError = (e: Error) => {
                cleanup()
                this.log.errorMsg(`WebSocket connection error for uid ${this.uid}:`, { errorMsg: e.message })
                reject(new Error(`WebSocket connection failed: ${e.message}`))
            }
            const onClose = (code: number, reason: Buffer) => {
                cleanup()
                reject(new Error(`WebSocket closed during handshake: ${code} ${reason.toString()}`))
            }
            const onUnexpected = (_: WebSocket, res: IncomingMessage) => {
                cleanup()
                let body = ''
                res.setEncoding('utf8')
                res.on('data', c => (body += c))
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body || res.statusMessage}`)))
                res.on('error', reject)
            }
            const timeout = setTimeout(() => {
                cleanup()
                this.log.warnMsg(`WebSocket connection timeout for uid ${this.uid} after ${WS_TIMEOUT}ms`)
                // 强制关闭 WebSocket 连接
                if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
                    this.ws.terminate()
                }
                reject(new Error(`WebSocket connection timeout after ${WS_TIMEOUT}ms`))
            }, WS_TIMEOUT)

            this.ws?.once('open', onResolve)
            this.ws?.once('error', onError)
            this.ws?.once('unexpected-response', onUnexpected)
            this.ws?.once('close', onClose)
        })

        // 更新状态为已连接
        this.setState(TTSState.Connected)
        this.ws.on('close', (code: number, reason: Buffer) => {
            const state = this.getState()
            if (state === TTSState.Disconnecting || state === TTSState.Disconnected) return
            this.ws = undefined
            this.setState(TTSState.Disconnected)
            this.log.warnMsg(`火山上游 WebSocket 已断开: code=${code} reason=${reason.toString() || 'closed'}`)
            if (state === TTSState.Started || state === TTSState.Closing) {
                this.emit('error', new Error(`火山上游 WebSocket 已断开: ${code} ${reason.toString() || 'closed'}`))
            }
            this.emit('disconnected', this.uid, this.resourceId, code, reason.toString() || 'closed')
        })
        // 触发已连接事件
        this.emit('connected', this.uid, this.resourceId)
    }

    /**
     * WebSocket close 链接
     *
     * close() 方法
     * 优雅关闭：发送关闭帧给对方，等待对方确认后再关闭连接
     * 双向通信：确保双方都知道连接正在关闭
     * 数据完整性：允许在关闭前处理完缓冲区中的数据
     * 状态转换：将连接状态设置为 CLOSING，然后是 CLOSED
     * terminate() 方法
     * 强制关闭：立即断开连接，不发送关闭帧
     * 单方面断开：不等待对方响应或确认
     * 快速释放：立即释放相关资源
     * 状态转换：直接将连接状态设置为 CLOSED
     */
    public async disconnect(): Promise<void> {
        // check websocket state
        if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) {
            return
        }
        // check TTS state
        const state = this.getState()
        if (state === TTSState.Disconnecting || state === TTSState.Disconnected) {
            return
        }

        // 清理资源
        this.setState(TTSState.Disconnecting)
        this.emit('disconnecting')
        this.ws.close()
        const { code, reason } = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
            const cleanup = () => {
                if (timeout) clearTimeout(timeout)
                this.ws?.off('close', onClose)
                this.ws?.off('error', onError)
            }

            // timeout 处理
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error('Timeout waiting for WebSocket to close'))
            }, WS_TIMEOUT)

            const onClose = (code: number, reason: Buffer) => {
                cleanup()
                resolve({ code, reason: reason.toString() })
            }

            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }

            this.ws?.once('close', onClose)
            this.ws?.once('error', onError)
        })

        // 正常关闭
        this.ws?.removeAllListeners()
        this.ws = undefined
        this.setState(TTSState.Disconnected)
        this.emit('disconnected', this.uid, this.resourceId, code, reason)
    }

    /**
     * WebSocket terminate 链接
     * interrupt 是强制中断，不需要等待优雅关闭
     */
    public interrupt(): void {
        // check websocket state
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.ws = undefined
            return
        }
        // check TTS state
        const state = this.getState()
        if (state === TTSState.Disconnected) {
            this.ws = undefined
            return
        }

        // 保存 WebSocket 引用
        const ws = this.ws
        // 立即释放引用，防止重入
        this.ws = undefined

        // ✅ 修复：监听 close 事件后清理，让 terminate() 完成其内部逻辑
        ws.once('close', () => {
            // close 事件触发后，清理所有监听器
            ws.removeAllListeners()
        })

        // 强制关闭连接（会触发 close 事件）
        ws.terminate()

        this.setState(TTSState.Disconnected)
        this.emit('disconnected', this.uid, this.resourceId, 0, 'interrupted')
    }

    // 启动TTS会话
    public async start(
        sessionId: string,
        speaker: string = VOLC_VOICE_TTS_DEFAULT_SPEAKER, // 发音人
        emotion: string = VOICE_TTS_DEFAULT_EMOTION,
        // 火山语音自动识别语言
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        language: string = AZURE_DEFAULT_LANGUAGE,
        loudness_rate: string = VOICE_TTS_DEFAULT_LOUDNESS_RATE,
        speech_rate: string = VOICE_TTS_DEFAULT_SPEECH_RATE
    ): Promise<string> {
        // 如果会话已启动，抛出错误
        const state = this.getState()
        if (state === TTSState.Started) {
            this.log.errorMsg(`TTS session[${sessionId}] already started`)
            return sessionId
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log.warnMsg('火山上游 WebSocket 未就绪，先重连再开会话')
            await this.connect()
        }

        // 构建请求参数
        const request = {
            user: { uid: this.uid }, // 用户信息
            req_params: {
                speaker, // 发音人
                audio_params: {
                    // 音频格式
                    format: VOICE_TTS_FORMAT,
                    // 采样率
                    sample_rate: VOICE_TTS_SAMPLE_RATE,
                    // 设置音色的情感。示例："emotion": "angry"
                    // 注：当前仅部分音色支持设置情感，且不同音色支持的情感范围存在不同。
                    // 详见：大模型语音合成API-音色列表-多情感音色 https://www.volcengine.com/docs/6561/1257544
                    emotion,
                    // 语速，取值范围[-50,100]，100 代表2.0倍速，-50 代表0.5倍数
                    speech_rate: Number(speech_rate),
                    loudness_rate: Number(loudness_rate),
                    // 启用时间戳
                    enable_timestamp: true
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
        }

        // 发送开始会话请求
        await startSession(
            this.ws!,
            new TextEncoder().encode($.stringify({ ...request, event: EventType.StartSession })),
            sessionId
        )
        this.setState(TTSState.Started) // 更新状态
        this.emit('started', sessionId, speaker) // 触发已开始事件

        // 启动消息循环
        this.loop(sessionId).catch(error => {
            this.log.error('VolcEngine语音合成错误：', error)
        })
        return sessionId // 返回会话ID
    }

    /**
     * 关闭TTS会话
     * @param sessionId
     */
    public async close(sessionId: string): Promise<void> {
        // 如果会话未启动，抛出错误
        const state = this.getState()
        if (state === TTSState.Closed || state === TTSState.Closing) return
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log.errorMsg(`sessionId[${sessionId}] TTS WebSocket connection not open`)
            return
        }
        if (state !== TTSState.Started) {
            this.log.errorMsg(`sessionId[${sessionId}] TTS session not started`)
            return
        }

        this.emit('closing') // 触发正在关闭事件
        this.setState(TTSState.Closing) // 更新状态

        // 发送关闭会话请求
        await finishSession(this.ws, sessionId)
        // 等待关闭事件 or 超时
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                if (timeout) clearTimeout(timeout)
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
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error('Timeout waiting for TTS session to close'))
            }, WS_TIMEOUT * 3)

            this.once('closed', onClose).once('error', onError)
        })
        this.setState(TTSState.Closed) // 更新状态为已关闭
    }

    // 消息循环处理函数
    public async loop(sessionId: string): Promise<void> {
        if (!this.ws) return

        // SAVE_PCM 调试开关开启时，累积当前 sessionId 的音频用于落盘
        const audioBuffers: Buffer[] = []
        while (this.getState() === TTSState.Started || this.getState() === TTSState.Closing) {
            try {
                // 等待新消息
                const msg = await receiveMessage(this.ws)
                switch (msg.type) {
                    case MsgType.FullServerResponse:
                        // 完整服务器响应，暂不处理
                        break
                    case MsgType.AudioOnlyServer: {
                        // 纯音频数据，触发数据事件
                        const audioBuffer = Buffer.from(msg.payload)
                        this.emit('data', audioBuffer)

                        if (env.SAVE_PCM) {
                            audioBuffers.push(audioBuffer)
                        }
                        break
                    }
                    case MsgType.FullClientRequest: {
                        this.log.info(`MsgType.FullClientRequest: `, msg)
                        break
                    }
                    case MsgType.Invalid: {
                        // 纯音频数据，触发数据事件
                        this.log.info(`MsgType.Invalid: `, msg.toString())
                        break
                    }
                    case MsgType.FrontEndResultServer: {
                        // 纯音频数据，触发数据事件
                        throw new Error(`Error message type[${msg.type}]: ${msg.toString()}`)
                    }
                    default: {
                        throw new Error(`Unknown message type[${msg.type}]: ${msg.toString()}`)
                    }
                }
                // 如果是会话结束事件，跳出循环（SAVE_PCM 开启时顺带落盘）
                if (msg.event === EventType.SessionFinished) {
                    saveDebugWav(Buffer.concat(audioBuffers), `${sessionId}.wav`, VOICE_TTS_SAMPLE_RATE)
                    break
                }
            } catch (e) {
                this.log.error('Error processing message in TTS loop:', e)
                // 在消息处理出错时触发错误事件
                this.emit('error', e as Error)
                break
            }
        }
        this.emit('closed', sessionId) // 触发已关闭事件
    }

    // 推送文本进行TTS转换
    public async push(sessionId: string, text: string): Promise<void> {
        // 检查WebSocket连接状态
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit('error', new Error('TTS WebSocket connection not open'))
            return
        }

        // 如果会话未启动，抛出错误
        const state = this.getState()
        if (state !== TTSState.Started) {
            this.emit('error', new Error('TTS session not started'))
            return
        }

        // 构建请求参数
        const request = {
            user: { uid: this.uid }, // 用户信息
            req_params: {
                audio_params: {
                    // 音频格式
                    format: VOICE_TTS_FORMAT,
                    // 采样率
                    sample_rate: VOICE_TTS_SAMPLE_RATE,

                    // 启用时间戳
                    enable_timestamp: true
                },
                additions: $.stringify({ disable_markdown_filter: false }) // 附加参数
            }
        }
        // 发送任务请求
        await taskRequest(
            this.ws,
            new TextEncoder().encode(
                $.stringify({
                    ...request,
                    req_params: { ...request.req_params, text }, // 添加文本参数
                    event: EventType.TaskRequest // 任务请求事件
                })
            ),
            sessionId
        )
    }

    // 根据发音人获取对应的资源ID
    private VoiceToResourceId(voice: string): string {
        if (voice.startsWith('S_')) return 'volc.megatts.default' // 默认资源ID
        return 'volc.service_type.10029' // 特定服务类型资源ID
    }
}
