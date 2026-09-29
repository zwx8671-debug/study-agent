/** @format */

import { deviceProductHttpdao } from '../../src/httpdao/cocoadmin/DeviceProductHttpdao'
import { getLogger } from '@utils/Logger'

/**
 * DeviceProductHttpdao 单元测试
 * 测试设备产品管理HTTP DAO的迁移结果
 */
const logger = getLogger('device-product-httpdao-test')

// 测试用的产品ID，需要替换为实际存在的产品ID
const TEST_PRODUCT_ID = 1

/**
 * 测试1: 根据产品ID查询产品信息
 */
async function testFindById() {
    logger.info('=== 测试1: 根据产品ID查询产品信息 ===')
    try {
        const product = await deviceProductHttpdao.findById(TEST_PRODUCT_ID)
        if (product) {
            logger.info('✅ 成功获取产品信息:')
            logger.info('  - ID:', product.id)
            logger.info('  - Name:', product.name)
            logger.info('  - Version:', product.version)
            logger.info('  - Description:', product.description)
            logger.info('  - Type:', product.type)
            logger.info('  - Code:', product.code)
            logger.info('  - Prompt:', product.prompt?.substring(0, 100) + (product.prompt?.length > 100 ? '...' : ''))
            logger.info('  - CreatedAt:', product.createdAt)
            logger.info('  - UpdatedAt:', product.updatedAt)
        } else {
            logger.info('⚠️ 未找到产品，productId:', TEST_PRODUCT_ID)
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
 * 测试2: 查询不存在的产品ID
 */
async function testFindByIdNotFound() {
    logger.info('=== 测试2: 查询不存在的产品ID ===')
    const nonExistentId = 999999
    try {
        const product = await deviceProductHttpdao.findById(nonExistentId)
        if (product) {
            logger.info('⚠️ 意外找到产品:', product)
        } else {
            logger.info('✅ 正确返回undefined，productId:', nonExistentId)
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
    logger.info('🚀 开始测试 DeviceProductHttpdao...\n')
    logger.info('测试配置:')
    logger.info('  - TEST_PRODUCT_ID:', TEST_PRODUCT_ID)
    logger.info('\n' + '='.repeat(50) + '\n')

    // 测试查询存在的产品
    await testFindById()

    // 测试查询不存在的产品
    await testFindByIdNotFound()

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
    testFindByIdNotFound,
    runAllTests
}
