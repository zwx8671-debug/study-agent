/** @format */

import { memoryHttpdao } from '../src/httpdao/mem/MemoryHttpdao'
import { pomTriggerHttpdao } from '../src/httpdao/cocoadmin/PomTriggerHttpdao'
import { deviceHttpdao } from '../src/httpdao/cocoadmin/DeviceHttpdao'
import { getLogger } from '@utils/Logger'
import { pomAgentRoutineHttpdao } from '../src/httpdao/cocoadmin/PomAgentRoutineHttpdao'
import { RoutineService } from '@service/RoutineService'
import { getInstanceByToken } from 'fastify-decorators'
import $ from '@utils/util'

/**
 * 记忆服务测试文件
 */
const logger = getLogger('memory-service-test')

async function testMemoryService() {
    logger.info('开始测试记忆服务...\n')

    // 使用有效的UUID格式作为session_id
    const testSessionId = '550e8400-e29b-41d4-a716-446655440000'

    try {
        // 测试1: 获取主要记忆 - 有效UUID
        logger.info('=== 测试1: 获取主要记忆 (有效UUID) ===')
        const memories = await memoryHttpdao.getMainMemories(testSessionId)
        logger.info('✅ 成功获取记忆信息:')
        logger.info('Data length:', memories)
        logger.info('\n' + '='.repeat(50) + '\n')
    } catch (error: any) {
        logger.info('❌ 测试过程中发生未预期的错误:', error.message)
        if (error.response) {
            logger.info('HTTP状态码:', error.response.status)
            logger.info('响应数据:', error.response.data)
        }
    }

    logger.info('测试完成!')
}

async function testTriggerService() {
    try {
        // 测试1: trigger 保存
        logger.info('=== 测试1:trigger 保存 ===')
        const memories = await pomTriggerHttpdao.saveTrigger(
            'cs',
            "<when name='AliceOrBobAndLowPower'><and><or><face_detect name='Alice'/><face_detect name='Bob'/></or><not><power_over value='20'/></not></and><do><prompt>检测到Alice或Bob且电量不足20%</prompt><move/></do></when>",
            '01994cc8-90e0-7dd0-8515-7c150bdf396e',
            '01994cc8-90e0-7dd0-8515-7c150bdf396e'
        )
        logger.info('Data :', memories)
        logger.info('\n' + '='.repeat(50) + '\n')
    } catch (error: any) {
        logger.info('❌ 测试过程中发生未预期的错误:', error.message)
        if (error.response) {
            logger.info('HTTP状态码:', error.response.status)
            logger.info('响应数据:', error.response.data)
        }
    }

    logger.info('测试完成!')
}

async function testDeviceService() {
    try {
        const memories = await deviceHttpdao.bind({
            code: '123456',
            name: '123456',
            seriesNum: '01994cc8-90e0-7dd0-8515-7c150bdf396e',
            userId: 1
        })
        logger.info('Data :', memories)
    } catch (error: any) {
        logger.info('❌ 测试过程中发生未预期的错误:', error.message)
        if (error.response) {
            logger.info('HTTP状态码:', error.response.status)
            logger.info('响应数据:', error.response.data)
        }
    }

    logger.info('测试完成!')
}

async function getRoutinesTreeByAgentId() {
    await $.sleep(1000)

    const routineService: RoutineService = getInstanceByToken<RoutineService>(RoutineService)
    const newVar = await routineService.getRoutinesTreeByAgentId('019adcdd-13da-727d-a85d-bc07b5bf04ea')
    logger.info(newVar)
}

async function testGetDynamicRoutinesByAgentId() {
    logger.info('=== 测试1: 获取动态Routines ===')
    try {
        const agentId = '019adcdd-13da-727d-a85d-bc07b5bf04ea'
        const moduleNodeKey = 'ear' // 需要替换为实际的moduleNodeKey
        const routineService: RoutineService = getInstanceByToken<RoutineService>(RoutineService)
        const routines = await routineService.getDynamicRoutinesByAgentId(moduleNodeKey, agentId)
        logger.info(routines)
    } catch (error: any) {
        logger.info('❌ 测试过程中发生错误:', error.message)
    }
    logger.info('\n' + '='.repeat(50) + '\n')
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    ;(async () => {
        // // 可以选择运行不同的测试函数
        // await testMemoryService()
        // await testTriggerService()
        // await testDeviceService()
        // await getRoutinesTreeByAgentId()

        // COCOADMIN接口测试
        await testGetDynamicRoutinesByAgentId()
        await getRoutinesTreeByAgentId()
    })()
}
