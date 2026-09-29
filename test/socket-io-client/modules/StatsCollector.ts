/** @format */
/**
 * 统计数据收集器模块
 * 负责收集和输出测试统计信息
 */

import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'

export interface ClientStats {
    clientId: number
    deviceSN: string
    connected: boolean
    chatCount: number
    chatResponseCount: number
    chatAudioResponseCount: number
    doneCount: number
    doneResponseCount: number
    rttCount: number
    audioSentCount: number // 发送的音频数
    textSentCount: number // 发送的纯文本数
    errors: number
    startTime: number
    endTime?: number
    // 延迟跟踪
    chatLatencies: number[] // CHAT 响应延迟（毫秒）
    doneLatencies: number[] // DONE 响应延迟（毫秒）
}

export interface LatencyMetrics {
    count: number
    min: number
    max: number
    avg: number
    p50: number
    p95: number
    p99: number
}

export interface GlobalStats {
    totalClients: number
    connectedClients: number
    disconnectedClients: number
    totalChatResponseCount: number
    totalChatAudioResponseCount: number
    totalChats: number
    totalDoneResponseCount: number
    totalDones: number
    totalRtts: number
    totalAudioSent: number
    totalTextSent: number
    totalErrors: number
    startTime: number
    endTime?: number
}

/**
 * 统计数据收集器类
 */
export class StatsCollector {
    private globalStats: GlobalStats
    private clientStatsMap: Map<number, ClientStats> = new Map()
    private statsInterval: NodeJS.Timeout | null = null
    // 跟踪每个请求的开始时间
    private chatStartTimes: Map<string, number> = new Map()
    private doneStartTimes: Map<string, number> = new Map()
    private excelOutputDir: string
    private processId?: number

    constructor(totalClients: number, excelOutputDir: string, processId?: number) {
        this.excelOutputDir = excelOutputDir
        this.processId = processId
        this.globalStats = {
            totalDoneResponseCount: 0,
            totalChatResponseCount: 0,
            totalChatAudioResponseCount: 0,
            totalClients,
            connectedClients: 0,
            disconnectedClients: 0,
            totalChats: 0,
            totalDones: 0,
            totalRtts: 0,
            totalAudioSent: 0,
            totalTextSent: 0,
            totalErrors: 0,
            startTime: Date.now()
        }
    }

    /**
     * 初始化客户端统计
     */
    initClientStats(clientId: number, deviceSN: string): ClientStats {
        const stats: ClientStats = {
            clientId,
            deviceSN,
            connected: false,
            chatCount: 0,
            chatResponseCount: 0,
            chatAudioResponseCount: 0,
            doneCount: 0,
            doneResponseCount: 0,
            rttCount: 0,
            audioSentCount: 0,
            textSentCount: 0,
            errors: 0,
            startTime: Date.now(),
            chatLatencies: [],
            doneLatencies: []
        }

        this.clientStatsMap.set(clientId, stats)
        return stats
    }

    /**
     * 记录客户端连接
     */
    recordConnect(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.connected = true
            this.globalStats.connectedClients++
        }
    }

    /**
     * 记录客户端断开
     */
    recordDisconnect(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.connected = false
            stats.endTime = Date.now()
            this.globalStats.connectedClients--
            this.globalStats.disconnectedClients++
        }
    }

    /**
     * 记录 CHAT 事件
     */
    recordChat(clientId: number, hasAudio: boolean, traceId?: string) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.chatCount++
            if (hasAudio) {
                stats.audioSentCount++
                this.globalStats.totalAudioSent++
            } else {
                stats.textSentCount++
                this.globalStats.totalTextSent++
            }
        }
        this.globalStats.totalChats++

        // 记录请求开始时间
        if (traceId) {
            this.chatStartTimes.set(traceId, Date.now())
        }
    }

    /**
     * 记录 CHAT 响应
     */
    recordChatResponse(clientId: number, traceId?: string) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.chatResponseCount++

            // 计算 FuncToken首包响应延迟
            if (traceId && this.chatStartTimes.has(traceId)) {
                const startTime = this.chatStartTimes.get(traceId)!
                const latency = Date.now() - startTime
                stats.chatLatencies.push(latency)
                this.chatStartTimes.delete(traceId)
            }
        }
        this.globalStats.totalChatResponseCount++
    }
    /**
     * 记录 CHAT AUDIO 响应
     */
    recordChatAudioResponse(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.chatAudioResponseCount++
        }
        this.globalStats.totalChatAudioResponseCount++
    }

    /**
     * 记录 DONE 事件
     */
    recordDone(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.doneCount++
            // 记录 DONE 开始时间
            const key = `${clientId}_${stats.doneCount}`
            this.doneStartTimes.set(key, Date.now())
        }
        this.globalStats.totalDones++
    }

    /**
     * 记录 DONE 响应
     */
    recordDoneResponse(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.doneResponseCount++
            // 计算延迟
            const key = `${clientId}_${stats.doneResponseCount}`
            if (this.doneStartTimes.has(key)) {
                const startTime = this.doneStartTimes.get(key)!
                const latency = Date.now() - startTime
                stats.doneLatencies.push(latency)
                this.doneStartTimes.delete(key)
            }
        }
        this.globalStats.totalDoneResponseCount++
    }

    /**
     * 记录 RTT 事件
     */
    recordRTT(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.rttCount++
        }
        this.globalStats.totalRtts++
    }

    /**
     * 记录错误
     */
    recordError(clientId: number) {
        const stats = this.clientStatsMap.get(clientId)
        if (stats) {
            stats.errors++
        }
        this.globalStats.totalErrors++
    }

    /**
     * 获取客户端统计
     */
    getClientStats(clientId: number): ClientStats | undefined {
        return this.clientStatsMap.get(clientId)
    }

    /**
     * 获取全局统计
     */
    getGlobalStats(): GlobalStats {
        return this.globalStats
    }

    /**
     * 开始定期输出统计
     */
    startPeriodicStats(intervalMs: number = 10000) {
        this.statsInterval = setInterval(() => {
            this.printStats()
        }, intervalMs)
    }

    /**
     * 停止定期输出
     */
    stopPeriodicStats() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval)
            this.statsInterval = null
        }
    }

    /**
     * 打印当前统计
     */
    printStats() {
        const timestamp = new Date().toLocaleString('zh-CN', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        const elapsed = ((Date.now() - this.globalStats.startTime) / 1000).toFixed(1)

        console.log('\n----------------------------------------')
        console.log(`[${timestamp}] 统计信息`)
        console.log(`运行时间: ${elapsed}s`)
        console.log(`连接中: ${this.globalStats.connectedClients}`)
        console.log(`已断开: ${this.globalStats.disconnectedClients}`)
        console.log(
            `总 CHAT: ${this.globalStats.totalChats} (音频: ${this.globalStats.totalAudioSent}, 文本: ${this.globalStats.totalTextSent})`
        )
        console.log(`总 CHAT 响应: ${this.globalStats.totalChatResponseCount}`)
        console.log(`总 CHAT_AUDIO 响应: ${this.globalStats.totalChatAudioResponseCount}`)
        console.log(`总 DONE: ${this.globalStats.totalDones}`)
        console.log(`总 DONE 响应: ${this.globalStats.totalDoneResponseCount}`)
        console.log(`总 RTT: ${this.globalStats.totalRtts}`)
        console.log(`总错误: ${this.globalStats.totalErrors}`)
        console.log('----------------------------------------\n')
    }

    /**
     * 打印最终统计
     */
    printFinalStats() {
        this.globalStats.endTime = Date.now()
        const totalTime = ((this.globalStats.endTime - this.globalStats.startTime) / 1000).toFixed(2)
        const avgChatRate = (this.globalStats.totalChatResponseCount / parseFloat(totalTime)).toFixed(2)
        const avgChatAudioRate = (this.globalStats.totalChatAudioResponseCount / parseFloat(totalTime)).toFixed(2)
        const avgRttRate = (this.globalStats.totalRtts / parseFloat(totalTime)).toFixed(2)

        // 控制台简要输出
        console.log('\n========================================')
        console.log('🎯 负载测试完成')
        console.log('========================================')
        console.log(`⏱️  总运行时间: ${totalTime}s`)
        console.log(`👥 总客户端数: ${this.globalStats.totalClients}`)
        console.log(`✅ 成功连接: ${this.globalStats.totalClients}`)
        console.log(`👥 音频发送: ${this.globalStats.totalAudioSent} `)
        console.log(`👥 文本发送: ${this.globalStats.totalTextSent}`)
        console.log(`📊 CHAT 总数: ${this.globalStats.totalChats}`)
        console.log(`📨 CHAT 响应: ${this.globalStats.totalChatResponseCount}(${avgChatRate} 次/秒)`)
        console.log(`📨 CHAT_AUDIO 响应: ${this.globalStats.totalChatAudioResponseCount} (${avgChatAudioRate} 次/秒)`)
        console.log(`📨 总 RTT: ${this.globalStats.totalRtts} (${avgRttRate} 次/秒)`)
        console.log(`📨 总 DONE: ${this.globalStats.totalDones}`)
        console.log(`📨 总 DONE 响应: ${this.globalStats.totalDoneResponseCount}`)
        console.log(`⚠️ 错误数: ${this.globalStats.totalErrors}`)

        const totalEvents = this.globalStats.totalChats + this.globalStats.totalDones + this.globalStats.totalRtts
        const errorRate = totalEvents > 0 ? ((this.globalStats.totalErrors / totalEvents) * 100).toFixed(2) : '0.00'
        console.log(`📉 错误率: ${errorRate}%`)

        // 导出 Excel 报告
        const excelPath = this.exportToExcel()
        console.log(`\n📄 详细报告已导出到: ${excelPath}`)
        console.log('========================================\n')
    }

    /**
     * 检查是否所有客户端都已完成
     */
    isAllClientsComplete(): boolean {
        return this.globalStats.disconnectedClients === this.globalStats.totalClients
    }

    /**
     * 导出统计数据到 Excel
     */
    exportToExcel(): string {
        // 确保输出目录存在
        if (!fs.existsSync(this.excelOutputDir)) {
            fs.mkdirSync(this.excelOutputDir, { recursive: true })
        }

        // 生成文件名（带进程ID）
        const timestamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/\s:]/g, '-')
        const processTag = this.processId ? `-process${this.processId}` : ''
        const filename = `load-test-report-${timestamp}${processTag}.xlsx`
        const filepath = path.join(this.excelOutputDir, filename)

        // 创建工作簿
        const workbook = XLSX.utils.book_new()

        // 1. 总览 Sheet
        const summaryData = this.generateSummaryData()
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(workbook, summarySheet, '测试总览')

        // 2. 延迟指标 Sheet
        const latencyData = this.generateLatencyData()
        const latencySheet = XLSX.utils.aoa_to_sheet(latencyData)
        XLSX.utils.book_append_sheet(workbook, latencySheet, '延迟指标')

        // 3. 吞吐量 Sheet
        const throughputData = this.generateThroughputData()
        const throughputSheet = XLSX.utils.aoa_to_sheet(throughputData)
        XLSX.utils.book_append_sheet(workbook, throughputSheet, '吞吐量统计')

        // 4. 错误统计 Sheet
        const errorData = this.generateErrorData()
        const errorSheet = XLSX.utils.aoa_to_sheet(errorData)
        XLSX.utils.book_append_sheet(workbook, errorSheet, '错误统计')

        // 5. 客户端明细 Sheet
        const clientData = this.generateClientDetailsData()
        const clientSheet = XLSX.utils.aoa_to_sheet(clientData)
        XLSX.utils.book_append_sheet(workbook, clientSheet, '客户端明细')

        // 6. Top 客户端 Sheet
        const topClientsData = this.generateTopClientsData()
        const topClientsSheet = XLSX.utils.aoa_to_sheet(topClientsData)
        XLSX.utils.book_append_sheet(workbook, topClientsSheet, 'Top客户端')

        // 写入文件
        XLSX.writeFile(workbook, filepath)

        return filepath
    }

    /**
     * 生成总览数据
     */
    private generateSummaryData(): any[][] {
        const totalTime = this.globalStats.endTime ? (this.globalStats.endTime - this.globalStats.startTime) / 1000 : 0
        const totalEvents = this.globalStats.totalChats + this.globalStats.totalDones + this.globalStats.totalRtts
        const errorRate = totalEvents > 0 ? (this.globalStats.totalErrors / totalEvents) * 100 : 0

        return [
            ['负载测试总览报告'],
            [],
            ['指标', '数值'],
            ['测试开始时间', new Date(this.globalStats.startTime).toLocaleString('zh-CN')],
            [
                '测试结束时间',
                this.globalStats.endTime ? new Date(this.globalStats.endTime).toLocaleString('zh-CN') : 'N/A'
            ],
            ['总运行时间 (秒)', totalTime.toFixed(2)],
            ['总客户端数', this.globalStats.totalClients],
            ['成功连接客户端', this.globalStats.totalClients],
            ['已断开客户端', this.globalStats.disconnectedClients],
            [],
            ['事件统计', ''],
            ['总 CHAT 请求', this.globalStats.totalChats],
            ['总 CHAT 响应', this.globalStats.totalChatResponseCount],
            ['总 CHAT_AUDIO 响应', this.globalStats.totalChatAudioResponseCount],
            ['总 DONE 请求', this.globalStats.totalDones],
            ['总 DONE 响应', this.globalStats.totalDoneResponseCount],
            ['总 RTT 请求', this.globalStats.totalRtts],
            ['音频发送数', this.globalStats.totalAudioSent],
            ['文本发送数', this.globalStats.totalTextSent],
            [],
            ['错误统计', ''],
            ['总错误数', this.globalStats.totalErrors],
            ['总事件数', totalEvents],
            ['错误率 (%)', errorRate.toFixed(2)]
        ]
    }

    /**
     * 生成延迟指标数据
     */
    private generateLatencyData(): any[][] {
        const allLatencies = this.collectAllLatencies()
        const chatMetrics = this.calculateLatencyMetrics(allLatencies.chat)
        const doneMetrics = this.calculateLatencyMetrics(allLatencies.done)

        return [
            ['延迟指标统计 (单位: 毫秒)'],
            [],
            ['指标', '样本数', '最小值', '最大值', '平均值', 'P50', 'P95', 'P99'],
            [
                'CHAT FuncToken首包响应延迟',
                chatMetrics.count,
                chatMetrics.min.toFixed(2),
                chatMetrics.max.toFixed(2),
                chatMetrics.avg.toFixed(2),
                chatMetrics.p50.toFixed(2),
                chatMetrics.p95.toFixed(2),
                chatMetrics.p99.toFixed(2)
            ],
            [
                'DONE 响应延迟',
                doneMetrics.count,
                doneMetrics.min.toFixed(2),
                doneMetrics.max.toFixed(2),
                doneMetrics.avg.toFixed(2),
                doneMetrics.p50.toFixed(2),
                doneMetrics.p95.toFixed(2),
                doneMetrics.p99.toFixed(2)
            ]
        ]
    }

    /**
     * 生成吞吐量数据
     */
    private generateThroughputData(): any[][] {
        const totalTime = this.globalStats.endTime
            ? (this.globalStats.endTime - this.globalStats.startTime) / 1000
            : (Date.now() - this.globalStats.startTime) / 1000

        const chatThroughput = this.globalStats.totalChats / totalTime
        const chatResponseThroughput = this.globalStats.totalChatResponseCount / totalTime
        const chatAudioThroughput = this.globalStats.totalChatAudioResponseCount / totalTime
        const doneThroughput = this.globalStats.totalDoneResponseCount / totalTime
        const rttThroughput = this.globalStats.totalRtts / totalTime

        return [
            ['吞吐量统计'],
            [],
            ['指标', '总计', '吞吐量 (QPS)'],
            ['CHAT 请求', this.globalStats.totalChats, chatThroughput.toFixed(2)],
            ['CHAT 响应', this.globalStats.totalChatResponseCount, chatResponseThroughput.toFixed(2)],
            ['CHAT_AUDIO 响应', this.globalStats.totalChatAudioResponseCount, chatAudioThroughput.toFixed(2)],
            ['DONE 请求', this.globalStats.totalDones, doneThroughput.toFixed(2)],
            ['DONE 响应', this.globalStats.totalDoneResponseCount, doneThroughput.toFixed(2)],
            ['RTT 心跳', this.globalStats.totalRtts, rttThroughput.toFixed(2)]
        ]
    }

    /**
     * 生成错误统计数据
     */
    private generateErrorData(): any[][] {
        const totalEvents = this.globalStats.totalChats + this.globalStats.totalDones + this.globalStats.totalRtts
        const errorRate = totalEvents > 0 ? (this.globalStats.totalErrors / totalEvents) * 100 : 0
        const successRate = 100 - errorRate

        return [
            ['错误率统计'],
            [],
            ['指标', '数量', '百分比 (%)'],
            ['总事件数', totalEvents, '100.00'],
            ['成功事件', totalEvents - this.globalStats.totalErrors, successRate.toFixed(2)],
            ['失败事件', this.globalStats.totalErrors, errorRate.toFixed(2)]
        ]
    }

    /**
     * 生成客户端明细数据
     */
    private generateClientDetailsData(): any[][] {
        const header = [
            ['客户端明细'],
            [],
            [
                '客户端ID',
                '设备SN',
                'CHAT数',
                'CHAT响应',
                'CHAT_AUDIO响应',
                'DONE数',
                'DONE响应',
                'RTT数',
                '音频发送',
                '文本发送',
                '错误数',
                '运行时间(秒)',
                'CHAT平均延迟(ms)',
                'DONE平均延迟(ms)'
            ]
        ]

        const rows = Array.from(this.clientStatsMap.values()).map(stats => {
            const runTime = stats.endTime ? ((stats.endTime - stats.startTime) / 1000).toFixed(2) : 'N/A'
            const chatAvgLatency =
                stats.chatLatencies.length > 0
                    ? (stats.chatLatencies.reduce((a, b) => a + b, 0) / stats.chatLatencies.length).toFixed(2)
                    : '0'
            const doneAvgLatency =
                stats.doneLatencies.length > 0
                    ? (stats.doneLatencies.reduce((a, b) => a + b, 0) / stats.doneLatencies.length).toFixed(2)
                    : '0'

            return [
                stats.clientId,
                stats.deviceSN,
                stats.chatCount,
                stats.chatResponseCount,
                stats.chatAudioResponseCount,
                stats.doneCount,
                stats.doneResponseCount,
                stats.rttCount,
                stats.audioSentCount,
                stats.textSentCount,
                stats.errors,
                runTime,
                chatAvgLatency,
                doneAvgLatency
            ]
        })

        return [...header, ...rows]
    }

    /**
     * 生成 Top 客户端数据
     */
    private generateTopClientsData(): any[][] {
        const clientsArray = Array.from(this.clientStatsMap.values())

        // 按 CHAT 数量排序
        const topChatClients = clientsArray.sort((a, b) => b.chatCount - a.chatCount).slice(0, 10)

        // 按错误数排序
        const topErrorClients = clientsArray
            .sort((a, b) => b.errors - a.errors)
            .slice(0, 10)
            .filter(c => c.errors > 0)

        const data: any[][] = [
            ['Top 10 客户端 (按 CHAT 数量)'],
            [],
            ['排名', '客户端ID', '设备SN', 'CHAT数', 'DONE数', 'RTT数', '错误数', '平均延迟(ms)']
        ]

        topChatClients.forEach((client, index) => {
            const avgLatency =
                client.chatLatencies.length > 0
                    ? (client.chatLatencies.reduce((a, b) => a + b, 0) / client.chatLatencies.length).toFixed(2)
                    : '0'
            data.push([
                index + 1,
                client.clientId,
                client.deviceSN,
                client.chatCount,
                client.doneCount,
                client.rttCount,
                client.errors,
                avgLatency
            ])
        })

        if (topErrorClients.length > 0) {
            data.push([])
            data.push(['Top 错误客户端'])
            data.push([])
            data.push(['排名', '客户端ID', '设备SN', 'CHAT数', 'DONE数', '错误数', '错误率 (%)'])

            topErrorClients.forEach((client, index) => {
                const totalEvents = client.chatCount + client.doneCount + client.rttCount
                const errorRate = totalEvents > 0 ? ((client.errors / totalEvents) * 100).toFixed(2) : '0.00'
                data.push([
                    index + 1,
                    client.clientId,
                    client.deviceSN,
                    client.chatCount,
                    client.doneCount,
                    client.errors,
                    errorRate
                ])
            })
        }

        return data
    }

    /**
     * 计算百分位数
     */
    private calculatePercentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) return 0
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1
        return sortedArray[Math.max(0, index)]
    }

    /**
     * 计算延迟指标
     */
    private calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
        if (latencies.length === 0) {
            return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 }
        }

        const sorted = [...latencies].sort((a, b) => a - b)
        const sum = sorted.reduce((acc, val) => acc + val, 0)

        return {
            count: sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / sorted.length,
            p50: this.calculatePercentile(sorted, 50),
            p95: this.calculatePercentile(sorted, 95),
            p99: this.calculatePercentile(sorted, 99)
        }
    }

    /**
     * 收集所有客户端的延迟数据
     */
    private collectAllLatencies(): { chat: number[]; done: number[] } {
        const chatLatencies: number[] = []
        const doneLatencies: number[] = []

        this.clientStatsMap.forEach(stats => {
            chatLatencies.push(...stats.chatLatencies)
            doneLatencies.push(...stats.doneLatencies)
        })

        return { chat: chatLatencies, done: doneLatencies }
    }

    /**
     * 格式化表格行
     */
    private formatTableRow(
        metric: string,
        count: number | string,
        min: number | string,
        max: number | string,
        avg: number | string,
        p50: number | string,
        p95: number | string,
        p99: number | string
    ): string {
        return `│ ${this.padRight(metric, 18)} │ ${this.padLeft(count, 8)} │ ${this.padLeft(min, 8)} │ ${this.padLeft(max, 8)} │ ${this.padLeft(avg, 8)} │ ${this.padLeft(p50, 8)} │ ${this.padLeft(p95, 8)} │ ${this.padLeft(p99, 8)} │`
    }

    /**
     * 右对齐填充
     */
    private padLeft(str: string | number, length: number): string {
        const s = typeof str === 'number' ? str.toFixed(0) : str
        return s.padStart(length, ' ')
    }

    /**
     * 左对齐填充
     */
    private padRight(str: string, length: number): string {
        return str.padEnd(length, ' ')
    }
}
