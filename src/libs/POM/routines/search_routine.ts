/** @format */

import { RoutineService } from '@service/RoutineService'
import { getInstanceByToken } from 'fastify-decorators'

/**
 * Routine 检索
 * @param name routine名称,可选值['bgm' | 'sfx' | 'coco' | 'common' | 'vision' | 'didi_mcp' | 'amap_mcp' | 'baidu_map_mcp' | 'home_assistant_mcp' | 'telnet' | 'body' | 'face' | 'ear' | 'head' | 'figure']
 * @param sessionAttrs 会话属性、模型无需传入
 */
export async function search_routine(name: string, sessionAttrs: Record<string, string>): Promise<string> {
    try {
        const agentId = sessionAttrs['agentId']
        const routineService = getInstanceByToken<RoutineService>(RoutineService)
        const prompts = await routineService.getDynamicRoutinesByAgentId(name, agentId)
        let text: string = ''
        for (const prompt of prompts) {
            text += prompt.toString() + '\n'
        }
        return text
    } catch (e) {
        // 如果请求失败，返回错误信息
        return `# http\n\nError fetching prompt from ${name}: ${e}`
    }
}
