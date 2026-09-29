/**
 * XML SAVE元素处理器
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { Shell } from '../Shell'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'

/**
 * XML SAVE元素处理器
 * 用于处理<SAVE>标签
 */
export class XmlAgentElementHandler extends AbstractXmlElementHandler {
    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)
        this.register()

        // 触发多Agent
        this.multiAgent(element.attr)
    }

    /**
     * 重写onData - AGENT标签需要收集XML内容
     */

    private multiAgent(attr: Record<string, string>) {
        if (attr.name === 'trigger') {
            this.shell?.emit('agentTrigger', attr.input)
        }
    }
}
