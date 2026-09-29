/**
 * XML SAVE元素处理器
 * @format
 */

import { XmlElement } from '../../XmlElement'
import { Interpreter } from '../../Interpreter'
import { ReservedXMLTags } from '../../constants'
import { Shell } from '../../Shell'
import { SocketCommonResponse } from '../../../../common/SocketCommonResponse'
import { pomTriggerHttpdao } from '@httpdao/cocoadmin/PomTriggerHttpdao'
import { AbstractXmlElementHandler } from '../AbstractXmlElementHandler'
import { XmlVoiceElementHandler } from '../XmlVoiceElementHandler'
import { TriggerResponseEvent } from '@interface/IAgentTrigger'
import { CoCoNamespace } from '@interface/ICommon'
import { TriggerAttr } from './TriggerInterface'

/**
 * XML SAVE元素处理器
 * 用于处理<SAVE>标签
 */
export class XmlNewTriggerElementHandler extends AbstractXmlElementHandler {
    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)
        this.register()
    }

    protected onOpen(e: XmlElement) {
        if (e.name.toLowerCase() === ReservedXMLTags.VOICE) {
            // 处理VOICE标签
            new XmlVoiceElementHandler(this.interpreter, this.shell, this, e)
        } else {
            super.onOpen(e)
        }
    }

    protected onClose(e: XmlElement) {
        super.onClose(e)
        // 只在TRIGGER标签闭合时保存，避免内部标签闭合时重复保存
        if (e.name.toLowerCase() === ReservedXMLTags.NEW_TRIGGER) {
            this.save()
        }
    }

    /**
     * 保存
     * @private
     */
    private save(): void {
        const attr: TriggerAttr = this.element?.attr as unknown as TriggerAttr
        const name = attr?.id || ''
        const description = attr?.description || ''
        if (!this.shell.shellDeviceInfo.agentId) {
            this.log.error('agent id is null')
            return
        }

        // 不存最外层标签
        const xml = this.shell.getXml(this.startIndex + 1, this.endIndex)

        if (pomTriggerHttpdao && name && xml) {
            pomTriggerHttpdao
                .saveTrigger(name, xml, description, this.shell.shellDeviceInfo.agentId)
                .then(pomTrigger => {
                    // 触发保存成功事件
                    // 匹配成功后响应设备
                    SocketCommonResponse.successToAll<null>({
                        ns: CoCoNamespace.AgentTrigger,
                        event: TriggerResponseEvent.TRIGGER_CHANGE,
                        msg: pomTrigger!.msg,
                        room: this.shell.shellDeviceInfo.deviceSN,
                        data: null
                    })
                })
        }
    }
}
