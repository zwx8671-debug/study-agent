/** @format */

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { recordThirdPartyHttpRequest } from '../prometheus/metrics'
import { getLogger } from './Logger'
import { env } from '@config/env'

const log = getLogger('AxiosInterceptor')

// 扩展 axios 请求配置，添加自定义元数据
declare module 'axios' {
    export interface AxiosRequestConfig {
        metadata?: {
            serviceName?: string
            startTime?: number
        }
    }
}

/**
 * 根据 URL 自动推断服务名称
 * @param url 请求URL
 * @returns 服务名称
 */
function inferServiceName(url: string): string {
    if (!url) return 'unknown'

    // 检查是否包含已知的服务域名
    if (url.includes(env.COCOADMIN_API_URL) || url.includes('cocoadmin')) {
        return 'cocoadmin'
    }
    if (url.includes(env.MEMORY_API_URL) || url.includes('memory')) {
        return 'memory'
    }
    // 可以继续添加其他服务的判断
    // if (url.includes(env.MGMT_API_URL) || url.includes('mgmt')) {
    //     return 'mgmt'
    // }

    // 尝试从 URL 中提取域名作为服务名
    try {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname
        // 提取域名的主要部分作为服务名
        const parts = hostname.split('.')
        if (parts.length >= 2) {
            return parts[parts.length - 2] // 例如 api.example.com -> example
        }
        return hostname
    } catch {
        return 'unknown'
    }
}

/**
 * 提取接口路径，去除查询参数和域名
 * @param url 完整的URL
 * @returns 清理后的路径
 */
function extractEndpoint(url?: string): string {
    if (!url) return 'unknown'

    try {
        // 移除查询参数
        const urlWithoutQuery = url.split('?')[0]

        // 尝试解析URL
        const urlObj = new URL(urlWithoutQuery)
        return urlObj.pathname
    } catch {
        // 如果不是完整URL，返回原始路径（去除查询参数）
        return url.split('?')[0]
    }
}

/**
 * 记录监控指标
 * @param config 请求配置
 * @param statusCode HTTP状态码
 * @param startTime 请求开始时间
 * @param error 错误对象（如果有）
 */
function recordMetrics(
    config: AxiosRequestConfig | undefined,
    statusCode: number,
    startTime?: number,
    error?: AxiosError
) {
    if (!config) return

    try {
        const serviceName = config.metadata?.serviceName || 'unknown'
        const endpoint = extractEndpoint(config.url)
        const method = (config.method || 'get').toUpperCase()
        const status = statusCode > 0 ? statusCode.toString() : error?.code || 'error'

        const durationSeconds = startTime ? (Date.now() - startTime) / 1000 : 0

        recordThirdPartyHttpRequest(
            {
                service: serviceName,
                endpoint: endpoint,
                method: method,
                status_code: status
            },
            durationSeconds
        )

        log.debug(`第三方请求监控: ${serviceName} ${method} ${endpoint} ${status} ${durationSeconds}s`)
    } catch (metricsError) {
        // 记录指标失败不应影响业务
        log.warn('记录第三方请求监控指标失败:', metricsError)
    }
}

/**
 * 设置 Axios 全局拦截器，自动记录第三方 HTTP 请求监控指标
 *
 * 该函数会为 axios 添加请求和响应拦截器：
 * - 请求拦截器：记录请求开始时间，自动推断服务名称
 * - 响应拦截器：记录请求完成时的监控指标（路由、状态码、耗时）
 *
 * @example
 * ```typescript
 * // 在应用启动时调用一次
 * setupAxiosInterceptors()
 *
 * // 之后所有的 axios 请求都会自动记录监控指标
 * await axios.get('https://api.example.com/data')
 *
 * // 也可以手动指定服务名称
 * await axios({
 *     method: 'get',
 *     url: 'https://api.example.com/data',
 *     metadata: { serviceName: 'custom-service' }
 * })
 * ```
 */
export function setupAxiosInterceptors() {
    // 请求拦截器：记录开始时间和服务名称
    axios.interceptors.request.use(
        (config: AxiosRequestConfig) => {
            // 初始化 metadata
            if (!config.metadata) {
                config.metadata = {}
            }

            // 记录请求开始时间
            config.metadata.startTime = Date.now()

            // 如果没有手动指定服务名称，则自动推断
            if (!config.metadata.serviceName) {
                config.metadata.serviceName = inferServiceName(config.url || '')
            }

            return config as any
        },
        error => {
            return Promise.reject(error)
        }
    )

    // 响应拦截器：记录监控指标
    axios.interceptors.response.use(
        (response: AxiosResponse) => {
            // 请求成功，记录监控指标
            recordMetrics(response.config, response.status, response.config.metadata?.startTime)
            return response
        },
        (error: AxiosError) => {
            // 请求失败，仍然记录监控指标
            const statusCode = error.response?.status || 0
            recordMetrics(error.config, statusCode, error.config?.metadata?.startTime, error)
            return Promise.reject(error)
        }
    )

    log.info('Axios 拦截器已启用，第三方 HTTP 请求监控已激活')
}

/**
 * 为特定的 axios 实例设置拦截器
 * 适用于需要为某个特定的 axios 实例添加监控的场景
 *
 * @param axiosInstance axios 实例
 * @param defaultServiceName 默认服务名称
 */
export function setupAxiosInstanceInterceptors(axiosInstance: typeof axios, defaultServiceName: string = 'unknown') {
    axiosInstance.interceptors.request.use(
        (config: AxiosRequestConfig) => {
            if (!config.metadata) {
                config.metadata = {}
            }
            config.metadata.startTime = Date.now()
            if (!config.metadata.serviceName) {
                config.metadata.serviceName = defaultServiceName
            }
            return config as any
        },
        error => Promise.reject(error)
    )

    axiosInstance.interceptors.response.use(
        (response: AxiosResponse) => {
            recordMetrics(response.config, response.status, response.config.metadata?.startTime)
            return response
        },
        (error: AxiosError) => {
            const statusCode = error.response?.status || 0
            recordMetrics(error.config, statusCode, error.config?.metadata?.startTime, error)
            return Promise.reject(error)
        }
    )

    log.info(`Axios 实例拦截器已启用，服务: ${defaultServiceName}`)
}
