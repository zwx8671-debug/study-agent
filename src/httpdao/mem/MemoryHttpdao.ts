/** @format */

import axios, { AxiosResponse } from 'axios'
import { env } from '@config/env'
import { Prompt } from 'uniai'
import { getLogger } from '@utils/Logger'
import $ from '../../utils/util'

/**
 * 记忆服务响应接口
 */
interface MemoryResponse {
    status: string
    message: string
    data: string
    error: null | string
    metadata: any
    task_id: null | string
    state: null | string
    current: null | number
    total: null | number
    result: null | any
}

interface SearchMemoryResponse<T> {
    status: string
    message: string
    data: T
}

/**
 * 搜索记忆请求参数接口
 */
interface SearchMemoryRequest {
    year?: number
    month?: number
    day?: number
    week?: number
    user_name?: string
    query?: string
}

/**
 * 记忆服务类
 */
export class MemoryHttpdao {
    private log = getLogger('MemoryHttpdao')

    private readonly baseUrl: string
    private readonly apiKey: string

    constructor() {
        this.baseUrl = env.MEMORY_API_URL
        this.apiKey = env.MEMORY_API_KEY
    }

    private buildHeaders() {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        // 按原 MemoryHttpdao 风格，提供 X-API-Key（若为空则不发送）
        if (this.apiKey) headers['X-API-Key'] = this.apiKey
        return headers
    }

    /**
     * 获取主要记忆信息
     * @param sessionId 会话ID
     * @returns Promise<MemoryResponse>
     */
    async getMainMemories(sessionId: string): Promise<Prompt | null> {
        try {
            if (!this.baseUrl) {
                this.log.warn('MEMORY_API_URL 未配置，跳过 getMainMemories')
                return null
            }
            const config = {
                method: 'get' as const,
                url: `${this.baseUrl}/api/v1/memories/main`,
                headers: {
                    ...this.buildHeaders(),
                    'X-Session-ID': sessionId,
                }
            }

            const response: AxiosResponse<MemoryResponse> = await axios(config)

            if (response.data.status === 'ok' && response.data) {
                return Prompt.fromMarkdown(response.data.data)
            }
        } catch (error) {
            this.log.error('获取记忆信息失败:', error)
        }
        return null
    }
    /**
     * 获取主要记忆信息
     * @param sessionId 会话ID
     * @returns Promise<MemoryResponse>
     */
    async getMainMemoriesSelfReflection(sessionId: string): Promise<Prompt | null> {
        if (!this.baseUrl) {
            this.log.warn('MEMORY_API_URL 未配置，跳过 getMainMemoriesSelfReflection')
            return null
        }
        const config = {
            method: 'get' as const,
            url: `${this.baseUrl}/api/v1/memories/self_reflection`,
            headers: {
                ...this.buildHeaders(),
                'X-Session-ID': sessionId,
            }
        }
        try {
            this.log.debug('请求参数：', config)

            const response: AxiosResponse<MemoryResponse> = await axios(config)

            if (response.data.status === 'ok' && response.data) {
                return Prompt.fromMarkdown(response.data.data)
            }
        } catch (error) {
            this.log.errorMsg(`获取记忆信息失败: ${$.stringify(config)}`, { errorMsg: error })
        }
        return null
    }

    /**
     * 搜索记忆数据 (测试环境专用)
     * @param sessionId 会话ID
     * @param params 搜索参数
     * @returns Promise<SearchMemoryData[] | null>
     */
    async searchMemoryData(sessionId: string, params: SearchMemoryRequest): Promise<string> {
        try {
            if (!this.baseUrl) {
                this.log.warn('MEMORY_API_URL 未配置，跳过 searchMemoryData')
                return ''
            }
            // 构建查询参数
            const queryParams = new URLSearchParams()
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, value.toString())
                }
            })

            const url = `${this.baseUrl}/api/v1/memories/search?${queryParams.toString()}`

            const config = {
                method: 'get' as const,
                url: url,
                headers: {
                    ...this.buildHeaders(),
                    'X-Session-ID': sessionId,
                    accept: 'application/json'
                }
            }
            this.log.info('请求参数：', config)

            const response: AxiosResponse<SearchMemoryResponse<string>> = await axios(config)

            if (response.data.status === 'ok' && response.data.data) {
                return response.data.data
            }
        } catch (error) {
            this.log.error('搜索记忆数据失败:', error)
        }
        return ''
    }
}

// 导出单例实例
export const memoryHttpdao = new MemoryHttpdao()
