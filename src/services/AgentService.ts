/** @format */

import { Inject, Service } from 'fastify-decorators'
import { PassThrough, Readable } from 'stream'
import { ChatMessage, ChatModelProvider, ChatRoleEnum } from 'uniai'
import {
    AudioFlag,
    ChatRequest,
    ChatSystemResponse,
    FuncToken,
    Image,
    ImageFormatEnum,
    Pattern,
    RequestEvent,
    ResponseEvent,
    ResponseFlag,
    StateData
} from '@interface/IAgent'
import { ChatBuffer, ChatSession } from '@service/dto/IAgent.dto'
import { Shell } from '../libs/xml/Shell'
import { promptManager, PromptManager } from '../libs/xml/PromptManager'
import { lockManager, LockManager } from '@utils/LockManager'
import { getLogger, type Logger } from '@utils/Logger'
import ai from '@utils/uniai'
import $ from '@utils/util'
import { MockLLMService } from '../libs/voice/mock/MockLLMService'
// 小型提示词服务
// 向量匹配服务
import { v7 } from 'uuid'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import PomAgentService from '@service/PomAgentService'
import { VectorMatcherService } from '@service/agent/VectorMatcherService'
import { TTSFactory } from '../libs/voice/TTSFactory'
import { STTFactory } from '../libs/voice/STTFactory'
import { agentChatConcurrentDec, agentChatConcurrentInc } from '../prometheus/metrics'
import { TTSBaseService } from '../libs/voice/TTSBaseService'
import { VOICE_TTS_FORMAT, VOICE_TTS_SAMPLE_RATE } from '../libs/voice/volcengine/config-volcengine'
import { DeviceFaceService } from '@service/DeviceFaceService'
import { DeviceStateRedisService } from '@service/redis/DeviceStateRedisService'
import { Step, traceContext } from '@utils/TraceContext'
import { XmlElementType } from '../libs/xml/XmlElement'
import { conversationMessagesHttpdao } from '@httpdao/cocoadmin/ConversationMessagesHttpdao'
import { PomAgentWithDialogsVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { AgentTrigger } from '@service/agent/AgentTrigger'
import { AgentPrompt } from '@service/agent/AgentPrompt'
import {
    AudioResponse,
    AuthType,
    CoCoNamespace,
    SpacePullAESKeyNotify,
    SpaceUserInfoSyncMessage,
    SpaceUserInfoSyncNotifyEvent
} from '@interface/ICommon'
import { env } from '@config/env'
import { Buffer } from 'buffer'
import { deviceFamilyHttpdao } from '@httpdao/cocoadmin/DeviceFamilyHttpdao'
import { spaceHttpdao } from '@httpdao/cocoadmin/SpaceHttpdao'

/**
 * Agent 服务类
 * 负责处理设备与AI的对话交互，包括多模态输入处理、会话管理、消息存储等
 */
@Service()
export default class AgentService {
    /**
     * 聊天缓冲区映射，key为设备ID，value为缓冲区数据
     * 没有做锁，是因为当为一个特性，多个窗口可以合并输入
     * */
    private buffer: Map<string, ChatBuffer> = new Map()
    /**
     * 锁管理器，用于控制会话并发
     */
    private lockManager: LockManager = lockManager
    /** Prompt 管理器，用于管理AI提示词 */
    private promptManager: PromptManager = promptManager
    /** 向量匹配器，用于处理语音转文本的向量匹配 */
    @Inject(VectorMatcherService)
    private vectorMatcher!: VectorMatcherService
    @Inject(PomAgentService)
    private pomAgentService!: PomAgentService
    @Inject(AgentTrigger)
    private agentTrigger!: AgentTrigger
    @Inject(AgentPrompt)
    private agentPrompt!: AgentPrompt
    @Inject(DeviceFaceService)
    private deviceFaceService!: DeviceFaceService
    @Inject(DeviceStateRedisService)
    private deviceState!: DeviceStateRedisService
    /** 日志记录器 */
    private log: Logger = getLogger(AgentService.name)

    /**
     * 统一输入处理方法
     * 支持多模态输入（文本、音频、图片），协调各个处理方法
     * @param req 聊天请求对象
     * @param deviceSN 设备序列号
     * @param productId 鉴权信息拿来的productId
     * @returns 处理后的缓冲区数据，如果不是结束标志则返回 null
     */
    async processInput(req: ChatRequest, deviceSN: string, productId: number): Promise<ChatBuffer | null> {
        try {
            // 获取或创建缓冲区
            const buffer = this.getOrCreateBuffer(deviceSN)

            // 【埋点】记录用户首包时间
            let context = traceContext.getContext()
            const metrics = context.metrics
            if (!metrics || !metrics.userFirstPacketTime) {
                const userFirstPacketTime = Date.now()
                const context = traceContext.getContext()
                traceContext.updateContext({ metrics: { ...context.metrics, userFirstPacketTime } })
            }

            // 【埋点】记录用户尾包时间，不能放在STT后面，关闭音频有些延迟
            if (req.end) {
                const userLastPacketTime = Date.now()
                context = traceContext.getContext()
                traceContext.updateContext({ metrics: { ...context.metrics, userLastPacketTime } })
            }

            // 处理文本输入
            this.processText(req, buffer)

            // 处理图片输入
            await this.processImg(req, buffer, deviceSN)

            // 处理音频输入
            await this.processSTT(req, buffer, deviceSN)

            // 消息结束标志，准备进入大模型处理阶段
            if (req.end) {
                if (env.ENABLE_VECTOR && buffer.text) {
                    // 完整输入触发向量匹配流程（在 STT 完成后）
                    // https://coco-project.feishu.cn/wiki/QEU8w62TOiwmLtkJITjc24VBnXb
                    this.vectorMatcher.quickVector(buffer.text, deviceSN, productId)
                }
                // 【埋点】统计流量数据
                traceContext.recordInputTraffic(buffer)

                // 返回完整的 buffer 供下一阶段使用
                return buffer
            }

            // 非结束标志，返回 null
            return null
        } catch (error) {
            // 统一错误处理
            this.log.errorMsg(`Error in processInput for device ${deviceSN}:`, { errorMsg: error })

            // 清理资源
            const buffer = this.buffer.get(deviceSN)
            if (buffer?.stt) {
                buffer.stt.disconnect()
                buffer.stt.removeAllListeners()
            }
            this.buffer.delete(deviceSN)

            // 重新抛出错误
            throw error
        }
    }

    /**
     * 处理文本输入
     * @param req 聊天请求对象
     * @param buffer 缓冲区
     * @private
     */
    private processText(req: ChatRequest, buffer: ChatBuffer): void {
        if (req.text) {
            buffer.text += req.text
        }
    }

    /**
     * 处理图片输入
     * @param req 聊天请求对象
     * @param buffer 缓冲区
     * @param deviceSN 设备序列号
     * @private
     */
    private async processImg(req: ChatRequest, buffer: ChatBuffer, deviceSN: string): Promise<void> {
        // 处理 req.image
        if (req.image) {
            if (Array.isArray(req.image)) {
                buffer.image.push(...req.image)
            } else {
                buffer.image.push(req.image)
            }
        }

        // 在 end 时处理状态中的图片
        if (req.end && req.state) {
            // 从 Redis 读取设备持久的状态数据
            const state = await this.deviceState.getStates(deviceSN)
            if (req.state) {
                req.state.push(...state)
            }

            const imageStateData = req.state.filter(item => item.type === 'image')

            // 处理状态中的图片数据
            for (const imageStateDatum of imageStateData) {
                const tempImg: Image = {
                    // 保持向后兼容：状态机的图片数据仍使用 base64 字符串
                    base64: 'data:image/png;base64,' + imageStateDatum.value,
                    format: ImageFormatEnum.PNG
                }
                buffer.image.push(tempImg)
            }
        }
    }

    /**
     * 处理音频输入和语音识别
     * @param req 聊天请求对象
     * @param buffer 缓冲区
     * @param deviceSN 设备序列号
     * @private
     */
    private async processSTT(req: ChatRequest, buffer: ChatBuffer, deviceSN: string): Promise<void> {
        if (req.audio) {
            const audioData = Array.isArray(req.audio) ? req.audio : [req.audio]
            // 如果还没有STT实例，创建新的STT服务
            if (!buffer.stt) {
                buffer.stt = STTFactory.createSTTFromConfig(deviceSN)
                    .on('starting', () => {
                        this.log.infoMsg(`STT starting for device: ${deviceSN}`)
                    })
                    .on('connecting', (uid, url) => {
                        this.log.infoMsg(`STT connecting ${url} for device: ${uid}`)
                    })
                    .on('connected', (uid, url) => {
                        this.log.infoMsg(`STT connected ${url} for device: ${uid}`)
                    })
                    .on('started', () => {
                        this.log.infoMsg(`STT started for device: ${deviceSN}`)
                    })
                    .on('closing', () => {
                        this.log.infoMsg(`STT closing for device: ${deviceSN}`)
                    })
                    .on('closed', () => {
                        this.log.infoMsg(`STT closed for device: ${deviceSN}`)
                    })
                    .on('disconnecting', uid => {
                        this.log.infoMsg(`STT disconnecting for device: ${uid}`)
                    })
                    .on('disconnected', (uid, code, reason) => {
                        this.log.infoMsg(`STT disconnected for device: ${uid}, code: ${code}, reason: ${reason}`)
                    })
                    .on('error', (error: Error) => {
                        this.log.errorMsg(`STT error for device ${deviceSN}:`, { errorMsg: error })
                        // STT错误后自动清理缓冲区中STT实例
                        if (buffer.stt) {
                            buffer.stt.removeAllListeners()
                            buffer.stt.sttError = error
                        }
                    })
                    .on('data', (text: string) => {
                        // 实时更新STT识别结果
                        buffer.sttText = text
                        this.log.infoMsg(`STT transcription update for device ${deviceSN}: "${text}"`)
                    })
                // 启动STT服务，但是不能await，否则会阻塞后续代码执行，导致输入乱序
                // 为 start() Promise 添加 catch 处理，防止 UnhandledPromiseRejection
                buffer.sttStartTask = buffer.stt.start(audioData[0].format).catch(error => {
                    this.log.errorMsg(`STT start failed for device ${deviceSN}:`, { errorMsg: error })
                    if (buffer.stt) {
                        buffer.stt.sttError = error
                    }
                    // 不重新抛出，使用 sttError 标志位让后续检查逻辑处理
                    return buffer.stt!
                })

                // 【埋点】记录 STT 开始时间
                const sttStartTime = Date.now()
                const context = traceContext.getContext()
                traceContext.updateContext({ metrics: { ...context.metrics, sttStartTime } })
            }

            // 处理音频数据（支持单个或多个音频文件）
            buffer.audio.push(...audioData)
            // 将音频数据发送给STT进行识别
            for (let i = 0; i < audioData.length; i++) {
                const audio = audioData[i]
                // 处理错误 产生了innerError但是还未执行到 buffer.stt.close()，提前抛出错误，避免后面代码执行
                const sttError = buffer.stt?.sttError
                if (sttError) {
                    this.log.errorMsg(`设备 ${deviceSN} 错误:`, { errorMsg: sttError })
                    this.buffer.delete(deviceSN)
                    buffer.stt.disconnect()
                    buffer.stt.removeAllListeners()
                    throw sttError
                }

                if (audio.base64) {
                    // stt的loop函数会循环处理音频，将识别结果保存在buffer.sttText中
                    if (Buffer.isBuffer(audio.base64)) {
                        buffer.stt.push(audio.base64)
                    } else {
                        buffer.stt.push(Buffer.from(audio.base64, 'base64'))
                    }
                }
            }
        }

        // 如果是结束标志，关闭STT服务并整合最终文本
        if (req.end && buffer.stt) {
            // 等待STT服务启动完成
            await buffer.sttStartTask

            if (buffer.stt?.sttError) {
                throw buffer.stt?.sttError
            }

            // 等待STT服务完成
            await buffer.stt.close()

            // 将STT识别的文本添加到总文本中
            buffer.text += '\n\n' + buffer.sttText
            buffer.text = buffer.text.trim()
            this.log.infoMsg(`Final text for device ${deviceSN}: "${buffer.text}"`)

            // 【埋点】记录 STT 完成时间
            const sttCompleteTime = Date.now()
            const context = traceContext.getContext()
            traceContext.updateContext({ metrics: { ...context.metrics, sttCompleteTime } })
        }
    }

    /**
     * 方法2：处理大模型所需数据阶段
     * @param req
     * @param buffer
     * @param deviceSN
     */
    async processData(req: ChatRequest, buffer: ChatBuffer, deviceSN: string) {
        // 【埋点】记录数据准备开始时间
        const dataPrepStartTime = Date.now()
        let context = traceContext.getContext()
        traceContext.updateContext({ metrics: { ...context.metrics, dataPrepStartTime } })

        // 检查设备是否被锁定（正在进行其他对话）
        if (await this.lockManager.isLocked(deviceSN)) {
            this.buffer.delete(deviceSN)
            throw new Error(`Device ${deviceSN} is busy, interrupt first`)
        }

        // 清除缓冲区数据
        this.buffer.delete(deviceSN)

        // 检查消息内容是否为空
        if (!buffer.text && buffer.image.length === 0) {
            this.log.warnMsg(`Empty message for device ${deviceSN}`)
            throw new Error('Empty message')
        }

        const { agent, firstMsg, messages, statePE } = await this.mergeMsg(deviceSN, req.state, buffer)

        // 先保存System信息【状态机】，倒数第二条是System信息（messages.length - 2）
        conversationMessagesHttpdao
            .createMessage(
                agent.dialogs[0].id,
                ChatRoleEnum.SYSTEM,
                statePE,
                req.provider!,
                req.model!,
                agent.sessionId,
                v7()
            )
            .then(() => {
                const userMsgId = v7()
                // 在保存用户消息到数据库，并判断是否需要生成对话标题
                this.pomAgentService.createMsgAndSummaryAndGenTitle(
                    deviceSN,
                    agent.dialogs[0].id,
                    ChatRoleEnum.USER,
                    buffer.text,
                    req.provider!,
                    req.model!,
                    agent.sessionId,
                    firstMsg, // 是否是对话的第一条消息
                    userMsgId
                )

                // user信息收集完毕阶段
                traceContext.updateContext({ messageId: userMsgId, step: Step.USER })
            })

        // 【埋点】记录数据准备完成时间
        const dataPrepCompleteTime = Date.now()
        context = traceContext.getContext()
        traceContext.updateContext({ metrics: { ...context.metrics, dataPrepCompleteTime } })

        return { agent, messages }
    }

    /**
     * 合并消息 将提示词、历史消息、用户消息进行拼接位一个完整消息
     * @private
     */
    public async mergeMsg(deviceSN: string, state: StateData[], buffer: ChatBuffer) {
        // 获取Agent信息和对话历史
        const agent = await this.pomAgentService.getAgentAndLatestDialogMessages(deviceSN)

        // 检查 agent 是否存在
        if (!agent) {
            throw new Error(`Agent not found for device: ${deviceSN}`)
        }

        // 检查是否存在对话记录
        if (!agent.dialogs || agent.dialogs.length === 0) {
            throw new Error(`No dialogs found for device: ${deviceSN}`)
        }

        // 构建历史消息列表（组合摘要和最新对话）
        const dialog = agent.dialogs[0]
        const historyMessages = this.pomAgentService.buildCombinedMessages(dialog.messages)

        const systemPrompt = await this.promptManager.getPrompt(
            agent?.deviceSession?.device?.productId,
            agent.id,
            agent.sessionId,
            deviceSN
        )

        // 查询设备人脸数据
        const faceData = await this.deviceFaceService.getDeviceFacesSimple(deviceSN)

        // 构建完整的消息列表（系统提示 + 历史消息 + 当前用户输入）
        const statePE = await this.promptManager.getRobotStateV4(state, deviceSN, faceData)
        const messages: ChatMessage[] = [
            // 接流PE在系统提示最后
            { role: ChatRoleEnum.SYSTEM, content: systemPrompt.toMarkdown() },
            ...historyMessages
        ]
        if (statePE) {
            messages.push({
                role: ChatRoleEnum.SYSTEM,
                content: statePE
            })
        }
        messages.push({
            role: ChatRoleEnum.USER,
            content: buffer.text,
            // 将图像数据转换为 base64 字符串（uniai 库需要 base64 格式）
            img: buffer.image.map(i => {
                if (Buffer.isBuffer(i.base64)) {
                    return i.base64.toString('base64')
                }
                return i.base64
            })
        })

        const firstMsg = historyMessages.length == 0
        return { agent, firstMsg, messages, statePE }
    }

    /**
     * 中断指定设备的对话会话
     * @param deviceSN 设备ID
     * @param idx 打断位置索引
     * @param reason 中断原因
     * @param interrupt
     * @returns 被中断的会话数据，如果不存在则返回null
     */
    async done(deviceSN: string, reason: string, idx?: number, interrupt?: boolean) {
        this.log.infoMsg(`【done方法】开始执行 interrupt[${interrupt}], idx[${idx}], reason[${reason}]`)
        // 根据idx参数判断打断位置并保存已执行的数据
        let tokensToSaveLen: number = 0

        try {
            let data: ChatSession | null | undefined
            if (interrupt) {
                this.log.infoMsg(`【done方法】调用 lockManager.interrupt`)
                data = await this.lockManager.interrupt(deviceSN)
            } else {
                this.log.infoMsg(`【done方法】调用 lockManager.getSession`)
                data = await this.lockManager.getSession(deviceSN)
            }

            if (!data) {
                this.log.infoMsg(`【done方法】没有找到会话数据，返回 null`)
                return null
            }

            this.log.infoMsg(`【done方法】获取到会话数据，tokens长度: ${data.tokens.length}`)

            if (idx !== undefined && idx > 0) {
                // idx从1开始，所以需要减1来获取正确的索引
                const tokensToSave = data.tokens.slice(0, idx)
                tokensToSaveLen = tokensToSave
                    .map(t => {
                        return t.token
                    })
                    .join('').length
                this.log.infoMsg(`【done方法】计算 tokensToSaveLen: ${tokensToSaveLen}`)

                // 如果计算后的长度为0，不需要更新索引
                if (tokensToSaveLen === 0) {
                    this.log.infoMsg(`【done方法】tokensToSaveLen为0，无需更新索引，返回 null`)
                    return null
                }
            } else {
                // 如果没有提供idx或者idx<=0，不保存
                this.log.infoMsg(`【done方法】idx=${idx}，不保存，返回 null`)
                return null
            }

            const llmSet = data.shell!.llmSet
            // 更新index
            this.log.infoMsg(
                `【Done事件】开始更新消息索引，llmSet长度: ${llmSet.length}, tokensToSaveLen: ${tokensToSaveLen}`
            )

            await conversationMessagesHttpdao
                .updateIndex(llmSet, tokensToSaveLen)
                .then(() => {
                    this.log.infoMsg(`【Done事件】消息索引更新完成`)
                    if (!interrupt) {
                        return
                    }
                    // 打断信息（Assistant）信息保存OK，在保存System打断提示信息
                    try {
                        const reasonFunc: FuncToken = {
                            name: 'REASON_ERROR',
                            pattern: Pattern.EMPTY,
                            text: reason,
                            token: reason
                        }

                        // 获取代理服务实例并保存系统消息，多轮对话只保存一个系统消息
                        this.pomAgentService.saveMessage([reasonFunc], ChatRoleEnum.SYSTEM, deviceSN).then(() => {
                            // 发送打断信息给客户端
                            SocketCommonResponse.successToAll<ChatSystemResponse>({
                                ns: CoCoNamespace.Agent,
                                event: ResponseEvent.DONE_SYSTEM,
                                msg: '',
                                room: deviceSN,
                                data: {
                                    role: ChatRoleEnum.SYSTEM,
                                    flag: ResponseFlag.END,
                                    timestamp: Date.now(),
                                    text: reason,
                                    id: traceContext.getTraceId()
                                }
                            })
                            this.log.infoMsg(`【打断提示】 System 打断提示保存 完毕 `)
                        })
                    } catch (error) {
                        this.log.errorMsg(`【打断提示】 System 打断提示保存 失败 :`, { errorMsg: error })
                    }
                })
                .catch(error => {
                    this.log.errorMsg(`【Done事件】消息索引更新失败:`, { errorMsg: error })
                })

            const result = data.tokens.slice(0, idx)
            this.log.infoMsg(`【done方法】执行成功，返回 ${result.length} 个 tokens`)
            return result
        } catch (error) {
            this.log.errorMsg('Error saving message:', { errorMsg: error })
            return []
        } finally {
            // 确保锁释放日志一定会输出
            try {
                const releaseResult = await this.lockManager.release(deviceSN)
                this.log.infoMsg(
                    `(interrupt=${interrupt})机器人发起Done[${idx}]事件，锁释放 ${releaseResult ? '成功' : '失败'}`
                )
            } catch (e) {
                this.log.errorMsg(`(interrupt=${interrupt})机器人发起Done[${idx}]事件，锁释放 失败`, { errorMsg: e })
            }
        }
    }

    /**
     * 方法4：处理大模型回复阶段
     * 使用 STT 阶段的输出，调用大模型生成回复
     * @param req
     * @param deviceSN
     * @param agent
     * @param messages 消息列表，包含系统提示和历史对话
     * @param lock
     * @returns 处理结果，包括缓冲区数据、输出流等
     */
    async processLLM(
        req: ChatRequest,
        deviceSN: string,
        agent: PomAgentWithDialogsVO,
        messages: ChatMessage[],
        lock: ChatSession
    ) {
        const provider = req.provider!
        const model = req.model!

        // 初始化所需的资源
        const shell = lock.shell
        const tokens: FuncToken[] = lock.tokens

        try {
            // 设置Shell事件监听器
            this.setShellListening(shell, tokens, deviceSN, lock, messages, agent, provider, model)

            // 启动 shell
            shell.start()

            // 【埋点】记录 LLM 首包时间 - 使用 once 避免并发覆盖
            lock.llmStream.once('data', () => {
                const llmFirstPacketTime = Date.now()
                const metrics = traceContext.getContext().metrics
                traceContext.updateContext({ metrics: { ...metrics, llmFirstPacketTime } })
            })

            // 处理 LLM 响应流
            lock.llmStream.on('data', (chunk: Buffer) => {
                this.agentPrompt.handleLLMData(chunk, shell, deviceSN)
            })

            lock.llmStream.once('end', () => {
                const userReplyMsgId = v7()
                traceContext.updateContext({ messageId: userReplyMsgId, step: Step.USER_REPLY })
                this.agentPrompt.handlerEndEvent(shell, deviceSN, userReplyMsgId, lock, agent, provider, model)
            })

            // 等待LLM响应流结束并销毁llmStream流
            await this.awaitLLMEnd(lock)

            // 【埋点】记录 LLM 尾包时间
            const llmLastPacketTime = Date.now()
            const context = traceContext.getContext()
            traceContext.updateContext({
                metrics: { ...context.metrics, llmLastPacketTime }
            })

            // 等待Shell解析xml完毕
            shell
                .close()
                .then(() => {
                    // 输出流结束
                    lock.socketLlmStream.end()
                })
                .catch(error => {
                    // 捕获 shell.close() 中的异常，防止进程崩溃
                    this.log.errorMsg('Shell close error:', { errorMsg: error })
                    // 触发中断处理
                    this.lockManager.interrupt(deviceSN, error)
                })
        } catch (error) {
            this.log.errorMsg('Chat session error:', { errorMsg: error })
            // 发生错误时强制中断会话
            await this.lockManager.interrupt(deviceSN, error)
        }

        return tokens.map(({ token }) => token).join('') // 返回完整文本
    }

    /**
     * 关闭当前 TTS 会话并发送结束标志
     * @private
     */
    private async closeTTSSession(
        tts: TTSBaseService,
        audioStream: PassThrough,
        audioId: string,
        getAudioIndex: () => number
    ): Promise<void> {
        if (!audioId) {
            return
        }

        // 关闭会话
        await tts.close(audioId)

        const audioToken: AudioResponse = {
            id: traceContext.getTraceId(),
            audio: {
                id: audioId,
                index: getAudioIndex(), // 使用函数获取最新的 audioIndex
                flag: AudioFlag.END, // 结束标志
                base64: env.IS_BYTE ? Buffer.alloc(0) : '',
                format: VOICE_TTS_FORMAT,
                sampleRate: VOICE_TTS_SAMPLE_RATE
            }
        }

        audioStream.write($.stringify(audioToken))
    }

    /**
     * 方法4，将FuncToken转为TTS
     * @param deviceSN
     * @param socketAudioStream
     * @param socketLlmStream
     * @param tts
     */
    processTTS(deviceSN: string, socketAudioStream: PassThrough, socketLlmStream: PassThrough, tts: TTSBaseService) {
        // ===== 状态变量集中声明 =====
        // 创建计时器
        const start = Date.now()
        // 初始化串行锁（核心：保证pushToTTS串行执行）
        let serialPromise = Promise.resolve()
        // 错误标志
        let flag = false
        // 音频块索引
        let audioIndex = 0
        // 当前音频会话ID
        let currentAudioId = ''

        tts.on('disconnected', (uid, resourceId, code, reason) => {
            this.log.infoMsg(`TTS disconnected for ${uid}, resourceId: ${resourceId}, code: ${code}, reason: ${reason}`)
        })

        tts.on('error', error => {
            this.log.errorMsg('TTS error', { errorMsg: error })
            this.lockManager.interrupt(deviceSN, error)
        })

        // 【埋点】记录 TTS 首包时间 - 使用 once 避免并发覆盖
        tts.once('data', () => {
            const ttsFirstPacketTime = Date.now()
            const metrics = traceContext.getContext().metrics
            traceContext.updateContext({ metrics: { ...metrics, ttsFirstPacketTime } })
        })

        tts.on('data', buffer => {
            // 【埋点】统计 TTS 输出音频大小
            const ctx = traceContext.getContext()
            const trafficStats = ctx.traffic || {}
            // base64的音频大小为buffer.length * 1.333
            const audioOutputSize = buffer.length * 1.333
            traceContext.updateContext({
                traffic: {
                    ...trafficStats,
                    ttsOutputSize: (trafficStats.ttsOutputSize || 0) + audioOutputSize,
                    ttsPacketCount: (trafficStats.ttsPacketCount || 0) + 1
                }
            })

            // 将音频数据写入 socketAudioStream
            const audioToken: AudioResponse = {
                id: traceContext.getTraceId(),
                audio: {
                    id: currentAudioId,
                    index: audioIndex,
                    flag: audioIndex === 0 ? AudioFlag.START : AudioFlag.CHUNK,
                    base64: env.IS_BYTE ? buffer : buffer.toString('base64'),
                    format: VOICE_TTS_FORMAT,
                    sampleRate: VOICE_TTS_SAMPLE_RATE
                }
            }
            audioIndex++
            socketAudioStream.write($.stringify(audioToken))
        })

        const onLlmStreamData = async (chunk: Buffer) => {
            if (flag) {
                return
            }
            // 将当前chunk的推送逻辑加入串行队列 【注意：一定要赋值，不然then就丢失了】
            serialPromise = serialPromise
                .then(async () => {
                    if (flag) {
                        return
                    }
                    const func = $.json<FuncToken>(chunk.toString())
                    if (func.tempParams?.xmlType === XmlElementType.Text) {
                        // func.text 有值代表是文字，文字在Shell层会设置 audioId
                        const tempParams = func.tempParams
                        const audioId = func.audioId

                        if (audioId) {
                            // 起始音频会话
                            if (currentAudioId === '') {
                                currentAudioId = audioId
                                await tts.start(
                                    currentAudioId,
                                    tempParams.speaker,
                                    tempParams.emotion,
                                    tempParams.language,
                                    tempParams.loudness_rate,
                                    tempParams.speech_rate
                                )
                                await tts.push(currentAudioId, func.text!.trimStart())
                            } else if (currentAudioId === audioId) {
                                await tts.push(currentAudioId, func.text!)
                            }
                        }
                    } else {
                        if (currentAudioId) {
                            // 关闭会话并发送结束标志
                            await this.closeTTSSession(tts, socketAudioStream, currentAudioId, () => audioIndex)
                            currentAudioId = ''
                            audioIndex = 0
                        }
                    }
                })
                .catch(error => {
                    this.lockManager.interrupt(deviceSN, error)
                    flag = true
                })
        }

        const onLlmStreamEnd = async (type: string) => {
            this.log.infoMsg(`LLM stream ended, total time: ${Date.now() - start} ms`)
            // 等待所有文本转译为音频
            await serialPromise.then(async () => {
                if (currentAudioId) {
                    // 关闭会话并发送结束标志
                    await this.closeTTSSession(tts, socketAudioStream, currentAudioId, () => audioIndex)
                    currentAudioId = ''
                    audioIndex = 0
                }
            })

            // 音频结束
            socketAudioStream.end()

            // 断开TTS连接
            tts.disconnect()
                .then(() => {
                    tts.removeAllListeners()
                })
                .catch(error => {
                    this.log.errorMsg('TTS disconnect error:', { errorMsg: error })
                })

            // 【埋点】记录 TTS 尾包时间
            const ttsLastPacketTime = Date.now()
            const context = traceContext.getContext()
            traceContext.updateContext({
                metrics: { ...context.metrics, ttsLastPacketTime }
            })

            // TTSService.parseByLoopWithAudio 调用会在end的时候传入http
            if (type !== 'http') {
                agentChatConcurrentDec()
            }

            // 清理监听器
            cleanup(socketLlmStream, onLlmStreamData, onLlmStreamEnd, onLlmStreamError)
        }

        const onLlmStreamError = (error: Error) => {
            this.log.errorMsg('LLM stream error in processTTS:', { errorMsg: error })
            this.lockManager.interrupt(deviceSN, error)

            // 清理监听器
            cleanup(socketLlmStream, onLlmStreamData, onLlmStreamEnd, onLlmStreamError)
        }

        // ✅ 清理 socketLlmStream 的监听器（只移除 processTTS 添加的）
        const cleanup = (
            socketLlmStream: PassThrough,
            onData: (chunk: Buffer) => void,
            onEnd: (type: string) => void,
            onError: (e: Error) => void
        ) => {
            socketLlmStream.removeListener('data', onData)
            socketLlmStream.removeListener('end', onEnd)
            socketLlmStream.removeListener('error', onError)
            this.log.infoMsg('LLM stream listeners cleaned up')
        }

        // ===== 注册监听器 =====
        socketLlmStream.on('data', onLlmStreamData)
        socketLlmStream.once('end', onLlmStreamEnd)
        socketLlmStream.once('error', onLlmStreamError)
    }

    /**
     * 等待LLM响应流结束
     * @param lock
     * @private
     */
    private async awaitLLMEnd(lock: ChatSession) {
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                lock.llmStream?.off('error', error)
                lock.shell?.off('llmEnd')
            }
            const finish = () => {
                cleanup()
                resolve()
            }
            const error = (err: Error) => {
                cleanup()
                reject(err)
            }

            lock.shell?.once('llmEnd', finish)
            lock.llmStream?.once('error', error)
        })

        // 移除监听器
        lock.llmStream?.removeAllListeners()
        lock.llmStream?.destroy()

        this.log.infoMsg('[finish]结束了等待AI响应流结束')
    }

    /**
     * 设置Shell监听
     * @param shell
     * @param tokens
     * @param deviceSN
     * @param lock
     * @param messages
     * @param agent
     * @param provider
     * @param model
     * @private
     */
    private setShellListening(
        shell: Shell,
        tokens: FuncToken[],
        deviceSN: string,
        lock: ChatSession,
        messages: ChatMessage[],
        agent: PomAgentWithDialogsVO,
        provider: string,
        model: string
    ) {
        // 第一个包是root，第二个包才是FuncToken首包
        let count = 1
        shell.on('data', (token: FuncToken) => {
            // 【埋点】记录 FuncToken 首包时间 - 使用 once 避免并发覆盖
            if (count == 2) {
                const metrics = traceContext.getContext().metrics
                if (!metrics?.funcTokenFirstPacketTime) {
                    const funcTokenFirstPacketTime = Date.now()
                    traceContext.updateContext({ metrics: { ...metrics, funcTokenFirstPacketTime } })
                }
            }
            count++

            // 将处理后的令牌发送给客户端
            token.idx = tokens.length
            token.id = traceContext.getTraceId()
            tokens.push(token)
            lock.socketLlmStream.write($.stringify(token))
        })

        shell.on('error', error => {
            this.log.errorMsg('Shell error:', {
                errorMsg: error
            })
            this.lockManager.interrupt(deviceSN, error)
        })

        shell.on('closing', () => {
            this.log.infoMsg(`Shell closing for device: ${deviceSN}`)
        })

        shell.on('closed', () => {
            this.log.infoMsg(`Shell closed for device: ${deviceSN}`)
        })

        // 添加prompt事件处理
        this.agentPrompt.shellPromptEvent(shell, lock, deviceSN, messages, agent, provider, model)

        // 添加agent事件处理
        this.agentTrigger.shellAgentEvent(shell, deviceSN, agent)
    }

    /**
     * 获取或创建设备缓冲区
     * @param deviceSN 设备序列号
     * @returns 设备对应的聊天缓冲区
     */
    private getOrCreateBuffer(deviceSN: string): ChatBuffer {
        // 检查是否已存在该设备的缓冲区，如果不存在则创建一个新的
        let buffer = this.buffer.get(deviceSN)
        if (!buffer) {
            buffer = {
                id: deviceSN,
                text: '',
                audio: [],
                image: [],
                stateImage: [],
                endtime: 0,
                sttText: ''
            }
            this.buffer.set(deviceSN, buffer)
        }
        return buffer
    }

    /**
     * 处理连接请求
     * @param req
     * @param deviceSN
     * @param agent
     * @param messages
     */
    async processConnection(
        req: ChatRequest,
        deviceSN: string,
        agent: PomAgentWithDialogsVO,
        messages: ChatMessage[]
    ): Promise<ChatSession | null> {
        try {
            // 【埋点】记录连接建立开始时间
            const connectionStartTime = Date.now()
            const context = traceContext.getContext()
            traceContext.updateContext({ metrics: { ...context.metrics, connectionStartTime } })

            return await this.processConnection0(req, deviceSN, messages, agent)
        } catch (e) {
            lockManager.interrupt(deviceSN, e).catch(error => {
                this.log.errorMsg('Error interrupting chat session:', { errorMsg: error })
            })
            return null
        } finally {
            // 【埋点】记录连接建立完成时间
            const connectionCompleteTime = Date.now()
            const ctx = traceContext.getContext()
            traceContext.updateContext({ metrics: { ...ctx.metrics, connectionCompleteTime } })
        }
    }
    async processConnection0(
        req: ChatRequest,
        deviceSN: string,
        messages: ChatMessage[],
        agent: PomAgentWithDialogsVO
    ): Promise<ChatSession | null> {
        // 使用TTS工厂创建TTS服务实例
        const tts: TTSBaseService = TTSFactory.createTTSFromConfig(deviceSN)
        // 只用于首次链接异常，避免链接超时无error事件监听
        const onConnectionError = (error: Error) => {
            this.log.errorMsg('TTS error', { errorMsg: error })
            this.lockManager.interrupt(deviceSN, error)
        }

        tts.once('error', onConnectionError)

        const startTime = Date.now()

        // 根据ENABLE_TTS配置决定是否建立TTS连接
        let llmStream: Readable

        // 检查是否使用 Mock LLM
        const useMockLLM = process.env.USE_MOCK_LLM === 'true'

        if (env.ENABLE_TTS) {
            // 同时建立LLM和TTS连接
            const [stream] = await Promise.all([
                // 【AI聊天LLM】
                useMockLLM
                    ? MockLLMService.chat()
                          .catch(error => {
                              this.log.errorMsg('Mock LLM Chat error:', { errorMsg: error })
                              throw new Error(`Mock LLM Chat failed: ${error.message}`)
                          })
                          .finally(() => {
                              this.log.infoMsg(
                                  `Mock LLM Chat request finished, total time: ${Date.now() - startTime} ms`
                              )
                          })
                    : ai
                          .chat(messages, {
                              stream: true,
                              provider: req.provider as ChatModelProvider,
                              model: req.model
                          })
                          .catch(error => {
                              this.log.errorMsg('LLM Chat error:', { errorMsg: error })
                              throw new Error(`LLM Chat failed: ${error.message}`)
                          })
                          .finally(() => {
                              this.log.infoMsg(`LLM Chat request finished, total time: ${Date.now() - startTime} ms`)
                          }),
                // TTS连接
                tts
                    .connect()
                    .catch(error => {
                        this.log.errorMsg('TTS connect error:', { errorMsg: error })
                        throw new Error(`TTS connect failed: ${error.message}`)
                    })
                    .finally(() => {
                        this.log.infoMsg(`TTS connection established , total time: ${Date.now() - startTime} ms`)
                    })
            ])
            llmStream = stream as Readable

            // 链接完成后删除，后续有其他处理器监听
            tts.removeListener('error', onConnectionError)
        } else {
            // 只建立LLM连接
            this.log.infoMsg('TTS is disabled, skipping TTS connection')
            llmStream = (
                useMockLLM
                    ? await MockLLMService.chat()
                          .catch(error => {
                              this.log.errorMsg('Mock LLM Chat error:', { errorMsg: error })
                              throw new Error(`Mock LLM Chat failed: ${error.message}`)
                          })
                          .finally(() => {
                              this.log.infoMsg(
                                  `Mock LLM Chat request finished, total time: ${Date.now() - startTime} ms`
                              )
                          })
                    : await ai
                          .chat(messages, {
                              stream: true,
                              provider: req.provider as ChatModelProvider,
                              model: req.model
                          })
                          .catch(error => {
                              this.log.errorMsg('LLM Chat error:', { errorMsg: error })
                              throw new Error(`LLM Chat failed: ${error.message}`)
                          })
                          .finally(() => {
                              this.log.infoMsg(`LLM Chat request finished, total time: ${Date.now() - startTime} ms`)
                          })
            ) as Readable
        }

        // create chat session lock
        const productId = agent?.deviceSession?.device?.productId
        let spaceId: string | undefined = undefined
        try {
            const family = await deviceFamilyHttpdao.getByDevice(deviceSN)
            spaceId = family?.spaceId
        } catch (e) {
            // 容错：spaceId 获取失败不影响主聊天链路
            this.log.warnMsg('获取设备家庭空间失败', { deviceSN, errorMsg: e })
        }

        const shell = new Shell({ agentId: agent.id, sessionId: agent.sessionId, deviceSN, productId, spaceId })
        const socketLlmStream = new PassThrough()
        const socketAudioStream = new PassThrough()
        const chatSession = await this.lockManager.start(deviceSN, {
            id: traceContext.getTraceId(),
            tokens: [],
            tts,
            shell,
            llmStream,
            socketLlmStream,
            socketAudioStream
        })
        agentChatConcurrentInc()
        return chatSession
    }

    /**
     * 通知指定设备退出家庭房间
     * @param data
     */
    public async notifyResetDevice(data: SpaceUserInfoSyncMessage): Promise<void> {
        const deviceSNs = data.devices.map(d => d.device_sn).filter(Boolean) as string[]
        if (deviceSNs.length === 0) {
            this.log.warnMsg('重置设备为空')
        }
        await this.notifyResetDevice0(deviceSNs)
    }

    public async notifyResetDevice0(deviceSNs: string[]) {
        for (const deviceSN of deviceSNs) {
            SocketCommonResponse.successTo({
                authType: AuthType.client,
                ns: CoCoNamespace.Agent,
                room: deviceSN,
                event: RequestEvent.RESET_DEVICE,
                data: null,
                msg: '重置设备'
            })
        }
    }

    /**
     * 通过 Agent 命名空间向 device_sn 非空的设备下发 spacesId/aesKey，并等待 emitWithAck 回调。
     * @returns 是否应继续拉特征数据：无在线目标、无密钥等仍返回 true；已向在线设备推送时须全部 ack 成功才为 true
     */
    async notifyPullAESKey(spacesId: string, devices: SpaceUserInfoSyncMessage['devices']): Promise<boolean> {
        // 与 SocketCommonResponse 中 SOCKET_TIME_OUT 一致（ms）
        const deviceSNs: string[] = [
            ...new Set(devices.map(d => d.device_sn?.trim()).filter((sn): sn is string => Boolean(sn)))
        ]

        return await this.notifyPullAESKey0(spacesId, deviceSNs)
    }

    /**
     * 通过 Agent 命名空间向 device_sn 非空的设备下发 spacesId/aesKey，并等待 emitWithAck 回调。
     * @returns 是否应继续拉特征数据：无在线目标、无密钥等仍返回 true；已向在线设备推送时须全部 ack 成功才为 true
     */
    async notifyPullAESKey0(spacesId: string, deviceSNs: string[]): Promise<boolean> {
        const pullAesAckTimeoutMs = 5000
        try {
            if (deviceSNs.length === 0) {
                this.log.warnMsg(`notifyPullAESKey: 无有效 device_sn，跳过推送 spacesId=${spacesId}`)
                return true
            }

            const aesKey = await spaceHttpdao.getFamilySpaceAESKey(spacesId)

            const notifyData: SpacePullAESKeyNotify = {
                spacesId: spacesId,
                aesKey: aesKey ?? undefined
            }

            if (!aesKey) {
                return true
            }

            const ackPromises: Promise<unknown>[] = []
            let onlineCount = 0

            for (const deviceSN of deviceSNs) {
                const socket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.Agent, deviceSN)
                if (!socket) {
                    continue
                }
                onlineCount++
                ackPromises.push(
                    socket
                        .timeout(pullAesAckTimeoutMs)
                        .emitWithAck(SpaceUserInfoSyncNotifyEvent.PULL_AES_KEY, notifyData)
                )
            }

            if (onlineCount === 0) {
                this.log.warnMsg(
                    `notifyPullAESKey: 无在线 Agent 连接 spacesId=${spacesId} 目标数=${deviceSNs.length}，跳过 ack，继续拉特征`
                )
                return true
            }

            const settled = await Promise.allSettled(ackPromises)
            const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            if (rejected.length > 0) {
                this.log.errorMsg(`notifyPullAESKey: 部分设备 ack 失败 spacesId=${spacesId}`, {
                    errorMsg: rejected.map(r => String(r.reason)).join('; ')
                })
                return false
            }

            this.log.infoMsg(
                `已通过 Agent emitWithAck 完成拉取 AES 通知 spacesId=${spacesId} ack 成功=${onlineCount}/${deviceSNs.length}`
            )
            return true
        } catch (error) {
            this.log.errorMsg(`Failed to notify pull AES key for space: ${spacesId}`, { errorMsg: error })
            return false
        }
    }
}
