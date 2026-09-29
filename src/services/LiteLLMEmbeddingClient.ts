/** @format */

import axios from 'axios'
import { env } from '@config/env'
import { getLogger } from '@utils/Logger'

const log = getLogger('LiteLLMEmbeddingClient')

/**
 * LiteLLM Embedding API 客户端
 * 直接调用 LiteLLM 的 embedding API，绕过 uniai 库的限制
 */
export class LiteLLMEmbeddingClient {
    private baseURL: string
    private apiKey: string

    constructor() {
        this.baseURL = env.OTHER_API
        this.apiKey = env.OTHER_API_KEY
    }

    /**
     * 调用 LiteLLM 的 embedding API
     * @param text 要转换的文本
     * @param model 使用的模型
     * @returns 向量数组
     */
    async getEmbedding(text: string, model: string): Promise<number[][]> {
        try {
            const response = await axios.post(
                `${this.baseURL}/embeddings`,
                {
                    model: model,
                    input: text,
                    encoding_format: 'float'
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 秒超时
                }
            )

            // OpenAI 兼容的响应格式
            const data = response.data
            if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
                throw new Error('Invalid embedding response format')
            }

            // 返回 embedding 向量
            const embedding = data.data[0].embedding
            if (!Array.isArray(embedding)) {
                throw new Error('Invalid embedding format')
            }

            // 转换为二维数组格式 [[...]] 以保持与原有接口兼容
            return [embedding]
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status
                const errorData = error.response?.data
                log.error(`LiteLLM embedding API 调用失败 (${status}):`, errorData)
                throw new Error(`LiteLLM embedding API error (${status}): ${JSON.stringify(errorData)}`)
            }
            throw error
        }
    }
}

export const liteLLMEmbeddingClient = new LiteLLMEmbeddingClient()
