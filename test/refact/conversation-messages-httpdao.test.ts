/** @format */

import { conversationMessagesHttpdao } from '../../src/httpdao/cocoadmin/ConversationMessagesHttpdao'
import { getLogger } from '@utils/Logger'
import { ChatRoleEnum } from 'uniai'

/**
 * ConversationMessagesHttpdao 单元测试
 * 测试消息管理HTTP DAO的迁移结果
 */
const logger = getLogger('conversation-messages-httpdao-test')

// 测试用的ID，需要替换为实际存在的ID
const TEST_DIALOG_ID = '019b4959-2c17-742c-b3a6-fd2fbd25a946'
const TEST_SESSION_ID = '019a51c5-b0b1-703a-baab-2d8278cd653f'

/**
 * 测试1: 创建消息
 */
async function testCreateMessage() {
    logger.info('=== 测试1: 创建消息 ===')
    try {
        const message = await conversationMessagesHttpdao.createMessage(
            TEST_DIALOG_ID,
            ChatRoleEnum.USER,
            '这是一条测试消息 - ' + new Date().toISOString(),
            'openai',
            'gpt-4',
            TEST_SESSION_ID,
            '' // 让后端生成messageId
        )
        if (message) {
            logger.info('✅ 成功创建消息:')
            logger.info('  - ID:', message.id)
            logger.info('  - DialogID:', message.dialogId)
            logger.info('  - Role:', message.role)
            logger.info('  - Content:', message.content.substring(0, 50) + '...')
            logger.info('  - CreatedAt:', message.createdAt)
            return message.id
        } else {
            logger.info('⚠️ 创建消息失败')
        }
    } catch (error: any) {
        logger.error('❌ 测试失败:', error.message)
        if (error.response) {
            logger.error('HTTP状态码:', error.response.status)
            logger.error('响应数据:', error.response.data)
        }
    }
    logger.info('\n' + '='.repeat(50) + '\n')
    return null
}

/**
 * 测试2: 检查是否需要生成摘要
 */
async function testCheckNeedsSummary() {
    logger.info('=== 测试2: 检查是否需要生成摘要 ===')
    try {
        const result = await conversationMessagesHttpdao.checkNeedsSummary(TEST_DIALOG_ID)
        logger.info('✅ 成功获取摘要检查结果:')
        logger.info('  - NeedsSummary:', result.needsSummary)
        logger.info('  - LastSummary:', result.lastSummary ? result.lastSummary.substring(0, 50) + '...' : '无')
        logger.info('  - ConversationTurns count:', result.conversationTurns?.length || 0)
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
 * 测试3: 更新历史摘要
 */
async function testUpdateHistorySummary(messageId: string | null) {
    logger.info('=== 测试3: 更新历史摘要 ===')
    if (!messageId) {
        logger.info('⚠️ 跳过测试：没有可用的messageId')
        logger.info('\n' + '='.repeat(50) + '\n')
        return
    }
    try {
        const summary = '这是一条测试摘要 - ' + new Date().toISOString()
        const success = await conversationMessagesHttpdao.updateHistorySummary(messageId, summary)
        if (success) {
            logger.info('✅ 成功更新历史摘要:')
            logger.info('  - MessageID:', messageId)
            logger.info('  - Summary:', summary)
        } else {
            logger.info('⚠️ 更新失败，messageId:', messageId)
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
 * 测试4: 批量更新索引
 */
async function testUpdateIndex() {
    logger.info('=== 测试4: 批量更新索引 ===')
    try {
        // 模拟llmSet数据
        const llmSet = [
            { messageId: '85ed469c-9f6f-4f1a-8ad5-8af74ff8da0f', llmContentLen: 100 },
            { messageId: '019b4fcf-5b5c-719d-b7a9-4ac63279f311', llmContentLen: 200 }
        ]
        const length = 150

        const success = await conversationMessagesHttpdao.updateIndex(llmSet, length)
        if (success) {
            logger.info('✅ 成功批量更新索引:')
            logger.info('  - LlmSet length:', llmSet.length)
            logger.info('  - Total length:', length)
        } else {
            logger.info('⚠️ 批量更新索引失败')
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
 * 运行所有测试
 */
async function runAllTests() {
    logger.info('🚀 开始测试 ConversationMessagesHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_DIALOG_ID:', TEST_DIALOG_ID)
    logger.info('  - TEST_SESSION_ID:', TEST_SESSION_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    const messageId = await testCreateMessage()
    await testCheckNeedsSummary()
    await testUpdateHistorySummary(messageId)
    await testUpdateIndex()

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
export { testCreateMessage, testCheckNeedsSummary, testUpdateHistorySummary, testUpdateIndex, runAllTests }
