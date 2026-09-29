/**
 * XML PROMPT 元素处理器
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { ReservedXMLTags } from '../constants.js'
import { LLM_COUNT, Shell } from '../Shell'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'
import { POManager } from '../../POM/POMnager'

/**
 * XML PROMPT 元素处理器
 * 用于处理<PROMPT>标签
 */
export class XmlPromptElementHandler extends AbstractXmlElementHandler {
    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)
        this.register()
    }

    protected onClose(e: XmlElement) {
        super.onClose(e)
        // 只在TRIGGER标签闭合时保存，避免内部标签闭合时重复保存
        if (e.name.toLowerCase() === ReservedXMLTags.PROMPT) {
            this.junction()
        }
    }

    /**
     * 重写onData - PROMPT标签需要收集XML内容
     */

    private junction() {
        const xml = this.shell.getXml(this.startIndex, this.endIndex + 1)
        this.log.info('prompt:', xml)

        if (
            this.shell.shellDeviceInfo.sessionId &&
            this.shell.shellDeviceInfo.deviceSN &&
            this.shell.shellDeviceInfo.agentId
        ) {
            // 解析Prompt标签数据
            const pm = new POManager(xml, {
                deviceSN: this.shell.shellDeviceInfo.deviceSN,
                sessionId: this.shell.shellDeviceInfo.sessionId,
                agentId: this.shell.shellDeviceInfo.agentId,
                productId:
                    this.shell.shellDeviceInfo.productId !== undefined
                        ? String(this.shell.shellDeviceInfo.productId)
                        : '',
                spaceId: this.shell.shellDeviceInfo.spaceId || ''
            })

            // 最后一次接流没必要在读取了
            if (this.shell!.llmCount < LLM_COUNT) {
                pm.parse()
                    .then(prompt => {
                        this.log.info('[POManager] parse() result:', prompt)
                        const routineNames = pm.collectRoutineTagNames()
                        this.shell?.emit('prompt', prompt, routineNames)
                    })
                    .catch(e => {
                        this.log.error(e)
                    })
            }
        }
    }
}
