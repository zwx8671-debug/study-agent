/**
 * XML元素处理器
 *
 * 提供事件驱动的XML元素处理功能，将解析器事件转发给Shell进行处理
 * 支持嵌套的XML元素处理，通过父子关系管理处理器的生命周期
 * 为不同类型的XML元素（开放标签、关闭标签、自闭合标签、文本）提供专门的处理逻辑
 *
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { Shell } from '../Shell'

import { ReservedXMLTags } from '../constants'

import { XmlSaveElementHandler } from './XmlSaveElementHandler'
import { XmlNoVoiceElementHandler } from './XmlNoVoiceElementHandler'
import { XmlVoiceElementHandler } from './XmlVoiceElementHandler'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'
import { XmlPromptElementHandler } from './XmlPromptElementHandler'
import { XmlAgentElementHandler } from './XmlAgentElementHandler'
import { XmlDelTriggerElementHandler } from './trigger/XmlDelTriggerElementHandler'
import { XmlNewTriggerElementHandler } from './trigger/XmlNewTriggerElementHandler'
import { XmlStartTriggerElementHandler } from './trigger/XmlStartTriggerElementHandler'
import { XmlStopTriggerElementHandler } from './trigger/XmlStopTriggerElementHandler'
import { XmlUpdateTriggerElementHandler } from './trigger/XmlUpdateTriggerElementHandler'

/**
 * XML元素处理器类
 *
 * 负责监听和处理XML解释器发出的元素事件
 * 将解析出的XML元素转发给Shell进行进一步处理
 * 支持嵌套元素的层次化处理，保证父子元素的正确关系
 */
export class XmlElementHandler extends AbstractXmlElementHandler {
    /**
     * 构造函数
     * @param interpreter
     * @param shell
     * @param parent
     * @param element
     */
    constructor(interpreter: Interpreter, shell: Shell, parent?: AbstractXmlElementHandler, element?: XmlElement) {
        super(interpreter, shell, parent, element)
        this.register()
    }

    /**
     * 处理开放标签XML元素
     * @param e - 开放标签元素
     * @protected
     */
    protected onOpen(e: XmlElement): void {
        if (e.name.toLowerCase() === ReservedXMLTags.SAVE) {
            // 处理SAVE标签
            new XmlSaveElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.NOVOICE) {
            // 处理NOVOICE标签
            new XmlNoVoiceElementHandler(this.interpreter, this.shell, this, e)
        }
        // 处理触发器标签 开始
        else if (e.name.toLowerCase() === ReservedXMLTags.NEW_TRIGGER) {
            new XmlNewTriggerElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.UPDATE_TRIGGER) {
            new XmlUpdateTriggerElementHandler(this.interpreter, this.shell, this, e)
        }
        // 处理触发器标签 结束
        else if (e.name.toLowerCase() === ReservedXMLTags.VOICE) {
            // 处理VOICE标签
            new XmlVoiceElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.PROMPT) {
            // 处理 PROMPT 标签
            new XmlPromptElementHandler(this.interpreter, this.shell, this, e)
        } else {
            new XmlElementHandler(this.interpreter, this.shell, this, e)
        }
    }

    protected onSelfClose(e: XmlElement) {
        if (e.name.toLowerCase() === ReservedXMLTags.AGENT) {
            // 处理 Agent 标签
            new XmlAgentElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.DEL_TRIGGER) {
            new XmlDelTriggerElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.START_TRIGGER) {
            new XmlStartTriggerElementHandler(this.interpreter, this.shell, this, e)
        } else if (e.name.toLowerCase() === ReservedXMLTags.STOP_TRIGGER) {
            new XmlStopTriggerElementHandler(this.interpreter, this.shell, this, e)
        } else {
            super.onSelfClose(e)
        }
    }
}
