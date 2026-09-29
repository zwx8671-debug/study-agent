/**
 * XML流式解析器
 *
 * 实现了一个自定义的流式XML解析器，不依赖第三方库
 * 支持增量解析和一次性解析两种模式，提供事件驱动的解析方式
 * 能够处理XML标签、文本内容、属性、注释和CDATA等结构
 *
 * @format
 */

import { EventEmitter } from 'events'
import { XmlElement, XmlElementType, XmlEventListener } from './XmlElement'
import { getLogger } from '@utils/Logger'

export class Interpreter extends EventEmitter {
    private log = getLogger('Interpreter')

    /** 输入缓冲区，存储待解析的XML字符串 */
    private buffer: string = ''
    /** 标签栈，用于跟踪嵌套的XML标签 */
    private tagStack: string[] = []
    /** 已解析的XML元素列表，常用与同步代码 */
    private elements: XmlElement[] = []

    /**
     * 开始解析。root参数可选，如果传入，则会先自动push该字符串。
     * @param root - 可选的根元素字符串，在解析开始时自动添加
     * @throws {Error} 如果解析器已在解析状态中
     */
    start(root: string = ''): Interpreter {
        this.emit('start')
        if (root) {
            this.push(root)
        }
        return this
    }

    /**
     * 结束解析。root参数可选，如果传入，则会先push该字符串再关闭。
     * @param root - 可选的结束标签字符串，在解析结束前自动添加
     */

    close(root: string = ''): Interpreter {
        if (root) {
            this.push(root)
        }
        this.emit('close')

        // 主要是清除事件监听
        this.clean()
        return this
    }

    /**
     * 向解析器输入一段XML文本
     * @param chunk - 要解析的XML字符串片段
     * @description 无需等待interpreter开始loop，可以随时push数据。
     */
    push(chunk: string): Interpreter {
        this.buffer += chunk
        try {
            this.parse()
        } catch (e) {
            const error = e as Error
            // 记录错误日志
            this.log.errorMsg('XML parse error:', { errorMsg: error })
            // 触发错误事件，让上层处理
            this.emit('error', error)
        }
        return this
    }

    /**
     * 清理资源
     */
    clean() {
        this.buffer = ''
        this.tagStack = []
        this.removeAllListeners()
    }

    getBuffer(): XmlElement[] {
        return this.elements
    }

    /**
     * 静态方法：将XML元素序列化为字符串
     */
    static toXml(elements: XmlElement[]): string {
        return elements.map(e => e.toString()).join('')
    }

    /**
     * 真正的解析逻辑都写在这里。
     * 每次push都会不断提取标签或文本节点，生成XmlElement并触发事件。
     */
    private parse() {
        while (true) {
            // 1. 先检测注释与CDATA，如果匹配就直接处理
            if (this.buffer.startsWith('<!--')) {
                // 查找注释闭合位置
                const endIdx = this.buffer.indexOf('-->', 4)
                // 注释还没接收完，等待更多 chunk
                if (endIdx === -1) break
                // 跳过注释内容（不生成节点），直接从 buffer 删除
                this.buffer = this.buffer.slice(endIdx + 3)
                continue
            } else if (this.buffer.startsWith('<![CDATA[')) {
                // 查找CDATA闭合位置
                const endIdx = this.buffer.indexOf(']]>')
                // CDATA还没接收完，等待更多 chunk
                if (endIdx === -1) break
                // 生成一个文本节点
                const cdataText = this.buffer.slice(0, endIdx + 3)
                this.emitTextNode(cdataText, 'false')
                // 移除已处理部分
                this.buffer = this.buffer.slice(endIdx + 3)
                continue
            }

            // 2. 匹配 "文本<标签>" 结构
            const tagMatch = this.buffer.match(/^([^<]*)<([^>]+)>/s)
            if (tagMatch) {
                // 有文本部分
                if (tagMatch[1]) this.emitTextNode(tagMatch[1])

                // 处理标签部分
                let tagStr = tagMatch[2].trim()
                let type: XmlElementType = XmlElementType.Open
                let name = ''
                let attr: Record<string, string> = {}

                if (tagStr.startsWith('/')) {
                    // </close>
                    type = XmlElementType.Close
                    name = tagStr.slice(1).trim()
                } else if (tagStr.endsWith('/')) {
                    // <self-close/>
                    type = XmlElementType.SelfClose
                    tagStr = tagStr.slice(0, -1).trim()
                }

                if (type === XmlElementType.Open || type === XmlElementType.SelfClose) {
                    const m2 = tagStr.match(/^([^\s]+)(.*)$/s)
                    if (!m2) throw new Error(`Malformed XML tag: <${tagStr}>`)

                    name = m2[1]
                    attr = this.parseAttrs(m2[2])
                }

                // 校验Open/Close平衡
                if (type === XmlElementType.Open) {
                    this.tagStack.push(name)
                } else if (type === XmlElementType.Close) {
                    if (this.tagStack.length === 0 || this.tagStack[this.tagStack.length - 1] !== name) {
                        throw new Error(
                            `XML parse error: closing tag mismatch for </${this.tagStack[this.tagStack.length - 1]}>`
                        )
                    }
                    this.tagStack.pop()
                }

                // emit事件
                const el = new XmlElement({ type, name, attr, text: '' })
                this.elements.push(el)
                this.emit('data', el)

                // 从 buffer 中去掉已处理部分
                this.buffer = this.buffer.slice(tagMatch[0].length)
            } else {
                // 找不到 "<" 或下一匹配，说明剩下都是文本或等待更多数据
                if (this.buffer && !this.buffer.includes('<')) {
                    this.emitTextNode(this.buffer)
                    this.buffer = ''
                }
                break
            }
        }
    }

    /**
     * 解析标签后的属性字符串，形如: attr1="val" attr2='val'
     */
    private parseAttrs(str: string): Record<string, string> {
        const attrs: Record<string, string> = {}
        const trimmed = str.trim()

        // 使用 replace 捕获并替换已匹配到的合法属性
        const leftover = trimmed.replace(/([a-zA-Z0-9_\-:]+)\s*=\s*(['"])(.*?)\2/g, (match, key, _q, val) => {
            // 解码实体
            attrs[key] = this.decodeEntities(val)
            return '' // 将已解析部分替换为空
        })

        // 如果替换后还残留非空字符，说明有无法识别的属性格式
        if (leftover.trim().length > 0) {
            throw new Error(`Malformed attribute string: "${leftover.trim()}"`)
        }

        return attrs
    }
    /**
     * 产生文本节点并解码实体
     */
    private emitTextNode(rawText: string, needTTS: string = 'true') {
        const text = this.decodeEntities(rawText)
        const textNode = new XmlElement({ type: XmlElementType.Text, text })
        // cdata 节点不需要TTS
        if (needTTS === 'false') {
            const tempAttr: Record<string, string> = {}
            tempAttr.needTTS = needTTS
            textNode.tempAttr = tempAttr
        }
        this.elements.push(textNode)
        this.emit('data', textNode)
    }

    /**
     * 解码常见实体，如 &lt; &gt; &amp; &quot; &apos;
     */
    private decodeEntities(src: string): string {
        return src
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
    }

    /**
     * Event safety function overrides
     */
    override on<K extends keyof XmlEventListener>(event: K, listener: XmlEventListener[K]): this {
        return super.on(event, listener)
    }

    override once<K extends keyof XmlEventListener>(event: K, listener: XmlEventListener[K]): this {
        return super.once(event, listener)
    }

    override off<K extends keyof XmlEventListener>(event: K, listener?: XmlEventListener[K]): this {
        if (listener) return super.off(event, listener)
        else return this.removeAllListeners(event)
    }

    override emit<K extends keyof XmlEventListener>(event: K, ...args: Parameters<XmlEventListener[K]>): boolean {
        return super.emit(event, ...args)
    }
}
