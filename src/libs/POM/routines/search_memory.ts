/** @format */

import { memoryHttpdao } from '../../../httpdao/mem/MemoryHttpdao'

/**
 * 搜索记忆，以下参数至少有一个
 * @param year 年份，整型 [1,9999]，可缺省
 * @param month 月份，整型 [1,12]，可缺省
 * @param day 日期，整型 [1,31]，可缺省
 * @param week 周数，整型 [1,53]，可缺省
 * @param user_name 记忆用户名称，字符串，可缺省
 * @param query 语义搜索关键词，用于模糊检索，可缺省
 * @param sessionAttrs 会话属性、模型无需传入
 */
export async function search_memory(
    year: string,
    month: string,
    day: string,
    week: string,
    user_name: string,
    query: string,
    sessionAttrs: Record<string, string>
): Promise<string> {
    try {
        // coco 机器人：沿用旧接口（按 sessionId）
        const sessionId = sessionAttrs['sessionId']
        const result = await memoryHttpdao.searchMemoryData(sessionId, {
            year: year ? parseInt(year) : undefined,
            month: month ? parseInt(month) : undefined,
            day: day ? parseInt(day) : undefined,
            week: week ? parseInt(week) : undefined,
            user_name: user_name,
            query: query
        })

        return result
    } catch (e) {
        // 如果请求失败，返回错误信息
        return `# http\n\nError fetching prompt from ${query}: ${e}`
    }
}
