/** @format */
import { PomTriggerVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'

export interface TriggerAttr {
    id: string
    description: string
    save: string
}

export class TriggerInterface {
    public static replaced(triggers: PomTriggerVO[], content: string) {
        // 拼接技能表
        let triggerStr: string = '\n'
        for (const trigger of triggers) {
            triggerStr += ` - <TRIGGER name="${trigger.name}" />，描述：${trigger.description}\n`
        }
        // 替换 ${triggerStr}
        const result = content.replace(/\${triggerStr}/g, triggerStr)
        return result
    }
}
