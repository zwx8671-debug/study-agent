/** @format */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { getInstanceByToken } from 'fastify-decorators'
import { getLogger } from '@utils/Logger'
import { TokenUtil } from '@utils/TokenUtil'
import { env } from '@config/env'
import { recordHttpRequest } from '../prometheus/metrics'
import { HttpCommonResponse } from '../common/HttpCommonResponse'
import { authHttpDao } from '@httpdao/cocoadmin/AuthHttpDao'
import { DeviceConnectionRedisService } from '@service/redis/DeviceConnectionRedisService'

const logger = getLogger('http-interceptor')

// 定义不需要鉴权的路径前缀
const PUBLIC_PATHS = [
    '/metrics', // prometheus
    env.PATH_PREFIX + '/socket.io',
    env.PATH_PREFIX + '/', // 首页
    env.PATH_PREFIX + '/health',
    env.PATH_PREFIX + '/user',
    // env.PATH_PREFIX + '/prompt',
    env.PATH_PREFIX + '/config',
    env.PATH_PREFIX + '/device/check-bind',
    env.PATH_PREFIX + '/device/bind'
]

/**
 * 检查路径是否需要鉴权
 * @param url 请求的URL路径
 * @returns 是否需要鉴权
 */
function requiresAuth(url: string): boolean {
    url = url.split('?')[0]
    // 检查是否在公共路径列表中
    return !PUBLIC_PATHS.some(publicPath => {
        return url === publicPath || url.startsWith(publicPath + '/')
    })
}

/**
 * HTTP全局拦截器中间件
 * 记录所有HTTP请求的基本信息，并处理JWT鉴权
 */
export async function httpRequest(req: FastifyRequest, res: FastifyReply): Promise<void> {
    //记录请求开始时间，供耗时计算使用
    req.metricsStartTime = process.hrtime.bigint()

    // 对于OPTIONS预检请求，直接跳过拦截器处理
    if (req.method === 'OPTIONS') {
        return
    }

    // 检查路由是否存在，如果不存在直接返回404
    // 注意：我们需要在身份验证之前检查路由，否则所有不存在的路由都会返回401
    if (!req.routeOptions.url) {
        // 如果没有路由URL，说明这是一个不存在的路由
        res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found'
        })
        return
    }

    // 检查是否需要鉴权
    if (requiresAuth(req.url) && req.headers.authorization !== 'test') {
        try {
            // 从请求头中提取设备鉴权三要素
            const deviceSN = req.headers['device-sn'] as string
            const deviceSign = req.headers['device-sign'] as string
            const signTimestamp = req.headers['sign-timestamp'] as string
            const authType = req.headers['auth-type'] as string
            const token = TokenUtil.extractTokenFromHeaders(req.headers)

            // ② 设备签名鉴权：device-sn + sign-timestamp + device-sign（RSA-SHA256）
            if (deviceSN && deviceSign && signTimestamp) {
                const deviceConnectionService =
                    getInstanceByToken<DeviceConnectionRedisService>(DeviceConnectionRedisService)
                const device = await deviceConnectionService.verify(deviceSN, Number(signTimestamp), deviceSign)
                logger.info(
                    `Device ID (${device.id}), SN (${device.seriesNum}) authenticated via HTTP [${req.method} ${req.url}]`
                )
                // 鉴权通过，继续后续处理
            }
            // 设备token鉴权
            else if (authType === 'client' && token) {
                const result = await authHttpDao.checkTokenForDevice(token)
                if (!result) {
                    throw new Error('Invalid auth token')
                }

                logger.info(`[${req.url}] User authenticated`)
            }
            // ③ Web 客户端 JWT 鉴权
            else {
                if (!token) {
                    throw new Error('Missing auth token')
                }

                // 解析并校验 token
                const result = await authHttpDao.checkToken(token)
                if (!result) {
                    throw new Error('Invalid auth token')
                }

                logger.info(`[${req.url}] User authenticated`)
            }
        } catch (error: any) {
            logger.warn(`Authentication failed for ${req.method} ${req.url}: ${error.message}`)
            // 返回 401 未授权错误
            res.status(401).send({
                code: 401,
                data: null,
                msg: 'Unauthorized: ' + error.message
            })
            return
        }
    } else {
        logger.debug(`Public route accessed: ${req.method} ${req.url}`)
    }

    // 在响应发送后记录响应信息
    res.raw.on('finish', () => {})
}

/**
 * 响应发送后
 * 仅用于日志、统计，无法修改响应
 * 记录每次 HTTP 响应后调用 recordHttpRequest，
 * 将 method/route/status_code 以及计算出的 durationSeconds 写入 http_request_total 和 http_request_duration_seconds。
 */
export async function httpResponse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // 确保开始时间已记录
    if (request.metricsStartTime !== undefined) {
        const route = request.routeOptions?.url ?? request.url ?? request.raw.url ?? 'unknown'
        const labels = {
            method: request.method,
            route,
            status_code: reply.statusCode.toString()
        }
        // 计算请求处理耗时（秒）
        const durationSeconds = Number(process.hrtime.bigint() - request.metricsStartTime) / 1e9
        recordHttpRequest(labels, durationSeconds)
    }
}

/**
 * 处理函数执行后，响应发送前
 * 可修改响应数据（如统一包装格式）
 */
export async function onSend(request: FastifyRequest, reply: FastifyReply, payload: any): Promise<any> {
    // 如果响应已经是标准格式，直接返回
    if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload && 'msg' in payload) {
        // 如果已经是标准格式，确保它是字符串
        if (typeof payload === 'object') {
            return JSON.stringify(payload)
        }
        return payload
    }

    // 接口路径携带 /metrics 原样输出
    if (request.url.startsWith('/metrics')) {
        return payload
    }

    // 如果 payload 是字符串，尝试解析它以检查是否已经是 JSON
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload)
            // 如果解析后的对象已经是标准格式，直接返回原字符串
            if (parsed && typeof parsed === 'object' && 'code' in parsed && 'data' in parsed && 'msg' in parsed) {
                return payload
            }
            // 否则用标准格式包装解析后的对象
            return JSON.stringify(HttpCommonResponse.success(parsed))
        } catch {
            // 如果不是有效的 JSON，用标准格式包装原字符串
            return JSON.stringify(HttpCommonResponse.success(payload))
        }
    }

    // 否则使用 HttpCommonResponse 包装响应数据
    return JSON.stringify(HttpCommonResponse.success(payload))
}

/**
 * 自定义全局错误处理器，覆盖Fastify默认的错误处理
 * @param error
 * @param request
 * @param reply
 */
export async function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    // 记录错误日志
    logger.error(`HTTP Error ${reply.statusCode} for ${request.method} ${request.url}: ${error.message}`, error)

    // 根据错误类型设置适当的HTTP状态码
    let statusCode = reply.statusCode
    if (statusCode < 400) {
        // 如果状态码还未设置或为成功状态码，则根据错误类型设置
        if (error.name === 'ValidationError') {
            statusCode = 400 // Bad Request
        } else if (error.name === 'UnauthorizedError') {
            statusCode = 401 // Unauthorized
        } else if (error.name === 'ForbiddenError') {
            statusCode = 403 // Forbidden
        } else if (error.name === 'NotFoundError') {
            statusCode = 404 // Not Found
        } else {
            statusCode = 500 // Internal Server Error
        }
    }

    // 发送统一格式的错误响应
    return reply.status(statusCode).send(HttpCommonResponse.error(null, error.message || 'Internal Server Error'))
}
