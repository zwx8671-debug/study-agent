/** @format */

import { pomTriggerHttpdao } from '../../src/httpdao/cocoadmin/PomTriggerHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * PomTriggerHttpdao 单元测试
 * 测试触发器管理HTTP DAO的迁移结果
 */
const logger = getLogger('pom-trigger-httpdao-test')

// 测试用的Agent ID，需要替换为实际存在的ID
const TEST_AGENT_ID = '019a51c5-b0b1-703a-baab-2d8278cd653f'

/**
 * 测试1: 根据AgentId查询所有有效触发器
 */
async function testFindAllEffectiveByAgentId() {
    logger.info('=== 测试1: 根据AgentId查询所有有效触发器 ===')
    try {
        const triggers = await pomTriggerHttpdao.findAllEffectiveByAgentId(TEST_AGENT_ID)

        if (triggers && triggers.length > 0) {
            logger.info(`✅ 成功获取 ${triggers.length} 个触发器:`)
            triggers.forEach((trigger, index) => {
                logger.info(`  [${index + 1}] ID: ${trigger.id}`)
                logger.info(`      Name: ${trigger.name}`)
                logger.info(`      Description: ${trigger.description?.substring(0, 50) || '(无)'}`)
                logger.info(`      XML长度: ${trigger.xml?.length || 0}`)
                logger.info(`      CreatedAt: ${trigger.createdAt}`)
            })
        } else {
            logger.info('⚠️ 未找到触发器，这可能是正常的（该Agent没有触发器）')
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
 * 测试2: 保存触发器
 */
async function testSaveTrigger() {
    logger.info('=== 测试2: 保存触发器 ===')
    try {
        const testTriggerName = `test-trigger-${Date.now()}`
        const testDescription = '这是一个测试触发器'
        const testXml = '<TRIGGER name="test"><VOICE>测试语音</VOICE></TRIGGER>'

        const result = await pomTriggerHttpdao.saveTrigger(testTriggerName, testXml, testDescription, TEST_AGENT_ID)

        if (result && result.code === 200) {
            logger.info('✅ 成功保存触发器:')
            logger.info('  - Result:', JSON.stringify(result))
            logger.info('  - Name:', testTriggerName)
            logger.info('  - Description:', testDescription)
        } else {
            logger.info('⚠️ 保存触发器返回:', JSON.stringify(result))
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
    logger.info('🚀 开始测试 PomTriggerHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_AGENT_ID:', TEST_AGENT_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    await testFindAllEffectiveByAgentId()
    await testSaveTrigger()

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
export { testFindAllEffectiveByAgentId, testSaveTrigger, runAllTests }
