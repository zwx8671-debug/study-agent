/** @format */

import { embeddingService } from '@service/EmbeddingService'
import { EmbedModelProvider } from 'uniai'

/**
 * 查询 pom_routine 表的向量统计信息
 *
 * 运行方式：
 * 1. 先启动项目：npm run dev
 * 2. 然后运行此测试：bun test/vector/embedding-stats-test.ts
 */
async function testEmbeddingStats() {
    // 发送到embedding API转向量
    const model: string = 'text-embedding-v4'
    const provider: EmbedModelProvider = EmbedModelProvider.AliYun
    for (let i = 0; i < 10; i++) {
        try {
            embeddingService.getEmbedding('测试', model, provider)
        } catch (e) {
            console.error('获取向量失败:', e)
        }
    }
}
// 执行测试
testEmbeddingStats().catch(error => {
    console.error('测试执行失败:', error)
    process.exit(1)
})
