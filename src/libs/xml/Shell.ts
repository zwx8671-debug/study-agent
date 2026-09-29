/**
 * XML Shell 处理器
 *
 * 提供XML元素队列处理和功能令牌转换功能
 * 支持流式处理XML元素并将其转换为可执行的功能令牌
 * 集成TTS语音合成功能，支持与音频数据的混合输出
 *
 * @format
 */
import { FuncToken, Pattern, TempParams } from '@interface/IAgent'
import { getLogger } from '@utils/Logger'
import { EventEmitter } from 'events'
import { Interpreter } from './Interpreter'
import { XmlElement, XmlElementType } from './XmlElement'
import { XmlElementHandler } from './handler/XmlElementHandler'
import { Prompt } from 'uniai'
import { v7 } from 'uuid'
import { traceContext } from '@utils/TraceContext'

export const LLM_COUNT = 3
// Shell状态枚举，表示Shell的生命周期状态
export enum ShellState {
    // 已创建状态
    Created = 'created',
    // 已启动状态
    Started = 'started',
    // 正在关闭状态
    Closing = 'closing',
    // 已关闭状态
    Closed = 'closed'
}

// Shell事件接口，定义了Shell可以触发的各种事件
interface ShellEvents {
    // 生命周期相关事件
    // Shell创建完成事件
    created: () => void
    // Shell启动完成事件
    started: () => void
    // Shell正在关闭事件
    closing: () => void
    // Shell已关闭事件
    closed: () => void

    // 外部事件
    data: (token: FuncToken) => void // 数据输出事件，传递功能令牌
    // 多agent模式，input是主Agent生成的辅助信息，用于回答之前做的事情
    agentTrigger: (input: string) => void
    // 流重置，接流（第二参为本轮 PROMPT 中出现的 routines 标签名，与导出函数名一致）
    prompt: (prompt: Prompt, routineNames: string[]) => void
    // 一次回复结束
    llmEnd: () => void
    // 错误事件
    error: (error: Error) => void

    // 内部事件
    // 队列添加元素事件
    add: () => void
}

interface LLMSet {
    requestId: string
    messageId: string
    llmRes: string
    llmContentLen: number
    promptTokens: number
    completionTokens: number
}

/**
 * 设备信息
 */
export interface ShellDeviceInfo {
    agentId: string
    sessionId: string
    deviceSN: string
    /** 产品ID（用于例程/记忆分流） */
    productId?: number
    /** 家庭空间ID（用于 cocolamp 记忆接口的 space_id） */
    spaceId?: string
}
// Shell类，负责处理XML元素队列并转换为功能令牌
export class Shell extends EventEmitter {
    private log = getLogger('Shell')
    /** XML元素队列，用于存储待处理的XML元素 */
    private queue: XmlElement[] = []
    /** XML元素，顺序存储列表，用于后续读取、备份 */
    private list: XmlElement[] = []
    /** 当前Shell状态 */
    private state: ShellState
    /** XML解释器，用于解析XML内容 */
    private readonly interpreter: Interpreter
    /** 根元素名称 */
    private readonly _root: string
    /**
     * 当前对话的agent信息
     */
    public shellDeviceInfo: ShellDeviceInfo
    /**
     * LLM请求次数，默认1
     */
    public llmCount: number
    /**
     * LLMEnd请求次数，默认0
     */
    public llmEndCount: number
    public llmSet: LLMSet[] = []

    get root(): string {
        return this._root
    }

    /**
     * 设置当前LLM请求ID
     * @param requestId
     * @param promptTokens
     * @param completionTokens
     */
    public setLlmSetRequestId(requestId: string, promptTokens: number, completionTokens: number) {
        const element = this.llmSet[this.llmCount - 1]
        if (!element) {
            this.llmSet.push({ requestId, promptTokens, completionTokens, messageId: '', llmRes: '', llmContentLen: 0 })
        } else {
            element.requestId = requestId
            element.promptTokens = promptTokens
            element.completionTokens = completionTokens
        }
    }
    /**
     * 获取当前LLM请求ID
     */
    public getLlmSetRequestId() {
        return this.llmCount - 1 > 0 ? this.llmSet[this.llmCount - 1].requestId : ''
    }

    /**
     * 组装LLM请求结果
     * @param llmRes
     */
    public addLlmSetContent(llmRes: string | string[]) {
        llmRes = Array.isArray(llmRes) ? llmRes.join('') : llmRes
        this.llmSet[this.llmCount - 1].llmRes += llmRes
    }

    /**
     * 完成一轮对话，messageId记录
     * @param messageId
     */
    public completeOneMsg(messageId: string) {
        this.llmSet[this.llmCount - 1].messageId = messageId
        this.llmSet[this.llmCount - 1].llmContentLen = this.llmSet[this.llmCount - 1].llmRes.length
    }

    /**
     * 返回当前LLM请求结果
     */
    public get currentLLMRes() {
        return this.llmSet[this.llmCount - 1].llmRes
    }

    /**
     * 返回当前LLM请求结果
     */
    public get currentLLMRequestId() {
        return this.llmSet[this.llmCount - 1].requestId
    }

    /**
     * 返回当前LLM请求+响应的token数
     */
    public get currentLLMAssistanceToken() {
        return this.llmSet[this.llmCount - 1].completionTokens + this.llmSet[this.llmCount - 1].promptTokens
    }

    /**
     * 返回当前LLM请求结果
     */
    public get currentLLMFlag() {
        return this.currentLLMRes.includes('<PROMPT>') && this.currentLLMRes.includes('</PROMPT>')
    }

    /**
     * 构造函数，初始化Shell实例
     * @param agent
     * @param root - 根元素名称，默认为'root'
     */
    constructor(agent: ShellDeviceInfo, root: string = 'root') {
        super()
        this.shellDeviceInfo = agent
        this._root = root
        this.llmCount = 1
        this.llmEndCount = 0
        this.interpreter = new Interpreter()

        this.state = ShellState.Created
        this.emit('created') // 触发创建事件
    }

    /**
     * 启动Shell，开始处理XML元素队列
     * @returns 返回Shell实例，支持链式调用
     */
    start(): Shell {
        // 如果已经启动，则直接返回
        if (this.state === ShellState.Started) return this

        this.state = ShellState.Started
        this.emit('started') // 触发启动事件

        this.loop() // 启动处理循环

        // 监听 Interpreter 的 error 事件，防止错误未被处理
        this.interpreter.on('error', error => {
            this.log.error('Interpreter error in Shell:', error)
            // 设置状态为错误，阻止后续操作
            this.interrupt()
            // 向上传递错误
            this.emit('error', error)
        })

        // 递归handler启动，创建XML元素处理器
        new XmlElementHandler(this.interpreter, this)

        if (this._root) {
            this.interpreter.start(`<${this._root}>`)
        } else {
            this.interpreter.start()
        }

        return this
    }

    /**
     * 添加XML字符串到解释器中
     * @param xml - 要添加的XML字符串
     * @returns 返回Shell实例，支持链式调用
     */
    add(xml: string | string[]): Shell {
        this.interpreter.push(Array.isArray(xml) ? xml.join('') : xml) // 将XML推入解释器
        return this
    }

    /**
     * 直接解析一段 XML 没走handler
     * @param xml - 要运行的XML字符串
     * @param needRoot
     * @param agentId - Agent ID ,如果要用trigger、save、prompt等标签一定要入参
     * @param sessionId - 会话 ID ,如果要用trigger、save、prompt等标签一定要入参
     * @param deviceSN - 设备序列号 ,如果要用trigger、save、prompt等标签一定要入参
     */
    static async syncLoopParse(
        xml: string,
        needRoot: boolean,
        agentId: string,
        sessionId: string,
        deviceSN: string
    ): Promise<{ textFuncTokens: FuncToken[]; errors: any[] }> {
        const shell = new Shell({ agentId, sessionId, deviceSN }, needRoot ? 'root' : '')
        // 启动 shell
        shell.start()
        const textFuncTokens: FuncToken[] = []
        const errors: unknown[] = []
        const traceId = traceContext.getTraceId()
        shell.on('data', (token: FuncToken) => {
            try {
                // 将处理后的令牌发送给客户端
                token.id = traceId
                token.idx = textFuncTokens.length
                textFuncTokens.push(token)
            } catch (error) {
                shell.log.errorMsg('一次性的Shell Error writing to output stream:', { errorMsg: error })
                shell.interrupt()

                errors.push(error)
            }
        })

        shell.on('error', error => {
            shell.log.errorMsg('一次性的Shell error:', {
                errorMsg: error
            })
            shell.interrupt()
            errors.push(error)
        })

        shell.once('closed', () => {
            shell.log.info('一次性解析XML完成... ')
        })

        shell.add(xml)
        await shell.close()

        return { textFuncTokens, errors }
    }

    /**
     * 将XML元素推入处理队列
     * @param element - 要推入的XML元素
     * @returns 返回推入的元素索引
     */
    push(element: XmlElement): number {
        // 只有在启动状态下才能推入队列
        if (this.state !== ShellState.Started) {
            return 0
        }
        // 将元素加入队列，此队列会动态变化
        this.queue.push(element)
        const len = this.list.push(element)
        this.emit('add') // 触发添加事件
        return len - 1
    }

    /**
     * 从 startIndex 到 endIndex 元素
     */
    getXml(startIndex: number, endIndex: number): string {
        return this.list
            .slice(startIndex, endIndex)
            .map(e => e.toString())
            .join('')
    }

    /**
     * 通知 SHELL LLM生成完毕，会结束FuncToken、XML解析
     * 异步关闭Shell，等待队列处理完成后退出
     * @returns 返回Promise，resolve时返回Shell实例
     */
    async close(): Promise<Shell> {
        // 只有在启动状态下才能关闭
        if (this.state !== ShellState.Started) return this

        try {
            // 关闭解释器
            if (this._root) {
                this.interpreter.close(`</${this._root}>`)
            } else {
                this.interpreter.close()
            }
        } catch (error) {
            // 捕获 close 过程中的异常，防止进程崩溃
            this.log.error('Error closing interpreter:', error)
            this.emit('error', error as Error)
            // 继续执行清理逻辑
        }

        // 触发正在关闭事件
        this.state = ShellState.Closing
        this.emit('closing')

        // 等待循环退出
        await new Promise<void>(resolve => this.once('closed', resolve))
        this.state = ShellState.Closed

        // 移除所有监听器
        this.removeAllListeners()
        return this
    }

    /**
     * 立即中断Shell，强制关闭
     * @returns 返回Shell实例
     */
    interrupt(): Shell {
        if (this.state === ShellState.Closed) return this

        // 立即进入关闭状态
        this.state = ShellState.Closed
        this.emit('closing') // 触发关闭事件
        // 关闭解释器
        this.interpreter.close()
        return this
    }

    /**
     * 处理XML元素队列的主循环
     * 负责将XML元素转换为功能令牌并触发相应的事件
     */
    private async loop() {
        let currentAudioId = '' // 当前TTS会话ID

        while (this.state === ShellState.Started || this.state === ShellState.Closing) {
            // 队列为空时的处理
            if (this.queue.length === 0) {
                // 如果正在关闭状态，退出循环
                if (this.state === ShellState.Closing) {
                    break
                }

                // 如果不是关闭状态，等待新的添加或关闭状态
                await new Promise<void>(resolve => {
                    this.once('add', resolve) // 等待添加事件
                    this.once('closing', resolve) // 等待关闭事件
                })
                this.off('add') // 移除事件监听
                this.off('closing') // 移除事件监听
                continue // 继续下一次循环
            }

            // 从队列中取出一个元素
            const element = this.queue.shift()
            if (!element) {
                continue
            }

            try {
                // 转换为功能令牌
                const { type, name, attr, tempAttr, text } = element

                let pattern: Pattern = Pattern.EMPTY
                // 根据元素类型设置模式 // 开始标签
                if (type === XmlElementType.Open) {
                    pattern = Pattern.START
                }
                // 结束标签
                if (type === XmlElementType.Close) {
                    pattern = Pattern.END
                }

                // 如果有TTS实例，处理文本转语音
                // tempAttr?.needTTS !== 'false' think标签文本不需要专语音
                if (tempAttr?.needTTS !== 'false') {
                    // 如果是文本元素
                    if (type === XmlElementType.Text) {
                        // 如果当前没有会话ID，才会创建audioId
                        if (!currentAudioId) {
                            // 会话ID是空，代表一定是首个文本元素，文字元素一定是非空的才会生成audioId
                            if (element.text.trim()) {
                                currentAudioId = v7()
                            }
                        }
                    } else {
                        // 重置会话ID
                        currentAudioId = ''
                    }
                }

                // 创建功能令牌并触发数据事件
                const tempParams: TempParams = {
                    xmlType: type,
                    ...tempAttr
                }
                const func: FuncToken = {
                    name,
                    pattern,
                    params: attr,
                    text,
                    // DO NOT keep root element token
                    token:
                        element.name === this._root && element.type !== XmlElementType.Text ? '' : element.toString(),
                    // 添加 speakId 到 tempParams
                    tempParams: tempParams,
                    audioId: currentAudioId
                }

                this.emit('data', func)
            } catch (e) {
                // 发生错误时中断Shell并触发错误事件
                this.log.error(e)
                this.onError(e as Error)
            }
        }

        try {
            // 触发关闭事件
            this.emit('closed')
        } catch (e) {
            this.log.error('Error during Shell loop closing:', e)
            this.onError(e as Error)
        }
    }

    /**
     * 在 Node.js 的 EventEmitter 中，当监听器抛出异常时，错误传播遵循以下机制：
     * 监听器抛出异常 → emit() 方法抛出异常 → 调用栈向上传播 → 未捕获则进程崩溃
     * @param error
     * @private
     */
    private onError(error: Error) {
        // 由于关闭后removeAllListeners，故直接log
        try {
            this.emit('error', error)
        } catch (e) {
            this.log.error('Shell Error 未被监听:', error, e)
        }
    }

    /**
     * 类型安全的事件监听方法重写
     * 提供更好的TypeScript类型检查支持
     */
    override on<K extends keyof ShellEvents>(event: K, listener: ShellEvents[K]): this {
        return super.on(event, listener)
    }
    override once<K extends keyof ShellEvents>(event: K, listener: ShellEvents[K]): this {
        return super.once(event, listener)
    }
    override emit<K extends keyof ShellEvents>(event: K, ...args: Parameters<ShellEvents[K]>): boolean {
        return super.emit(event, ...args)
    }
    override off<K extends keyof ShellEvents>(event: K, listener?: ShellEvents[K]): this {
        if (listener) return super.off(event, listener)
        else return this.removeAllListeners(event)
    }
}
