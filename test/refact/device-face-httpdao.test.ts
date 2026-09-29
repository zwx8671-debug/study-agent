/** @format */

import { deviceFaceHttpdao } from '../../src/httpdao/cocoadmin/DeviceFaceHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * DeviceFaceHttpdao 单元测试
 * 测试设备人脸管理HTTP DAO的迁移结果
 */
const logger = getLogger('device-face-httpdao-test')

// 测试用的设备序列号，需要替换为实际存在的序列号
const TEST_SERIES_NUM = 'T001'

/**
 * 测试1: 根据设备序列号查询人脸列表
 */
async function testFindBySeriesNum() {
    logger.info('=== 测试1: 根据设备序列号查询人脸列表 ===')
    try {
        const faces = await deviceFaceHttpdao.findBySeriesNum(TEST_SERIES_NUM)
        logger.info('✅ 成功获取人脸列表:')
        logger.info('  - SeriesNum:', TEST_SERIES_NUM)
        logger.info('  - Faces count:', faces.length)
        if (faces.length > 0) {
            logger.info('  - 人脸列表:')
            faces.forEach((face, idx) => {
                logger.info(`    [${idx + 1}] ID: ${face.id}, Name: ${face.name}, ThreeId: ${face.threeId || 'N/A'}`)
            })
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
 * 测试2: 创建人脸信息
 */
async function testCreate() {
    logger.info('=== 测试2: 创建人脸信息 ===')
    try {
        const testFace = {
            name: `测试人脸_${Date.now()}`,
            threeId: `three_${Date.now()}`,
            deviceSn: TEST_SERIES_NUM
        }
        const face = await deviceFaceHttpdao.create(testFace)
        if (face) {
            logger.info('✅ 成功创建人脸:')
            logger.info('  - ID:', face.id)
            logger.info('  - Name:', face.name)
            logger.info('  - ThreeId:', face.threeId)
            logger.info('  - DeviceSn:', face.deviceSn)
            logger.info('  - CreatedAt:', face.createdAt)
            return face.id // 返回ID供后续测试使用
        } else {
            logger.info('⚠️ 创建失败')
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
 * 测试3: 更新人脸信息
 */
async function testUpdate(faceId: string) {
    logger.info('=== 测试3: 更新人脸信息 ===')
    try {
        const updateData = {
            name: `更新后的人脸_${Date.now()}`
        }
        const face = await deviceFaceHttpdao.update(faceId, updateData)
        if (face) {
            logger.info('✅ 成功更新人脸:')
            logger.info('  - ID:', face.id)
            logger.info('  - Name:', face.name)
            logger.info('  - UpdatedAt:', face.updatedAt)
        } else {
            logger.info('⚠️ 更新失败，faceId:', faceId)
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
 * 测试4: 删除人脸信息
 */
async function testDelete(faceId: string) {
    logger.info('=== 测试4: 删除人脸信息 ===')
    try {
        const success = await deviceFaceHttpdao.delete(faceId)
        if (success) {
            logger.info('✅ 成功删除人脸:')
            logger.info('  - FaceId:', faceId)
        } else {
            logger.info('⚠️ 删除失败，faceId:', faceId)
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
    logger.info('🚀 开始测试 DeviceFaceHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_SERIES_NUM:', TEST_SERIES_NUM)
    logger.info('\n' + '='.repeat(50) + '\n')

    // 测试查询
    await testFindBySeriesNum()

    // 测试创建
    const createdFaceId = await testCreate()

    // 如果创建成功，继续测试更新和删除
    if (createdFaceId) {
        await testUpdate(createdFaceId)
        await testDelete(createdFaceId)
    }

    // 再次查询验证
    await testFindBySeriesNum()

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
    testFindBySeriesNum,
    testCreate,
    testUpdate,
    testDelete,
    runAllTests
}
