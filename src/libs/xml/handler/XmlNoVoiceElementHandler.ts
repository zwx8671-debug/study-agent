/**
 * XML THINK元素处理器
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { Shell } from '../Shell'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'

/**
 * XML THINK元素处理器
 * 用于处理<THINK>标签
 */
export class XmlNoVoiceElementHandler extends AbstractXmlElementHandler {
    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)
        this.register()
    }

    /**
     * 处理文本节点 - NOVOICE 标签的文本不需要TTS
     * @param e - 文本元素
     * @protected
     */
    protected onText(e: XmlElement): void {
        // think 标签的text节点不需要TTS
        e.tempAttr.needTTS = 'false'
        this.appendShell(e)
    }
}
