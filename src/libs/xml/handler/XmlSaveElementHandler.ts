/**
 * XML SAVE元素处理器
 * @format
 */

import { XmlElement } from '../XmlElement'
import { Interpreter } from '../Interpreter'
import { ReservedXMLTags } from '../constants.js'
import { Shell } from '../Shell'
import { deviceAgentRunnerHttpdao } from '@httpdao/cocoadmin/DeviceAgentRunnerHttpdao'
import { DeviceAgentRunnerVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { AbstractXmlElementHandler } from './AbstractXmlElementHandler'
import { SocketCommonResponse } from '../../../common/SocketCommonResponse'
import { ResponseEvent, RunnerResponse } from '@interface/IAgent'
import { XmlVoiceElementHandler } from './XmlVoiceElementHandler'
import { CoCoNamespace } from '@interface/ICommon'

/**
 * XML SAVE元素处理器
 * 用于处理<SAVE>标签
 */
export class XmlSaveElementHandler extends AbstractXmlElementHandler {
    /** 标签名 */
    protected static readonly tagName: string = ReservedXMLTags.SAVE

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
        if (e.name.toLowerCase() === ReservedXMLTags.SAVE) {
            this.save()
        }
    }

    /**
     * 保存缓冲到内存
     * @private
     */
    private save(): void {
        const name = this.element?.attr?.name || ''
        const description = this.element?.attr?.description || this.element?.attr?.name || ''

        const xml = this.shell.getXml(this.startIndex, this.endIndex + 1)

        if (!(name && xml)) {
            return
        }

        if (this.shell.shellDeviceInfo.agentId && this.shell.shellDeviceInfo.deviceSN) {
            deviceAgentRunnerHttpdao
                .save(name, description, xml, this.shell.shellDeviceInfo.agentId)
                .then(() => {
                    this.log.info('save device agent runner success')
                    // 匹配成功后响应设备
                    SocketCommonResponse.successToAll<RunnerResponse>({
                        ns: CoCoNamespace.Agent,
                        event: ResponseEvent.RUNNER_ADD,
                        msg: '',
                        room: this.shell.shellDeviceInfo.deviceSN,
                        data: {
                            name: name,
                            description: description,
                            xml: xml
                        }
                    })
                })
                .catch(err => {
                    this.log.error('save device agent runner error', err)
                })
        }
    }

    public static replaced(skillList: DeviceAgentRunnerVO[], content: string) {
        // 拼接技能表
        let skillStr: string = '\n'
        for (const deviceAgentRunner of skillList) {
            skillStr += ` - <RUN name="${deviceAgentRunner.name}" />，描述：${deviceAgentRunner.description}\n`
        }
        // 替换 ${skillStr}
        const result = content.replace(/\${skillStr}/g, skillStr)
        return result
    }
}
