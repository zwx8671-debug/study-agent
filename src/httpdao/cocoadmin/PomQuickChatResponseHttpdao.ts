/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, QuickChatResponseVO, VectorSearchReqVO } from './common/cocoadmin.interface'

/**
 * 快捷回复 HTTP DAO
 * 用于向量相似度搜索
 */
export class PomQuickChatResponseHttpdao {
    private log = getLogger(PomQuickChatResponseHttpdao.name)

    /**
     * 根据向量相似度搜索
     * 通过 (1 - cosine_distance) 计算得到的 similarity 相似度分数范围是 -1 到 1：
     *      1: 完全相似
     *      0: 正交无相关性
     *      -1: 完全相反
     *
     * @param embedding 查询向量
     * @param productId 产品ID
     * @param limit 返回结果数量限制，默认5
     * @returns 匹配的快捷回复列表
     */
    async searchByEmbedding(embedding: number[], productId: number, limit: number = 5): Promise<QuickChatResponseVO[]> {
        // 验证输入参数
        if (!embedding || embedding.length === 0) {
            return []
        }

        const data: VectorSearchReqVO = {
            embedding,
            productId,
            limit
        }

        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/quick-chat-response/search`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data
        }

        try {
            const response: AxiosResponse<CommonResult<QuickChatResponseVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                this.log.infoMsg(
                    `向量匹配查询，向量维度: ${embedding.length}, 限制数量: ${limit}, 产品:${productId}，向量匹配查询完成，找到 ${response.data.data.length} 个相关结果`
                )
                return response.data.data
            }

            this.log.warnMsg(`向量匹配查询失败: ${response.data.msg}`)
        } catch (error) {
            this.log.errorMsg(`向量匹配查询请求异常`, { errorMsg: error })
        }
        return []
    }
}

export const pomQuickChatResponseHttpdao = new PomQuickChatResponseHttpdao()
