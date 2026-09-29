/** @format */

import { pomAgentHttpdao } from '../../src/httpdao/cocoadmin/PomAgentHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * PomAgentHttpdao 单元测试
 * 测试Agent管理HTTP DAO的迁移结果
 */
const logger = getLogger('pom-agent-httpdao-test')

// 测试用的ID，需要替换为实际存在的ID
const TEST_AGENT_ID = '019a51c5-b0b1-703a-baab-2d8278cd653f'
const TEST_DEVICE_SERIES_NUM = 'T001'

/**
 * 测试1: 根据agentId查询Agent
 */
async function testGetAgentById() {
    logger.info('=== 测试1: 根据agentId查询Agent ===')
    try {
        const agent = await pomAgentHttpdao.getAgentById(TEST_AGENT_ID)
        if (agent) {
            logger.info('✅ 成功获取Agent:')
            logger.info('  - ID:', agent.id)
            logger.info('  - Name:', agent.name)
            logger.info('  - Description:', agent.description?.substring(0, 50) || '(无)')
            logger.info('  - SessionId:', agent.sessionId)
            logger.info('  - Prompt长度:', agent.prompt?.length || 0)
            logger.info('  - CreatedAt:', agent.createdAt)

            // 打印关联的设备会话信息
            if (agent.deviceSession) {
                const session = agent.deviceSession
                logger.info('  - DeviceSession:')
                logger.info('    - SessionId:', session?.id)
                logger.info('    - DeviceId:', session?.deviceId)
                if (session?.device) {
                    logger.info('    - Device SeriesNum:', session.device.seriesNum)
                    logger.info('    - Device Name:', session.device.name)
                }
            }
        } else {
            logger.info('⚠️ 未找到Agent，agentId:', TEST_AGENT_ID)
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
 * 测试2: 根据设备序列号查询Agent
 */
async function testFindByDeviceSeriesNum() {
    logger.info('=== 测试2: 根据设备序列号查询Agent ===')
    try {
        const agent = await pomAgentHttpdao.findByDeviceSeriesNum(TEST_DEVICE_SERIES_NUM)
        if (agent) {
            logger.info('✅ 成功获取Agent:')
            logger.info('  - ID:', agent.id)
            logger.info('  - Name:', agent.name)
            logger.info('  - Description:', agent.description?.substring(0, 50) || '(无)')
            logger.info('  - SessionId:', agent.sessionId)
            logger.info('  - Prompt长度:', agent.prompt?.length || 0)
            logger.info('  - CreatedAt:', agent.createdAt)

            // 打印关联的设备会话信息
            if (agent.deviceSession) {
                const session = agent.deviceSession
                logger.info('  - DeviceSession:')
                logger.info('    - SessionId:', session?.id)
                logger.info('    - DeviceId:', session?.deviceId)
                if (session?.device) {
                    logger.info('    - Device SeriesNum:', session.device.seriesNum)
                    logger.info('    - Device Name:', session.device.name)
                }
            }
        } else {
            logger.info('⚠️ 未找到Agent，deviceSeriesNum:', TEST_DEVICE_SERIES_NUM)
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
    logger.info('🚀 开始测试 PomAgentHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_AGENT_ID:', TEST_AGENT_ID)
    logger.info('  - TEST_DEVICE_SERIES_NUM:', TEST_DEVICE_SERIES_NUM)
    logger.info('\n' + '='.repeat(50) + '\n')

    await testGetAgentById()
    await testFindByDeviceSeriesNum()

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
export { testGetAgentById, testFindByDeviceSeriesNum, runAllTests }
