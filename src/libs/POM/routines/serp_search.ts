/** @format */

import { mcpHttpdao } from '../../../httpdao/mem/McpHttpdao'

/**
 * 查询新闻
 * @param q 查询关键词，字符串
 * @param sessionAttrs 会话属性、模型无需传入
 */
export async function serp_search(q: string, sessionAttrs: Record<string, string>): Promise<string> {
    const sessionId = sessionAttrs['sessionId']
    return await mcpHttpdao.serpSearch(sessionId, q)
}
