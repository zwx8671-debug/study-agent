/** @format */

import { getLogger } from '@utils/Logger'
import ai from '@utils/uniai'
import { EmbedModelProvider, OpenAIEmbedModel } from 'uniai'
import { liteLLMEmbeddingClient } from './LiteLLMEmbeddingClient'
import { recordEmbeddingMetrics } from '../prometheus/metrics'

/**
 * Embedding API 服务类
 * 用于将文本转换为向量表示
 * 支持多种 provider：AliYun（通过 uniai）和 Other（LiteLLM，直接 HTTP 调用）
 */
export class EmbeddingService {
    private log = getLogger('EmbeddingService')

    /**
     * 将 EmbedModelProvider 枚举转换为字符串标签
     */
    private getProviderLabel(provider: EmbedModelProvider): string {
        switch (provider) {
            case EmbedModelProvider.AliYun:
                return 'aliyun'
            case EmbedModelProvider.Other:
                return 'other'
            case EmbedModelProvider.OpenAI:
                return 'openai'
            default:
                return 'unknown'
        }
    }

    /**
     * 调用 Embedding API 获取文本向量
     * @param text 要转换的文本
     * @param model 使用的模型，默认为 qwen3-embedding:0.6b
     * @param provider Embedding provider
     * @returns 包含向量的响应对象
     */
    async getEmbedding(
        text: string,
        model: string = OpenAIEmbedModel.SMALL,
        provider: EmbedModelProvider = EmbedModelProvider.OpenAI
    ): Promise<number[][]> {
        if (!text || text.trim().length === 0) {
            throw new Error('文本内容不能为空')
        }

        const providerLabel = this.getProviderLabel(provider)
        const startTimestamp = new Date().valueOf()

        try {
            this.log.info(`开始获取文本向量，provider: ${provider}, model: ${model}, 文本长度: ${text.length}`)

            let embedding: number[][]

            // 对于 Other provider (LiteLLM)，使用自定义 HTTP 客户端
            // 因为 uniai 库对 Other provider 的 embedding 支持有限
            if (provider === EmbedModelProvider.Other) {
                this.log.info('使用 LiteLLM 直接调用 embedding API')
                embedding = await liteLLMEmbeddingClient.getEmbedding(text, model)
            } else {
                // 对于其他 provider（如 AliYun），使用 uniai 库
                this.log.info('使用 uniai 库调用 embedding API')
                const embeddingResponse = await ai.embedding(text, {
                    model,
                    provider
                })
                embedding = embeddingResponse.embedding
            }

            const endTimestamp = new Date().valueOf()
            const durationMs = endTimestamp - startTimestamp

            // 记录成功的 Prometheus 指标
            recordEmbeddingMetrics(providerLabel, model, durationMs, 'success')

            this.log.info(
                `成功获取文本向量，维度: [${embedding.length},${embedding[0]?.length}], 耗时：${durationMs}ms`
            )
            return embedding
        } catch (error) {
            // 记录失败的 Prometheus 指标
            const endTimestamp = new Date().valueOf()
            const durationMs = endTimestamp - startTimestamp
            recordEmbeddingMetrics(providerLabel, model, durationMs, 'failure')

            this.log.error('获取文本向量失败:', error)
            throw new Error(`Embedding API调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
        }
    }
}

export const embeddingService: EmbeddingService = new EmbeddingService()
