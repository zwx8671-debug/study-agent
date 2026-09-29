/** @format */

import { VectorMatcherService } from '@service/agent/VectorMatcherService'

/**
 * 测试向量匹配功能 bun ./test/vector/vector-matcher-test.ts
 */
async function testVectorMatcher() {
    console.log('开始测试向量匹配功能...')

    const vectorMatcher = new VectorMatcherService()

    // 测试2: 包含标点符号的文本
    console.log('\\n--- 测试2: 包含标点符号文本 ---')
    const result2 = await vectorMatcher.quickResponse0('你好，世界！', '001', 1)
    console.log('包含标点符号文本处理结果:', result2)
}

// 执行测试
testVectorMatcher().catch(error => {
    console.error('测试执行失败:', error)
    process.exit(1)
})
