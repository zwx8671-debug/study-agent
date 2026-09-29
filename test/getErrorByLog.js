/** @format */

import fs from 'fs'

import path from 'path'
// 配置参数
const config = {
    // 日志文件所在目录
    logDir: 'D:/project/ts/coco-cloud-ts/logs',
    // 要读取的日志文件列表
    logFiles: [
        'app.log.2026-01-20.1.log',
        'app.log.2026-01-20.2.log',
        'app.log.2026-01-20.3.log',
        'app.log.2026-01-20.4.log',
        'app.log.2026-01-20.5.log',
        'app.log.2026-01-20.6.log',
        'app.log.2026-01-20.7.log',
        'app.log.2026-01-20.8.log',
        'app.log.2026-01-20.9.log',
        'app.log.2026-01-20.10.log',
        'app.log.2026-01-20.11.log',
        'app.log.2026-01-20.12.log',
        'app.log.2026-01-20.13.log',
        'app.log.2026-01-20.14.log',
        'app.log.2026-01-20.15.log',
        'app.log.2026-01-20.16.log'
    ],
    // 时间范围
    startTime: '2026-01-19 18:45:00',
    endTime: '2026-01-21 18:53:00',
    // 目标日志级别
    targetLevel: 'error',
    // 筛选结果输出文件（修改为相同目录的 Error.json）
    outputFile: path.join('D:/project/ts/coco-cloud-ts/logs', 'Error.json')
}

// 转换时间为时间戳
function getTimestamp(timeStr) {
    return new Date(timeStr).getTime()
}

// 检查日志行是否符合条件
function isLogMatch(logLine) {
    try {
        // 解析JSON日志
        const logObj = JSON.parse(logLine.trim())

        // 检查日志级别
        if (logObj.level !== config.targetLevel) {
            return false
        }

        // 检查时间范围
        const logTime = getTimestamp(logObj.time)
        const start = getTimestamp(config.startTime)
        const end = getTimestamp(config.endTime)

        return logTime >= start && logTime <= end
    } catch (e) {
        // 忽略解析失败的行
        return false
    }
}

// 主函数
async function filterLogs() {
    console.log(`开始筛选日志，时间范围：${config.startTime} - ${config.endTime}`)
    console.log(`日志目录：${config.logDir}`)

    const matchedLogs = []
    let totalLines = 0
    let parsedLines = 0

    // 遍历所有日志文件
    for (const fileName of config.logFiles) {
        const filePath = path.join(config.logDir, fileName)

        try {
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                console.warn(`文件不存在：${filePath}`)
                continue
            }

            console.log(`正在处理文件：${fileName}`)

            // 读取文件内容（按行读取，避免一次性加载大文件）
            const content = fs.readFileSync(filePath, 'utf8')
            const lines = content.split('\n')

            totalLines += lines.length

            // 逐行处理
            for (const line of lines) {
                if (line.trim() === '') continue

                if (isLogMatch(line)) {
                    // 解析为JSON对象存入数组，最终输出标准JSON格式
                    matchedLogs.push(JSON.parse(line.trim()))
                }

                parsedLines++
                // 进度提示
                if (parsedLines % 10000 === 0) {
                    console.log(`已解析 ${parsedLines} 行，找到 ${matchedLogs.length} 条符合条件的日志`)
                }
            }
        } catch (err) {
            console.error(`处理文件 ${fileName} 时出错：`, err.message)
        }
    }

    // 输出结果
    console.log(`\n筛选完成！`)
    console.log(`总共解析行数：${totalLines}`)
    console.log(`符合条件的错误日志数量：${matchedLogs.length}`)

    // 输出到控制台
    if (matchedLogs.length > 0) {
        console.log('\n=== 筛选结果 ===')
        console.log(JSON.stringify(matchedLogs, null, 2))

        // 写入到JSON文件（格式化输出，便于阅读）
        try {
            fs.writeFileSync(config.outputFile, JSON.stringify(matchedLogs, null, 2), 'utf8')
            console.log(`\n筛选结果已保存到文件：${config.outputFile}`)
        } catch (err) {
            console.error('写入输出文件失败：', err.message)
        }
    } else {
        console.log('\n未找到符合条件的错误日志')
        // 即使没有结果，也创建空的JSON文件
        fs.writeFileSync(config.outputFile, JSON.stringify([], null, 2), 'utf8')
        console.log(`已创建空的输出文件：${config.outputFile}`)
    }

    return matchedLogs
}

// 执行脚本
filterLogs().catch(err => {
    console.error('脚本执行出错：', err)
    process.exit(1)
})
