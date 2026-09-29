/** @format */

import { conversationDialogHttpdao } from '../../src/httpdao/cocoadmin/ConversationDialogHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * ConversationDialogHttpdao 单元测试
 * 测试对话管理HTTP DAO的迁移结果
 */
const logger = getLogger('conversation-dialog-httpdao-test')

// 测试用的ID，需要替换为实际存在的ID
const TEST_DIALOG_ID = '019b4959-2c17-742c-b3a6-fd2fbd25a946'
const TEST_AGENT_ID = '019a51c5-b0b1-703a-baab-2d8278cd653f'

/**
 * 测试1: 根据dialogId查询对话详情
 */
async function testFindById() {
    logger.info('=== 测试1: 根据dialogId查询对话详情 ===')
    try {
        const dialog = await conversationDialogHttpdao.findById(TEST_DIALOG_ID)
        if (dialog) {
            logger.info('✅ 成功获取对话详情:')
            logger.info('  - ID:', dialog.id)
            logger.info('  - AgentID:', dialog.agentId)
            logger.info('  - Title:', dialog.title)
            logger.info('  - CreatedAt:', dialog.createdAt)
            logger.info('  - Messages count:', dialog.messages?.length || 0)
        } else {
            logger.info('⚠️ 未找到对话，dialogId:', TEST_DIALOG_ID)
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
 * 测试2: 根据agentId查询最新对话
 */
async function testFindLatestByAgentId() {
    logger.info('=== 测试2: 根据agentId查询最新对话 ===')
    try {
        const dialog = await conversationDialogHttpdao.findLatestByAgentId(TEST_AGENT_ID)
        if (dialog) {
            logger.info('✅ 成功获取最新对话:')
            logger.info('  - ID:', dialog.id)
            logger.info('  - AgentID:', dialog.agentId)
            logger.info('  - Title:', dialog.title)
            logger.info('  - CreatedAt:', dialog.createdAt)
            logger.info('  - Messages count:', dialog.messages?.length || 0)

            // 打印部分消息内容
            if (dialog.messages && dialog.messages.length > 0) {
                logger.info('  - 最近消息:')
                const recentMessages = dialog.messages.slice(-3) // 最后3条
                recentMessages.forEach((msg, idx) => {
                    logger.info(`    [${idx + 1}] ${msg.role}: ${msg.content.substring(0, 50)}...`)
                })
            }
        } else {
            logger.info('⚠️ 未找到对话，agentId:', TEST_AGENT_ID)
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
 * 测试3: 更新对话标题
 */
async function testUpdateTitle() {
    logger.info('=== 测试3: 更新对话标题 ===')
    try {
        const newTitle = `测试标题_${new Date().toISOString()}`
        const success = await conversationDialogHttpdao.updateTitle(TEST_DIALOG_ID, newTitle)
        if (success) {
            logger.info('✅ 成功更新对话标题:')
            logger.info('  - DialogID:', TEST_DIALOG_ID)
            logger.info('  - NewTitle:', newTitle)
        } else {
            logger.info('⚠️ 更新失败，dialogId:', TEST_DIALOG_ID)
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
    logger.info('🚀 开始测试 ConversationDialogHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_DIALOG_ID:', TEST_DIALOG_ID)
    logger.info('  - TEST_AGENT_ID:', TEST_AGENT_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    await testFindById()
    await testFindLatestByAgentId()
    await testUpdateTitle()

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
export {
    testFindById,
    testFindLatestByAgentId,
    testUpdateTitle,
    runAllTests
}
