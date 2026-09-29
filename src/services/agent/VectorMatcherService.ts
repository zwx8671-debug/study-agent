/** @format */

import { getLogger } from '@utils/Logger'
import { ChatQuickResponse, ResponseEvent } from '@interface/IAgent'
import { SocketCommonResponse } from '../../common/SocketCommonResponse'
import { Shell } from '../../libs/xml/Shell'
import { embeddingService } from '@service/EmbeddingService'
import { pomQuickChatResponseHttpdao } from '@httpdao/cocoadmin/PomQuickChatResponseHttpdao'
import { QuickChatResponseVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { EmbedModelProvider } from 'uniai'
import { Service } from 'fastify-decorators'
import { QUICK_RES_THRESHOLD } from '@service/ConfigService'
import { CoCoNamespace } from '@interface/ICommon'
import { env } from '@config/env'
import { traceContext } from '@utils/TraceContext'

/**
 * 向量匹配处理器
 * 负责语音转文本的向量匹配流程
 */
@Service()
export class VectorMatcherService {
    private log = getLogger('VectorMatcherService')

    // 防重复机制的状态管理，每个设备独立的冷却时间
    private static lastEmbeddingTimeMap: Map<string, number> = new Map()
    private static lastEmbeddingIndexMap: Map<string, number> = new Map()
    private readonly COOLDOWN_MS = 1000 // 1秒冷却时间

    // 标点符号正则表达式
    private readonly PUNCTUATION_REGEX = /[。！？；，、：""''（）【】《》]/

    constructor() {}

    /**
     * 【快速响应】处理STT文本流，累积文本直到检测到句子结束
     * @param text 当前的STT文本片段
     * @param deviceSN 设备序列号
     * @param productId 产品ID
     * @returns 是否触发了向量匹配流程
     */
    async quickResponse0(text: string, deviceSN: string, productId: number): Promise<boolean> {
        try {
            // 检查是否在冷却期间
            // if (this.isInCooldown(deviceSN)) {
            //     this.log.info(`设备 ${deviceSN} 在冷却期间，忽略新输入: "${text}"`)
            //     return false
            // }

            // 检查累积文本是否包含标点符号（完整句子）
            if (!this.containsPunctuation(text)) {
                this.log.info(`设备 ${deviceSN} 尚未形成完整句子，继续累积`)
                return false
            }

            this.log.info(`设备 ${deviceSN} 检测到完整句子，开始向量匹配流程: "${text}"`)

            // 分句处理
            const sentences = this.splitSentences(text)
            if (sentences.length <= 1) {
                // 清空缓冲区
                return false
            }

            // 取倒数第二个句子向量匹配
            const index = sentences.length - 2
            const latestSentence = sentences[index]
            if (index === VectorMatcherService.lastEmbeddingIndexMap.get(deviceSN)) {
                this.log.info(`设备 ${deviceSN} 忽略重复的句子: "${latestSentence}"`)
                return false
            }

            // 触发向量匹配流程
            // 更新最后embedding 句子的索引
            VectorMatcherService.lastEmbeddingIndexMap.set(deviceSN, index)
            // 更新指定设备的最后embedding时间，开始冷却
            VectorMatcherService.lastEmbeddingTimeMap.set(deviceSN, Date.now())
            this.quickVector(latestSentence, deviceSN, productId)

            this.log.info(`设备 ${deviceSN} 文本缓冲区已清空`)

            return true
        } catch (error) {
            this.log.error(`设备 ${deviceSN} 向量匹配处理失败:`, error)
            return false
        }
    }

    /**
     * 【快速响应】执行向量匹配流程，不分句
     * @param latestSentence
     * @param deviceSN
     * @param productId
     * @private
     */
    public quickVector(latestSentence: string, deviceSN: string, productId: number) {
        this.log.info(`设备 ${deviceSN} 开始执行向量匹配流程: "${latestSentence}"`)
        // 【埋点】快速响应开始时间
        const quickVectorStartTime = Date.now()
        const context = traceContext.getContext()
        traceContext.updateContext({ metrics: { ...context.metrics, quickVectorStartTime } })
        this.performVectorMatching(latestSentence, deviceSN, productId)
            .then(async routineEmbeddingDO => {
                if (routineEmbeddingDO) {
                    if (routineEmbeddingDO.similarity < QUICK_RES_THRESHOLD) {
                        this.log.infoMsg(`阈值过低，忽略匹配: ${latestSentence}`)
                        return
                    }

                    Shell.syncLoopParse(routineEmbeddingDO.xml, false, '', '', '').then(res => {
                        // 【埋点】快速响应完成时间
                        const quickVectorEndTime = Date.now()
                        const context = traceContext.getContext()
                        traceContext.updateContext({ metrics: { ...context.metrics, quickVectorEndTime } })

                        // 匹配成功后响应设备
                        SocketCommonResponse.successToAll<ChatQuickResponse>({
                            ns: CoCoNamespace.Agent,
                            event: ResponseEvent.CHAT_QUICK,
                            msg: '匹配成功',
                            room: deviceSN,
                            data: {
                                funcTokens: res.textFuncTokens,
                                originalText: latestSentence,
                                similarity: routineEmbeddingDO.similarity
                            }
                        })
                    })
                } else {
                    this.log.infoMsg(`设备 ${deviceSN} 向量匹配未找到相关结果: "${latestSentence}"`)
                }
            })
            .catch(error => {
                this.log.errorMsg(`设备 ${deviceSN} 向量匹配处理失败:`, { errorMsg: error })
            })
    }

    /**
     * 检查指定设备是否在冷却期间
     */
    private isInCooldown(deviceSN: string): boolean {
        const lastTime = VectorMatcherService.lastEmbeddingTimeMap.get(deviceSN) || 0
        const now = Date.now()
        return now - lastTime < this.COOLDOWN_MS
    }

    /**
     * 检查文本是否包含标点符号
     */
    private containsPunctuation(text: string): boolean {
        return this.PUNCTUATION_REGEX.test(text)
    }

    /**
     * 分句处理
     * @param text 原始文本
     * @returns 分句后的数组
     */
    private splitSentences(text: string): string[] {
        // 使用标点符号分割句子，并过滤空字符串
        const sentences = text
            .split(this.PUNCTUATION_REGEX)
            .map(s => s.trim())
            .filter(s => s.length > 0)

        this.log.info(`文本分句结果: ${sentences.length} 个句子`)
        return sentences
    }

    /**
     * 执行向量匹配流程
     * @param sentence 分句后的文本
     * @param deviceSN 设备序列号
     * @param productId
     */
    private async performVectorMatching(
        sentence: string,
        deviceSN: string,
        productId: number
    ): Promise<QuickChatResponseVO> {
        let embedding: number[][] = []
        try {
            // 发送到embedding API转向量
            const model: string = env.EMBEDDING_MODEL
            const provider: EmbedModelProvider =
                env.EMBEDDING_PROVIDER === 'aliyun' ? EmbedModelProvider.AliYun : EmbedModelProvider.Other
            embedding = await embeddingService.getEmbedding(sentence, model, provider)
            this.log.info(`设备 ${deviceSN} 成功获取句子向量，维度: ${embedding[0].length}`)
        } catch (error) {
            this.log.error(`设备 ${deviceSN} 处理句子 "${sentence}" 失败:`, error)
            // 单个句子失败不影响其他句子的处理
            throw error
        }

        // 在向量库中进行匹配
        let matchResults: QuickChatResponseVO[]
        try {
            // 调用HTTP DAO层进行向量搜索
            matchResults = await pomQuickChatResponseHttpdao.searchByEmbedding(embedding[0], productId, 1)
        } catch (error) {
            this.log.error(`设备 ${deviceSN} 向量库搜索失败:`, error)
            throw error
        }

        return matchResults[0]
    }

    /**
     * 获取指定设备的冷却状态信息
     * @param deviceSN 设备序列号
     * @returns 冷却状态信息
     */
    getCooldownInfo(deviceSN: string): { isInCooldown: boolean; remainingTime: number } {
        const lastTime = VectorMatcherService.lastEmbeddingTimeMap.get(deviceSN) || 0
        const now = Date.now()
        const elapsed = now - lastTime
        const remaining = Math.max(0, this.COOLDOWN_MS - elapsed)

        return {
            isInCooldown: remaining > 0,
            remainingTime: remaining
        }
    }

    /**
     * 重置指定设备的冷却状态
     * @param deviceSN 设备序列号
     */
    resetCooldown(deviceSN: string): void {
        VectorMatcherService.lastEmbeddingTimeMap.delete(deviceSN)
        VectorMatcherService.lastEmbeddingIndexMap.delete(deviceSN)
        this.log.debug(`设备 ${deviceSN} 的向量匹配冷却状态已重置`)
    }

    /**
     * 重置所有设备的冷却状态并清除所有设备缓冲区
     */
    resetAllCooldowns(): void {
        VectorMatcherService.lastEmbeddingTimeMap.clear()
        this.log.info('所有设备的向量匹配冷却状态已重置')
    }

    /**
     * 快速响应
     * @param text
     * @param deviceSN
     * @param productId
     * @private
     */
    public quickResponse(text: string, deviceSN: string, productId: number) {
        this.quickResponse0(text, deviceSN, productId)
            .then(matched => {
                if (matched) {
                    this.log.infoMsg(`设备 ${deviceSN} 触发了向量匹配流程`)
                } else {
                    this.log.debugMsg(`设备 ${deviceSN} 未触发向量匹配流程`)
                }
            })
            .catch(error => {
                this.log.errorMsg(`设备 ${deviceSN} 向量匹配处理错误:`, { errorMsg: error })
            })
    }
}
