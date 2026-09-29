/** @format */

import { lampMemoryHttpdao } from '@httpdao/mem/LampMemoryHttpdao'

type TargetLevel = 'segment' | 'event' | 'daily' | 'weekly'

const VALID_TARGET_LEVELS: TargetLevel[] = ['segment', 'event', 'daily', 'weekly']

function isTargetLevel(v: string): v is TargetLevel {
    return (VALID_TARGET_LEVELS as string[]).includes(v)
}

/**
 * lamp 记忆检索（仅 cocolamp / productId=7）
 *
 * 示例：
 * <lamp_search_memory query="猫" start_time="2026-04-23 08:00:00" end_time="2026-04-23 18:00:00" target_level="segment" />
 *
 * @param query 搜索关键词（可包含指代，优先由模型在生成时消解）
 * @param start_time 开始时间，可为空
 * @param end_time 结束时间，可为空
 * @param target_level 检索粒度，必填：segment|event|daily|weekly
 * @param sessionAttrs 会话属性、模型无需传入
 */
export async function lamp_search_memory(
    query: string,
    start_time: string,
    end_time: string,
    target_level: string,
    sessionAttrs: Record<string, string>
): Promise<string> {
    try {
        const spaceId = sessionAttrs['spaceId']

        if (!spaceId) {
            return JSON.stringify({ error: '缺少 spaceId，无法查询记忆' })
        }
        if (!target_level) {
            return JSON.stringify({ error: '缺少 target_level，无法查询记忆' })
        }
        if (!isTargetLevel(target_level)) {
            return JSON.stringify({
                error: 'target_level 非法，必须为 segment|event|daily|weekly',
                target_level
            })
        }

        const normalizedQuery = (query ?? '').trim()
        const hasQuery = normalizedQuery.length > 0
        const hasStartTime = Boolean(start_time)
        const hasEndTime = Boolean(end_time)

        if (hasStartTime !== hasEndTime) {
            return JSON.stringify({
                error: 'start_time 与 end_time 必须成对出现',
                start_time: start_time || undefined,
                end_time: end_time || undefined
            })
        }

        if (!hasQuery && !(hasStartTime && hasEndTime)) {
            return JSON.stringify({ error: 'query 与时间范围(start_time/end_time)至少提供一个' })
        }

        const question = hasQuery ? normalizedQuery : undefined

        const items = await lampMemoryHttpdao.retrieveChatMemory(
            spaceId,
            question,
            3,
            false,
            start_time || undefined,
            end_time || undefined,
            target_level
        )

        return JSON.stringify(items)
    } catch (e) {
        return JSON.stringify({ error: `lamp_search_memory 调用失败: ${String(e)}` })
    }
}
