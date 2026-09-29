/** @format */

import { mcpHttpdao } from '../../../httpdao/mem/McpHttpdao'

/**
 * 天气查询
 * @param region 地区(最小行政区单位)
 * @param weather_type 'base'(实况)/'all'(预报)
 * @param sessionAttrs 会话属性、模型无需传入
 */
export async function get_weather(
    region: string,
    weather_type: string,
    sessionAttrs: Record<string, string>
): Promise<string> {
    const sessionId = sessionAttrs['sessionId']
    return await mcpHttpdao.getWeather(sessionId, region, weather_type ?? 'base')
}
