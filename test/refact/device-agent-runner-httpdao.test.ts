/** @format */

import { deviceAgentRunnerHttpdao } from '../../src/httpdao/cocoadmin/DeviceAgentRunnerHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * DeviceAgentRunnerHttpdao 单元测试
 * 测试技能（DeviceAgentRunner）管理 HTTP DAO 的迁移结果
 */
const logger = getLogger('device-agent-runner-httpdao-test')

// 测试用的Agent ID，需要替换为实际存在的ID
const TEST_AGENT_ID = '019a51c5-b0b1-703a-baab-2d8278cd653f'

/**
 * 测试1: 根据AgentId查询技能列表
 */
async function testFindByAgentId() {
    logger.info('=== 测试1: 根据AgentId查询技能列表 ===')
    try {
        const skills = await deviceAgentRunnerHttpdao.findByAgentId(TEST_AGENT_ID)

        if (skills && skills.length > 0) {
            logger.info(`✅ 成功获取 ${skills.length} 个技能:`)
            skills.forEach((skill, index) => {
                logger.info(`  [${index + 1}] Name: ${skill.name}`)
                logger.info(`      Description: ${skill.description?.substring(0, 50) || '(无)'}`)
            })
        } else {
            logger.info('⚠️ 未找到技能，这可能是正常的（该Agent没有技能）')
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
 * 测试2: 保存技能
 */
async function testSaveSkill() {
    logger.info('=== 测试2: 保存技能 ===')
    try {
        const testSkillName = `test-skill-${Date.now()}`
        const testDescription = '这是一个测试技能'
        const testXml = '<SAVE name="test"><VOICE>测试语音</VOICE></SAVE>'

        const skillId = await deviceAgentRunnerHttpdao.save(testSkillName, testDescription, testXml, TEST_AGENT_ID)

        if (skillId) {
            logger.info('✅ 成功保存技能:')
            logger.info('  - Skill ID:', skillId)
            logger.info('  - Name:', testSkillName)
            logger.info('  - Description:', testDescription)
        } else {
            logger.info('⚠️ 保存技能返回空，可能接口未实现或保存失败')
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
 * 测试3: 更新已存在的技能
 */
async function testUpdateSkill() {
    logger.info('=== 测试3: 更新已存在的技能 ===')
    try {
        const existingSkillName = 'test-update-skill'
        const updatedDescription = `更新于 ${new Date().toISOString()}`
        const updatedXml = '<SAVE name="test-update"><VOICE>更新后的语音</VOICE></SAVE>'

        // 第一次保存
        const firstSaveId = await deviceAgentRunnerHttpdao.save(
            existingSkillName,
            '初始描述',
            '<SAVE name="test-update"><VOICE>初始语音</VOICE></SAVE>',
            TEST_AGENT_ID
        )
        logger.info('第一次保存结果:', firstSaveId || '(空)')

        // 第二次保存（应该更新）
        const secondSaveId = await deviceAgentRunnerHttpdao.save(
            existingSkillName,
            updatedDescription,
            updatedXml,
            TEST_AGENT_ID
        )
        logger.info('第二次保存结果:', secondSaveId || '(空)')

        if (secondSaveId) {
            logger.info('✅ 成功更新技能')
        } else {
            logger.info('⚠️ 更新技能返回空，可能接口未实现')
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
    logger.info('🚀 开始测试 DeviceAgentRunnerHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_AGENT_ID:', TEST_AGENT_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    await testFindByAgentId()
    await testSaveSkill()
    await testUpdateSkill()

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
export { testFindByAgentId, testSaveSkill, testUpdateSkill, runAllTests }
