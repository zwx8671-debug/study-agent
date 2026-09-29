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
import { PomTriggerVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { XmlVoiceElementHandler } from '../XmlVoiceElementHandler'
import { TriggerResponseEvent } from '@interface/IAgentTrigger'
import { CoCoNamespace } from '@interface/ICommon'
import { TriggerAttr } from './TriggerInterface'

/**
 * XML SAVE元素处理器
 * 用于处理<SAVE>标签
 */
export class XmlDelTriggerElementHandler extends AbstractXmlElementHandler {
    constructor(interpreter: Interpreter, shell: Shell, parent: AbstractXmlElementHandler, element: XmlElement) {
        super(interpreter, shell, parent, element)

        // 只是为了处理数据库，不做其他，所以不抢占interpreter的控制权
        // this.register()

        // 处理数据库
        this.save()
    }

    /**
     * 保存
     * @private
     */
    private save(): void {
        const attr: TriggerAttr = this.element?.attr as unknown as TriggerAttr
        const name = attr?.id || ''
        if (!this.shell.shellDeviceInfo.agentId) {
            this.log.error('agent id is null')
            return
        }

        if (pomTriggerHttpdao && name) {
            // TODO 入参id 删除数据
            pomTriggerHttpdao.delTrigger(name, this.shell.shellDeviceInfo.agentId).then(pomTrigger => {
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
