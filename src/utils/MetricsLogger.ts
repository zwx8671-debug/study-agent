/** @format */

import { getLogger, Logger } from '@utils/Logger'
import { traceContext } from '@utils/TraceContext'
import { recordAgentChatMetrics } from '../prometheus/metrics'

/**
 * 埋点日志工具类
 * 用于记录各种性能指标和流量数据
 */
export class MetricsLogger {
    private logger: Logger
    private static instance: MetricsLogger

    private constructor() {
        this.logger = getLogger('Metrics')
    }

    /**
     * 获取单例实例
     */
    static getInstance(): MetricsLogger {
        if (!MetricsLogger.instance) {
            MetricsLogger.instance = new MetricsLogger()
        }
        return MetricsLogger.instance
    }

    /**
     * 记录完整的 Chat 性能指标（在 chat 结束或异常时调用）
     * @param success 是否成功
     * @param error 错误信息
     */
    logChatMetrics(success: boolean = true, error?: string): void {
        const context = traceContext.getContext()
        const metrics = context.metrics || {}
        const traffic = context.traffic || {}

        // 计算各阶段耗时
        const durations: any = {}

        // 用户输入 完成时间
        if (metrics.sttStartTime && metrics.sttCompleteTime) {
            durations.sttDuration = metrics.sttCompleteTime - metrics.sttStartTime
        }

        // 快速响应 完成时间
        if (metrics.quickVectorStartTime && metrics.quickVectorEndTime) {
            durations.quickDuration = metrics.quickVectorEndTime - metrics.quickVectorStartTime
        }

        // LLM 完成时间
        if (metrics.llmFirstPacketTime && metrics.llmLastPacketTime) {
            durations.llmDuration = metrics.llmLastPacketTime - metrics.llmFirstPacketTime
        }

        // TTS 完成时间
        if (metrics.ttsFirstPacketTime && metrics.ttsLastPacketTime) {
            durations.ttsDuration = metrics.ttsLastPacketTime - metrics.ttsFirstPacketTime
        }

        // 总 完成时间
        if (metrics.userFirstPacketTime && metrics.ttsLastPacketTime) {
            durations.totalDuration = metrics.ttsLastPacketTime - metrics.userFirstPacketTime
        }

        // 数据准备：语音转文字延迟
        if (metrics.userLastPacketTime && metrics.sttCompleteTime) {
            durations.sttCompleteDelay = metrics.sttCompleteTime - metrics.userLastPacketTime
        }

        // 数据准备：查库 完成时间
        if (metrics.dataPrepStartTime && metrics.dataPrepCompleteTime) {
            durations.dataPrepDuration = metrics.dataPrepCompleteTime - metrics.dataPrepStartTime
        }

        // 数据准备：TTS连接/LLM思考 完成时间
        if (metrics.connectionStartTime && metrics.connectionCompleteTime) {
            durations.connectionDuration = metrics.connectionCompleteTime - metrics.connectionStartTime
        }

        // 首包延迟（快速响应）
        if (metrics.userLastPacketTime && metrics.quickVectorEndTime) {
            durations.quickResponseDelay = metrics.quickVectorEndTime - metrics.userLastPacketTime
        }

        // 首FuncToken延迟
        if (metrics.userLastPacketTime && metrics.llmFirstPacketTime) {
            durations.llmDelay = metrics.llmFirstPacketTime - metrics.userLastPacketTime
        }

        // 首FuncToken延迟
        if (metrics.userLastPacketTime && metrics.funcTokenFirstPacketTime) {
            durations.funcTokenDelay = metrics.funcTokenFirstPacketTime - metrics.userLastPacketTime
        }

        // 首个音频延迟
        if (metrics.userLastPacketTime && metrics.ttsFirstPacketTime) {
            durations.firstAudioDelay = metrics.ttsFirstPacketTime - metrics.userLastPacketTime
        }

        // 构建表格形式的日志消息
        let tableMessage = `\n${'='.repeat(80)}\n`
        tableMessage += `METRICS Chat完整指标\n`
        tableMessage += `${'='.repeat(80)}\n`

        // 基础信息
        tableMessage += `基础信息:\n`
        tableMessage += `  Trace ID: ${context.traceId}\n`
        tableMessage += `  Device SN: ${context.deviceSN}\n`
        tableMessage += `  状态: ${success ? '成功' : '失败'}\n`
        if (error) {
            tableMessage += `  错误: ${error}\n`
        }

        tableMessage += `${'-'.repeat(80)}\n`

        // 时间节点
        tableMessage += `时间节点:\n`
        if (metrics.userFirstPacketTime) {
            tableMessage += `  用户首包: ${metrics.userFirstPacketTime}\n`
        }
        if (metrics.userLastPacketTime) {
            tableMessage += `  用户尾包: ${metrics.userLastPacketTime}\n`
        }
        if (metrics.sttStartTime) {
            tableMessage += `  STT开始: ${metrics.sttStartTime}\n`
        }
        if (metrics.sttCompleteTime) {
            tableMessage += `  STT完成: ${metrics.sttCompleteTime}\n`
        }
        if (metrics.quickVectorStartTime) {
            tableMessage += `  快速响应开始: ${metrics.quickVectorStartTime}\n`
        }
        if (metrics.quickVectorEndTime) {
            tableMessage += `  快速响应完成: ${metrics.quickVectorEndTime}\n`
        }
        if (metrics.dataPrepStartTime) {
            tableMessage += `  数据准备开始: ${metrics.dataPrepStartTime}\n`
        }
        if (metrics.dataPrepCompleteTime) {
            tableMessage += `  数据准备完成: ${metrics.dataPrepCompleteTime}\n`
        }
        if (metrics.connectionStartTime) {
            tableMessage += `  连接建立开始: ${metrics.connectionStartTime}\n`
        }
        if (metrics.connectionCompleteTime) {
            tableMessage += `  连接建立完成: ${metrics.connectionCompleteTime}\n`
        }
        if (metrics.llmFirstPacketTime) {
            tableMessage += `  LLM首包: ${metrics.llmFirstPacketTime}\n`
        }
        if (metrics.llmLastPacketTime) {
            tableMessage += `  LLM尾包: ${metrics.llmLastPacketTime}\n`
        }
        if (metrics.ttsFirstPacketTime) {
            tableMessage += `  TTS首包: ${metrics.ttsFirstPacketTime}\n`
        }
        if (metrics.ttsLastPacketTime) {
            tableMessage += `  TTS尾包: ${metrics.ttsLastPacketTime}\n`
        }

        tableMessage += `${'-'.repeat(80)}\n`

        // 关键性能指标
        tableMessage += `关键性能指标:\n`
        if (durations.sttCompleteDelay) {
            tableMessage += `  数据准备(语音转文字延迟)：${durations.sttCompleteDelay}ms\n`
        }
        if (durations.dataPrepDuration) {
            tableMessage += `  数据准备耗时(查库): ${durations.dataPrepDuration}ms\n`
        }
        if (durations.connectionDuration) {
            tableMessage += `  数据准备耗时(TTS连接/LLM思考): ${durations.connectionDuration}ms\n`
        }
        if (durations.quickResponseDelay) {
            tableMessage += `  快速响应延迟(用户尾包 → 快速响应完成): ${durations.quickResponseDelay}ms\n`
        }
        if (durations.llmDelay) {
            tableMessage += `  LLM首包延迟(用户尾包 → LLM首包): ${durations.llmDelay}ms\n`
        }
        if (durations.funcTokenDelay) {
            tableMessage += `  FuncToken首包延迟(用户尾包 → FuncToken首包): ${durations.funcTokenDelay}ms\n`
        }
        if (durations.firstAudioDelay) {
            tableMessage += `  首个音频包延迟(用户尾包 → TTS首包): ${durations.firstAudioDelay}ms\n`
        }

        tableMessage += `${'-'.repeat(80)}\n`

        // 耗时统计
        tableMessage += `耗时统计:\n`
        if (durations.sttDuration) {
            tableMessage += `  STT耗时: ${durations.sttDuration}ms\n`
        }
        if (durations.quickDuration) {
            tableMessage += `  快速响应耗时: ${durations.quickDuration}ms\n`
        }
        if (durations.llmDuration) {
            tableMessage += `  LLM响应耗时: ${durations.llmDuration}ms\n`
        }
        if (durations.ttsDuration) {
            tableMessage += `  TTS响应耗时: ${durations.ttsDuration}ms\n`
        }
        if (durations.totalDuration) {
            tableMessage += `  总耗时: ${durations.totalDuration}ms\n`
        }

        tableMessage += `${'-'.repeat(80)}\n`

        // 流量统计
        tableMessage += `流量统计:\n`
        if (traffic.audioSize) {
            tableMessage += `  音频大小: ${Number(traffic.audioSize / 1024).toFixed(2)} KB\n`
        }
        if (traffic.audioPacketCount) {
            tableMessage += `  音频包数: ${traffic.audioPacketCount}\n`
        }
        if (traffic.imageSize) {
            tableMessage += `  图片大小: ${Number(traffic.imageSize / 1024).toFixed(2)} KB\n`
        }
        if (traffic.imageCount) {
            tableMessage += `  图片数量: ${traffic.imageCount}\n`
        }
        if (traffic.ttsOutputSize) {
            tableMessage += `  TTS大小: ${Number(traffic.ttsOutputSize / 1024).toFixed(2)} KB\n`
        }
        if (traffic.ttsPacketCount) {
            tableMessage += `  TTS数量: ${traffic.ttsPacketCount}\n`
        }
        if (traffic.textLength) {
            tableMessage += `  文本长度: ${traffic.textLength} chars\n`
        }

        tableMessage += `${'='.repeat(80)}\n`

        if (success) {
            this.logger.infoMsg(tableMessage)
        } else {
            this.logger.warnMsg(tableMessage)
        }

        // 【Prometheus上报】记录关键性能指标
        try {
            recordAgentChatMetrics(success, {
                sttCompleteDelay: durations.sttCompleteDelay,
                dataPrepDuration: durations.dataPrepDuration,
                connectionDuration: durations.connectionDuration,
                quickResponseDelay: durations.quickResponseDelay,
                funcTokenDelay: durations.funcTokenDelay,
                firstAudioDelay: durations.firstAudioDelay
            })
        } catch (e) {
            this.logger.error('Prometheus指标上报失败:', e)
        }
    }
}

/**
 * 导出单例实例
 */
export const metricsLogger = MetricsLogger.getInstance()
