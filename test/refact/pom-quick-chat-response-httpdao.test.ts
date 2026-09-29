/** @format */

import { pomQuickChatResponseHttpdao } from '../../src/httpdao/cocoadmin/PomQuickChatResponseHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * PomQuickChatResponseHttpdao 单元测试
 * 测试快捷回复向量搜索HTTP DAO的迁移结果
 */
const logger = getLogger('pom-quick-chat-response-httpdao-test')

// 测试用的产品ID，需要替换为实际存在的ID
const TEST_PRODUCT_ID = 1

// 模拟的embedding向量（1536维，OpenAI text-embedding-ada-002 的维度）
// 实际测试时应使用真实的embedding
function generateMockEmbedding(dimension: number = 1024): number[] {
    return Array.from({ length: dimension }, () => Math.random() * 2 - 1)
}

/**
 * 测试1: 向量相似度搜索
 */
async function testSearchByEmbedding() {
    logger.info('=== 测试1: 向量相似度搜索 ===')
    try {
        const mockEmbedding = generateMockEmbedding()
        logger.info(`生成模拟向量，维度: ${mockEmbedding.length}`)

        const results = await pomQuickChatResponseHttpdao.searchByEmbedding(mockEmbedding, TEST_PRODUCT_ID, 5)

        if (results && results.length > 0) {
            logger.info(`✅ 成功获取 ${results.length} 个匹配结果:`)
            results.forEach((result, index) => {
                logger.info(`  [${index + 1}] 相似度: ${result.similarity.toFixed(4)}`)
                logger.info(`      XML长度: ${result.xml?.length || 0}`)
                logger.info(`      XML预览: ${result.xml?.substring(0, 100) || '(空)'}...`)
            })
        } else {
            logger.info('⚠️ 未找到匹配结果，这可能是正常的（数据库中没有数据或接口未实现）')
        }
    } catch (error: any) {
        logger.error('❌ 测试失败:', error.message)
        if (error.response) {
            logger.error('HTTP状态码:', error.response.status)
            logger.error('响应数据:', error.response.data)
        }
    }
    logger.info('\n' + '='.repeat(50) + '\n')
}

/**
 * 测试2: 空向量处理
 */
async function testEmptyEmbedding() {
    logger.info('=== 测试2: 空向量处理 ===')
    try {
        const results = await pomQuickChatResponseHttpdao.searchByEmbedding([], TEST_PRODUCT_ID, 5)

        if (results.length === 0) {
            logger.info('✅ 空向量正确返回空数组')
        } else {
            logger.warn('⚠️ 空向量应该返回空数组，但返回了:', results.length, '个结果')
        }
    } catch (error: any) {
        logger.error('❌ 测试失败:', error.message)
    }
    logger.info('\n' + '='.repeat(50) + '\n')
}

/**
 * 测试3: 限制返回数量
 */
async function testLimitResults() {
    logger.info('=== 测试3: 限制返回数量 ===')
    try {
        const mockEmbedding = generateMockEmbedding()
        const limit = 1

        const results = await pomQuickChatResponseHttpdao.searchByEmbedding(mockEmbedding, TEST_PRODUCT_ID, limit)

        logger.info(`请求限制: ${limit}`)
        logger.info(`实际返回: ${results.length}`)

        if (results.length <= limit) {
            logger.info('✅ 返回数量符合限制')
        } else {
            logger.warn('⚠️ 返回数量超过限制')
        }
    } catch (error: any) {
        logger.error('❌ 测试失败:', error.message)
    }
    logger.info('\n' + '='.repeat(50) + '\n')
}

/**
 * 运行所有测试
 */
async function runAllTests() {
    logger.info('🚀 开始测试 PomQuickChatResponseHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_PRODUCT_ID:', TEST_PRODUCT_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    await testSearchByEmbedding()
    await testEmptyEmbedding()
    await testLimitResults()

    logger.info('🏁 所有测试完成!')
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    runAllTests().catch(err => {
        logger.error('测试执行出错:', err)
        process.exit(1)
    })
}

// 导出测试函数，供其他测试文件调用
export { testSearchByEmbedding, testEmptyEmbedding, testLimitResults, runAllTests }
