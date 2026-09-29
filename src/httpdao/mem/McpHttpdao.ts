/** @format */

import axios, { AxiosResponse } from 'axios'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'

interface McpDataResponse {
    status: string
    message: string
    data: any
    error: null
    metadata: null
    task_id: null
    state: null
    current: null
    total: null
    result: null
}

/**
 * 记忆服务类
 */
export class McpHttpdao {
    private log = getLogger(McpHttpdao.name)

    private readonly baseUrl: string
    private readonly apiKey: string

    constructor() {
        this.baseUrl = env.MEMORY_API_URL
        this.apiKey = env.MEMORY_API_KEY
    }

    /**
     * 天气查询
     * @returns Promise<MemoryResponse>
     */
    async getWeather(sessionId: string, region: string, weather_type: string): Promise<string> {
        region = encodeURIComponent(region)
        const config = {
            method: 'get' as const,
            url: `${this.baseUrl}/api/v1/prompt_routine/get_weather?region=${region}&weather_type=${weather_type}`,
            headers: {
                'X-API-Key': this.apiKey,
                'X-Session-ID': sessionId,
                'Content-Type': 'application/json'
            }
        }
        try {
            const response: AxiosResponse<McpDataResponse> = await axios(config)

            if (!response.data.data) {
                return `查不到${region}地区天气`
            }
            return JSON.stringify(response.data.data)
        } catch (error) {
            this.log.error('查询天气失败:', config, error)
            return '查询天气失败'
        }
    }

    /**
     * 查询新闻
     * @param sessionId 会话ID
     * @param q 查询关键词
     * @returns Promise<MemoryResponse>
     */
    async getNews(sessionId: string, q: string): Promise<string> {
        q = encodeURIComponent(q)
        const config = {
            method: 'get' as const,
            url: `${this.baseUrl}/api/v1/prompt_routine/get_news?q=${q}&sort_by=date`,
            headers: {
                'X-API-Key': this.apiKey,
                'X-Session-ID': sessionId,
                'Content-Type': 'application/json'
            }
        }
        try {
            const response: AxiosResponse<McpDataResponse> = await axios(config)

            if (!response.data.data) {
                return '查无此新闻'
            }
            return JSON.stringify(response.data.data)
        } catch (error) {
            this.log.error('查询新闻失败:', config, error)
            return '查询新闻失败'
        }
    }

    async serpSearch(sessionId: string, q: string) {
        q = encodeURIComponent(q)
        const config = {
            method: 'get' as const,
            url: `${this.baseUrl}/api/v1/prompt_routine/serp_search?q=${q}&sort_by=date`,
            headers: {
                'X-API-Key': this.apiKey,
                'X-Session-ID': sessionId,
                'Content-Type': 'application/json'
            }
        }
        try {
            const response: AxiosResponse<McpDataResponse> = await axios(config)

            if (!response.data.data) {
                return '查无此结果页'
            }
            return JSON.stringify(response.data.data)
        } catch (error) {
            this.log.error('查询结果页失败:', config, error)
            return '查询结果页失败'
        }
    }
}

// 导出单例实例
export const mcpHttpdao = new McpHttpdao()
