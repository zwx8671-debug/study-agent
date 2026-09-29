/** @format */

import { collectDefaultMetrics, Counter, Gauge, Histogram, type LabelValues, Registry } from 'prom-client'
import { traceContext } from '@utils/TraceContext'
import { getLogger } from '@utils/Logger'

/**
 * 创建一个Prometheus注册表实例，用于注册和管理所有的监控指标
 */
const register = new Registry()

/**
 * 收集默认的Node.js运行时指标，如内存使用、CPU使用率等
 * 这些指标会自动注册到上面创建的register中
 */
collectDefaultMetrics({ register })
const log = getLogger('metrics')

/**
 * 定义HTTP请求标签的类型，扩展了基础标签值类型
 * 包含HTTP方法、路由路径和状态码三个必需字段
 */
type HttpLabelValues = LabelValues<string> & {
    method: string
    route: string
    status_code: string
}

/**
 * 创建一个计数器指标，用于统计HTTP请求总数
 * 该指标按HTTP方法、路由和状态码进行分类统计
 */
export const httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: '收到的HTTP请求总数',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
})

/**
 * 创建一个直方图指标，用于测量HTTP请求的响应时间分布
 * 使用预定义的时间桶来统计不同响应时间区间的请求数量
 */
export const httpRequestDuration = new Histogram({
    name: 'http_requests_duration_seconds',
    help: 'HTTP 请求的持续时间（秒数）',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [register]
})

/**
 * 创建一个仪表盘指标，用于记录并发进行的代理聊天会话数量
 * 该指标可以随时增加或减少，反映实时的并发连接数
 */
export const agentChatConcurrent = new Gauge({
    name: 'agent_chat_concurrent',
    help: '进行中的聊天会话数量（未执行local.close、local.interrupt方法）',
    registers: [register]
})

/**
 * 增加代理聊天并发计数器
 * 该函数会递增全局的代理聊天并发计数，并在追踪上下文中设置相应的标记
 */
export const agentChatConcurrentInc = () => {
    agentChatConcurrent.inc()
    traceContext.getContext()['agentChatConcurrent'] = 1
}

/**
 * 减少代理聊天并发计数器
 * 该函数会检查当前追踪上下文中的并发计数值，如果大于0则递减全局计数器并更新上下文
 * 如果计数值小于等于0，则记录警告日志
 */
export const agentChatConcurrentDec = () => {
    const val = traceContext.getContext()['agentChatConcurrent'] as number
    if (val > 0) {
        agentChatConcurrent.dec()
        traceContext.getContext()['agentChatConcurrent'] = val - 1
    } else {
        log.warnMsg('agentChatConcurrentDec: val <= 0')
    }
}

/**
 * 定义Socket请求事件指标标签的类型
 */
export type SocketEventRequestLabelValues = LabelValues<string> & {
    event: string
    namespace: string
    source: string
}

/**
 * 创建一个计数器指标，用于统计客户端请求事件总数（入站）
 * 该指标按事件类型和命名空间进行分类统计
 */
export const socketEventRequestTotal = new Counter({
    name: 'socket_event_request_total',
    help: '客户端请求事件总数（入站）',
    labelNames: ['event', 'namespace', 'source'],
    registers: [register]
})

/**
 * 定义Socket响应事件指标标签的类型
 */
export type SocketEventResponseLabelValues = LabelValues<string> & {
    event: string
    namespace: string
    status: string
}

/**
 * 创建一个计数器指标，用于统计服务器响应事件总数（出站）
 * 该指标按事件类型、命名空间和响应状态进行分类统计
 */
export const socketEventResponseTotal = new Counter({
    name: 'socket_event_response_total',
    help: '服务器响应事件总数（出站）',
    labelNames: ['event', 'namespace', 'status'],
    registers: [register]
})

/**
 * 定义Agent聊天性能指标标签的类型
 */
type AgentChatLabelValues = LabelValues<string> & {
    success: string
}

/**
 * 创建直方图指标：语音转文字延迟（STT完成延迟）
 * 测量从用户尾包到STT完成的时间
 */
export const agentChatSttCompleteDelay = new Histogram({
    name: 'agent_chat_stt_complete_delay_ms',
    help: 'STT完成延迟：用户尾包到语音转文字完成的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建直方图指标：数据准备耗时（查库）
 * 测量查询数据库的耗时
 */
export const agentChatDataPrepDuration = new Histogram({
    name: 'agent_chat_data_prep_duration_ms',
    help: '数据准备耗时：查询数据库的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建直方图指标：连接建立耗时（TTS连接/LLM思考）
 * 测量TTS连接和LLM开始思考的准备时间
 */
export const agentChatConnectionDuration = new Histogram({
    name: 'agent_chat_connection_duration_ms',
    help: '连接建立耗时：TTS连接和LLM思考准备的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建直方图指标：快速响应延迟
 * 测量从用户尾包到快速响应完成的时间
 */
export const agentChatQuickResponseDelay = new Histogram({
    name: 'agent_chat_quick_response_delay_ms',
    help: '快速响应延迟：用户尾包到快速响应完成的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建直方图指标：FuncToken首包延迟
 * 测量从用户尾包到FuncToken首包的时间
 */
export const agentChatFuncTokenDelay = new Histogram({
    name: 'agent_chat_func_token_delay_ms',
    help: 'FuncToken首包延迟：用户尾包到FuncToken首包的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建直方图指标：首个音频包延迟
 * 测量从用户尾包到TTS首包的时间
 */
export const agentChatFirstAudioDelay = new Histogram({
    name: 'agent_chat_first_audio_delay_ms',
    help: '首个音频包延迟：用户尾包到TTS首包的时间（毫秒）',
    labelNames: ['success'],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 定义第三方HTTP请求标签的类型
 * 包含服务名称、接口路径、HTTP方法和状态码
 */
type ThirdPartyHttpLabelValues = LabelValues<string> & {
    service: string
    endpoint: string
    method: string
    status_code: string
}

/**
 * 创建一个计数器指标，用于统计第三方HTTP请求总数
 * 该指标按服务名称、接口路径、HTTP方法和状态码进行分类统计
 */
export const thirdPartyHttpRequestTotal = new Counter({
    name: 'third_party_http_requests_total',
    help: '第三方HTTP请求总数',
    labelNames: ['service', 'endpoint', 'method', 'status_code'],
    registers: [register]
})

/**
 * 创建一个直方图指标，用于测量第三方HTTP请求的响应时间分布
 * 使用预定义的时间桶来统计不同响应时间区间的请求数量
 */
export const thirdPartyHttpRequestDuration = new Histogram({
    name: 'third_party_http_requests_duration_seconds',
    help: '第三方HTTP请求的持续时间（秒数）',
    labelNames: ['service', 'endpoint', 'method', 'status_code'],
    buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10],
    registers: [register]
})

/**
 * 定义 Embedding API 调用标签的类型
 * 包含 provider（提供商）、model（模型名称）和 status（调用状态）
 */
type EmbeddingLabelValues = LabelValues<string> & {
    provider: string
    model: string
    status: 'success' | 'failure'
}

/**
 * 创建一个直方图指标，用于测量 Embedding API 调用的耗时分布
 * 使用预定义的时间桶（毫秒）来统计不同耗时区间的调用数量
 * 桶范围：10ms, 50ms, 100ms, 200ms, 500ms, 1s, 2s, 5s, 10s
 */
export const embeddingDurationHistogram = new Histogram({
    name: 'embedding_api_duration_milliseconds',
    help: 'Embedding API 调用耗时分布（毫秒）',
    labelNames: ['provider', 'model', 'status'],
    buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [register]
})

/**
 * 创建一个计数器指标，用于统计 Embedding API 调用总次数
 * 该指标按 provider、model 和 status 进行分类统计
 */
export const embeddingRequestTotal = new Counter({
    name: 'embedding_api_requests_total',
    help: 'Embedding API 调用总次数',
    labelNames: ['provider', 'model', 'status'],
    registers: [register]
})

/**
 * 记录HTTP请求的监控数据
 * 增加请求计数器，并在提供响应时间时更新请求持续时间直方图
 *
 * @param labels - 包含HTTP方法、路由和状态码的标签对象
 * @param durationSeconds - 请求处理的持续时间（秒），可选参数
 */
export const recordHttpRequest = (labels: HttpLabelValues, durationSeconds?: number) => {
    httpRequestTotal.inc(labels)
    if (typeof durationSeconds === 'number') {
        httpRequestDuration.observe(labels, durationSeconds)
    }
}

/**
 * 记录第三方HTTP请求的监控数据
 * 增加请求计数器，并记录请求持续时间
 *
 * @param labels - 包含服务名称、接口路径、HTTP方法和状态码的标签对象
 * @param durationSeconds - 请求处理的持续时间（秒）
 */
export const recordThirdPartyHttpRequest = (labels: ThirdPartyHttpLabelValues, durationSeconds: number) => {
    thirdPartyHttpRequestTotal.inc(labels)
    thirdPartyHttpRequestDuration.observe(labels, durationSeconds)
}

/**
 * 记录Agent聊天关键性能指标
 * 将各项延迟指标上报到Prometheus
 *
 * @param success - 是否成功
 * @param durations - 包含各项延迟时间的对象（单位：毫秒）
 */
export const recordAgentChatMetrics = (
    success: boolean,
    durations: {
        sttCompleteDelay?: number
        dataPrepDuration?: number
        connectionDuration?: number
        quickResponseDelay?: number
        funcTokenDelay?: number
        firstAudioDelay?: number
    }
) => {
    const labels: AgentChatLabelValues = {
        success: success ? 'true' : 'false'
    }

    // 只记录存在的指标值
    if (typeof durations.sttCompleteDelay === 'number') {
        agentChatSttCompleteDelay.observe(labels, durations.sttCompleteDelay)
    }
    if (typeof durations.dataPrepDuration === 'number') {
        agentChatDataPrepDuration.observe(labels, durations.dataPrepDuration)
    }
    if (typeof durations.connectionDuration === 'number') {
        agentChatConnectionDuration.observe(labels, durations.connectionDuration)
    }
    if (typeof durations.quickResponseDelay === 'number') {
        agentChatQuickResponseDelay.observe(labels, durations.quickResponseDelay)
    }
    if (typeof durations.funcTokenDelay === 'number') {
        agentChatFuncTokenDelay.observe(labels, durations.funcTokenDelay)
    }
    if (typeof durations.firstAudioDelay === 'number') {
        agentChatFirstAudioDelay.observe(labels, durations.firstAudioDelay)
    }
}

/**
 * 记录 Embedding API 调用的监控数据 TODO 书写grafana
 * 包括调用次数统计和耗时分布
 *
 * @param provider - Embedding provider (aliyun, other, 等)
 * @param model - 使用的模型名称
 * @param durationMs - 调用耗时（毫秒）
 * @param status - 调用状态（success 或 failure）
 */
export const recordEmbeddingMetrics = (
    provider: string,
    model: string,
    durationMs: number,
    status: 'success' | 'failure' = 'success'
) => {
    const labels: EmbeddingLabelValues = {
        provider: provider || 'unknown',
        model: model || 'unknown',
        status
    }

    // 记录调用次数
    embeddingRequestTotal.inc(labels)

    // 记录耗时分布
    embeddingDurationHistogram.observe(labels, durationMs)
}

/**
 * 导出Prometheus注册表实例，供外部使用
 */
export { register }
