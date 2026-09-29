/** @format */
import { Interpreter } from '../Interpreter'
import { XmlElement, XmlElementType } from '../XmlElement'
import { Shell } from '../Shell'
import { getLogger } from '@utils/Logger'

export abstract class AbstractXmlElementHandler {
    protected log = getLogger(this.constructor.name)
    /** XML解释器实例 */
    protected interpreter: Interpreter
    /** Shell实例，用于接收处理后的元素 */
    protected shell: Shell
    /** 父元素处理器 */
    protected parent?: AbstractXmlElementHandler
    /** 当前处理的XML元素 */
    protected element?: XmlElement
    /** 标签名 */
    protected tag: string = ''
    /** 当前XML元素Handler中的起始索引 */
    protected startIndex: number = 0
    protected endIndex: number = 0
    /** 起始节点 */
    protected root: boolean = false

    protected constructor(
        interpreter: Interpreter,
        shell: Shell,
        parent?: AbstractXmlElementHandler,
        element?: XmlElement
    ) {
        this.interpreter = interpreter
        this.element = element
        this.shell = shell
        this.parent = parent

        // 只有起始节点没有元素
        if (element) {
            this.tag = element.name.toLowerCase()
            this.startIndex = this.appendShell(element)
        } else {
            this.root = true
        }
    }

    /**
     * 注册事件监听器
     * @public
     */
    public register(): void {
        if (this.interpreter) {
            // 避免冗余事件注册
            this.interpreter.off('data')
            this.log.debug('off register')
            this.interpreter.on('data', e => this.onData(e))
            this.log.debug(`register ${this.constructor.name}`)
        }
    }

    /**
     * 处理XML元素数据事件
     * @param e - XML元素
     * @protected
     */
    protected onData(e: XmlElement): void {
        switch (e.type) {
            case XmlElementType.Open:
                this.onOpen(e)
                break
            case XmlElementType.Close:
                this.onClose(e)
                break
            case XmlElementType.SelfClose:
                this.onSelfClose(e)
                break
            case XmlElementType.Text:
                this.onText(e)
                break
            default:
                return
        }
    }

    /**
     * 处理开放标签XML元素
     * @protected
     * @param e
     */
    protected onOpen(e: XmlElement): void {
        this.appendShell(e)
    }

    /**
     * 处理文本节点
     * @param e - 文本元素
     * @protected
     */
    protected onText(e: XmlElement): void {
        this.appendShell(e)
    }

    /**
     * 将XML元素映射到Shell并添加
     * @param e - XML元素
     * @protected
     */
    protected appendShell(e: XmlElement): number {
        if (!this.shell) {
            return 0
        }

        return this.shell.push(e)
    }

    /**
     * 处理自闭合标签XML元素
     * @param e - 自闭合标签元素
     * @protected
     */
    protected onSelfClose(e: XmlElement): void {
        this.appendShell(e)
    }

    /**
     * 处理关闭标签XML元素
     * @param e - 关闭标签元素
     * @protected
     */
    protected onClose(e: XmlElement): void {
        this.endIndex = this.appendShell(e)

        if (e.name.toLowerCase() === this.tag && this.parent) {
            // 将interpreter交还给父处理器
            this.parent.register()
        }
    }
}
