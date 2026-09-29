/** @format */

import { getLogger } from '@utils/Logger'
import { mcpHttpdao } from '../src/httpdao/mem/McpHttpdao'

/**
 * 记忆服务测试文件
 */
const logger = getLogger('memory-service-test')

async function getRoutinesByAgentId() {
    const s = await mcpHttpdao.getNews('019ab8f8-c1a6-75c5-baa3-0c890657c112', '上海发红包了吗？')
    logger.info(s)
    const s3 = await mcpHttpdao.serpSearch('019ab8f8-c1a6-75c5-baa3-0c890657c112', '上海发红包了吗？')
    logger.info(s3)
    const s2 = await mcpHttpdao.getWeather('019ab8f8-c1a6-75c5-baa3-0c890657c112', '深圳', 'base')
    logger.info(s2)
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    ;(async () => {
        // // 可以选择运行不同的测试函数
        await getRoutinesByAgentId()
    })()
}
