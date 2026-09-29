/** @format */

import axios, { AxiosResponse } from 'axios'
import { Prompt } from 'uniai'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'
import $ from '../../utils/util'

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

interface LatestMemoryRequest {
    space_id: string
}

interface RetrieveMemoryRequest {
    space_id: string
    question?: string
    limit?: number
    is_debug?: boolean
    start_time?: string
    end_time?: string
    target_level?: 'segment' | 'event' | 'daily' | 'weekly'
}

/** POST /api/v1/memory/chat/retrieve 单条结果里 persons 元素 */
export interface RetrieveMemoryPerson {
    id: string
    name?: string
    type?: string
    duration?: number
}

/**
 * 检索结果条目中 memory_card。
 * 优先使用 video_path；无则可用 video_url（完整 URL，由业务侧取 pathname）。
 */
export interface RetrieveMemoryCard {
    sub_scene?: string
    video_path?: string
}

/**
 * POST /api/v1/memory/chat/retrieve 返回的 data 数组元素（与 lamp_search_memory routine JSON.stringify(items) 结构一致）
 */
export interface RetrieveMemoryItem {
    video_id?: string
    device_id?: string
    space_id?: string
    shooting_at?: string
    end_at?: string
    title?: string
    summary?: string
    tags?: string[]
    scene_type?: string
    activity_type?: string
    emotion?: string
    time_of_day?: string
    persons?: RetrieveMemoryPerson[]
    overall_quality_score?: number
    is_worth_preserving?: boolean
    memory_card?: RetrieveMemoryCard
    [k: string]: unknown
}

interface RetrieveMemoryResponse {
    code: number
    message: string
    data?: RetrieveMemoryItem[]
}

export class LampMemoryHttpdao {
    private log = getLogger('LampMemoryHttpdao')

    /** lamp 记忆服务根地址，来自环境变量 LAMP_MEMORY_BASE_URL（见 @config/env） */
    private readonly baseUrl: string = env.LAMP_MEMORY_BASE_URL
    private readonly apiKey: string = ''

    private buildHeaders() {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        // key 暂时为空：不发送 X-API-Key
        if (this.apiKey) headers['X-API-Key'] = this.apiKey
        return headers
    }

    /**
     * 最近记忆（cocolamp  productId=7 新接口）
     * POST /api/v1/memory/latest
     */
    async latestMemory(spaceId: string): Promise<Prompt | null> {
        if (!spaceId) {
            this.log.warn('latestMemory 缺少 spaceId')
            return null
        }

        const config = {
            method: 'post' as const,
            url: `${this.baseUrl}/api/v1/memory/latest`,
            headers: this.buildHeaders(),
            data: { space_id: spaceId } satisfies LatestMemoryRequest
        }

        try {
            const resp: AxiosResponse<MemoryResponse> = await axios(config)
            if (resp.data?.data) {
                return Prompt.fromMarkdown(resp.data.data)
            }
            this.log.warnMsg(`latestMemory 返回失败: ${resp.data?.message || 'unknown'}`, { spaceId })
            return null
        } catch (e) {
            this.log.errorMsg(`latestMemory 请求异常: ${$.stringify(config)}`, { errorMsg: e })
            return null
        }
    }

    /**
     * 记忆检索（cocolamp  productId=7 新接口）
     * POST /api/v1/memory/chat/retrieve
     */
    async retrieveChatMemory(
        spaceId: string,
        question?: string,
        limit: number = 3,
        isDebug: boolean = false,
        startTime?: string,
        endTime?: string,
        targetLevel?: 'segment' | 'event' | 'daily' | 'weekly'
    ): Promise<RetrieveMemoryItem[]> {
        if (!spaceId) {
            this.log.warn('retrieveChatMemory 缺少 spaceId')
            return []
        }
        const normalizedQuestion = (question ?? '').trim()
        const hasQuestion = normalizedQuestion.length > 0
        const hasStartTime = Boolean(startTime)
        const hasEndTime = Boolean(endTime)

        if (hasStartTime !== hasEndTime) {
            this.log.warnMsg('retrieveChatMemory start_time 与 end_time 必须成对出现', {
                spaceId,
                startTime: startTime || undefined,
                endTime: endTime || undefined
            })
            return []
        }

        if (!hasQuestion && !(hasStartTime && hasEndTime)) {
            this.log.warn('retrieveChatMemory 缺少 question 且未提供时间范围')
            return []
        }

        const config = {
            method: 'post' as const,
            url: `${this.baseUrl}/api/v1/memory/chat/retrieve`,
            headers: this.buildHeaders(),
            data: {
                space_id: spaceId,
                ...(hasQuestion ? { question: normalizedQuestion } : {}),
                limit,
                is_debug: isDebug,
                start_time: startTime,
                end_time: endTime,
                target_level: targetLevel
            } satisfies RetrieveMemoryRequest
        }

        try {
            const resp: AxiosResponse<RetrieveMemoryResponse> = await axios(config)
            if (resp.data?.code === 0 && Array.isArray(resp.data.data)) {
                return resp.data.data
            }
            this.log.warnMsg(`retrieveChatMemory 返回失败: ${resp.data?.message || 'unknown'}`, { spaceId })
            return []
        } catch (e) {
            this.log.errorMsg(`retrieveChatMemory 请求异常: ${$.stringify(config)}`, { errorMsg: e })
            return []
        }
    }
}

export const lampMemoryHttpdao = new LampMemoryHttpdao()
