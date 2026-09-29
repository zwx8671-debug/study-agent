/**
 * PM2 日志归档 / 按日切分公共逻辑
 *
 * 同一 PM2 daemon 上的多个项目不能并发调用 `pm2 reloadLogs`，
 * 否则 daemon 可能在 Utility.startLogging 里崩溃并带走全部业务进程。
 *
 * @format
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RELOAD_LOCK_STALE_MS = 2 * 60 * 1000
const RELOAD_LOCK_WAIT_MS = 2 * 60 * 1000
const RELOAD_LOCK_INTERVAL_MS = 200

function pad(value) {
    return String(value).padStart(2, '0')
}

function dateStamp(date = new Date()) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
}

function dateTimeStamp(date = new Date()) {
    return `${dateStamp(date)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

function yesterdayStamp() {
    const date = new Date()
    date.setDate(date.getDate() - 1)
    return dateStamp(date)
}

function pm2Home() {
    return process.env.PM2_HOME || path.join(os.homedir(), '.pm2')
}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireReloadLock(lockDir) {
    const started = Date.now()
    while (Date.now() - started < RELOAD_LOCK_WAIT_MS) {
        try {
            fs.mkdirSync(lockDir)
            return true
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error
            }
            try {
                if (Date.now() - fs.statSync(lockDir).ctimeMs > RELOAD_LOCK_STALE_MS) {
                    fs.rmdirSync(lockDir)
                    continue
                }
            } catch {
                continue
            }
            sleepSync(RELOAD_LOCK_INTERVAL_MS)
        }
    }
    return false
}

function releaseReloadLock(lockDir) {
    try {
        fs.rmdirSync(lockDir)
    } catch {
        // ignore
    }
}

function createPm2LogTools({ root, appName, logPrefix = 'pm2' }) {
    const outLog = path.join(root, 'logs', 'pm2-out.log')
    const archiveDir = path.join(root, 'logs', 'archive')
    const dayMark = path.join(root, 'logs', '.pm2-out-day')

    function findLocalPm2() {
        try {
            return require.resolve('pm2/bin/pm2')
        } catch {
            return null
        }
    }

    function runPm2(args, { optional = false } = {}) {
        const localPm2 = findLocalPm2()
        const result = localPm2
            ? spawnSync(process.execPath, [localPm2, ...args], {
                  cwd: root,
                  stdio: 'inherit'
              })
            : spawnSync('pm2', args, {
                  cwd: root,
                  stdio: 'inherit',
                  shell: process.platform === 'win32'
              })
        if (result.error) {
            if (optional) {
                console.warn(`[${logPrefix}] pm2 ${args.join(' ')} 失败: ${result.error.message}`)
                return false
            }
            throw result.error
        }
        if (result.status !== 0) {
            if (optional) {
                console.warn(`[${logPrefix}] pm2 ${args.join(' ')} 退出码 ${result.status}`)
                return false
            }
            process.exit(result.status ?? 1)
        }
        return true
    }

    function readDayMark() {
        try {
            const value = fs.readFileSync(dayMark, 'utf8').trim()
            return value || null
        } catch {
            return null
        }
    }

    function writeDayMark(day = dateStamp()) {
        fs.mkdirSync(path.dirname(dayMark), { recursive: true })
        fs.writeFileSync(dayMark, `${day}\n`)
    }

    function uniqueArchivePath(stamp) {
        let dest = path.join(archiveDir, `pm2-out.${stamp}.log`)
        let index = 1
        while (fs.existsSync(dest)) {
            dest = path.join(archiveDir, `pm2-out.${stamp}-${index}.log`)
            index += 1
        }
        return dest
    }

    function archiveOutLog(stamp, { allowRename = false } = {}) {
        if (!fs.existsSync(outLog)) {
            console.log(`[${logPrefix}] 没有可归档的 logs/pm2-out.log`)
            return null
        }

        fs.mkdirSync(archiveDir, { recursive: true })
        const dest = uniqueArchivePath(stamp)
        const relativeDest = path.relative(root, dest)

        if (allowRename) {
            try {
                fs.renameSync(outLog, dest)
                console.log(`[${logPrefix}] 已归档 logs/pm2-out.log -> ${relativeDest}`)
                return dest
            } catch (error) {
                if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
                    throw error
                }
            }
        }

        // 业务进程还在写日志时不要 rename：Linux 上会成功，但随后 reloadLogs
        // 容易把 PM2 daemon 的日志流状态打坏。
        fs.copyFileSync(outLog, dest)
        fs.truncateSync(outLog, 0)
        console.log(`[${logPrefix}] 已复制归档并清空 logs/pm2-out.log -> ${relativeDest}`)
        return dest
    }

    function reloadLogsSafely() {
        const home = pm2Home()
        const lockDir = path.join(home, 'reload-logs.lock')
        fs.mkdirSync(home, { recursive: true })

        if (!acquireReloadLock(lockDir)) {
            console.warn(`[${logPrefix}] 等待 reloadLogs 锁超时，跳过，避免并发打崩 PM2 daemon`)
            return false
        }

        try {
            console.log(`[${logPrefix}] 获取 reloadLogs 锁，开始重新打开日志`)
            return runPm2(['reloadLogs'], { optional: true })
        } finally {
            releaseReloadLock(lockDir)
        }
    }

    function rotateIfNewDay() {
        const today = dateStamp()
        if (!fs.existsSync(outLog) || fs.statSync(outLog).size === 0) {
            writeDayMark(today)
            console.log(`[${logPrefix}] 没有需要按日切分的 logs/pm2-out.log`)
            return false
        }

        const marked = readDayMark()
        if (marked === today) {
            console.log(`[${logPrefix}] 当日日志已在用，跳过切分`)
            return false
        }

        if (!marked) {
            const stat = fs.statSync(outLog)
            const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.ctime
            if (dateStamp(created) === today) {
                writeDayMark(today)
                console.log(`[${logPrefix}] 日志从今天开始，跳过切分`)
                return false
            }
        }

        archiveOutLog(marked || yesterdayStamp())
        reloadLogsSafely()
        writeDayMark(today)
        console.log(`[${logPrefix}] 已按日切分并重新加载 pm2-out.log`)
        return true
    }

    return {
        appName,
        runPm2,
        archiveOutLog,
        reloadLogsSafely,
        rotateIfNewDay,
        writeDayMark,
        dateTimeStamp
    }
}

module.exports = {
    createPm2LogTools,
    dateStamp,
    dateTimeStamp,
    yesterdayStamp
}
