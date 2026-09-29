/**
 * 归档当前 pm2-out.log，重启进程后再重新打开日志文件
 *
 * @format
 */

const path = require('path')
const { createPm2LogTools } = require('./pm2-log-utils.cjs')

const ROOT = path.join(__dirname, '..')
const { appName, runPm2, archiveOutLog, reloadLogsSafely, writeDayMark, dateTimeStamp } = createPm2LogTools({
    root: ROOT,
    appName: 'coco-tts',
    logPrefix: 'pm2:reload'
})

function main() {
    // 先停再归档；进程已停时允许 rename，避免复制超大日志
    runPm2(['stop', appName], { optional: true })
    archiveOutLog(dateTimeStamp(), { allowRename: true })
    runPm2(['restart', appName])
    reloadLogsSafely()
    writeDayMark()
    console.log('[pm2:reload] 已重启并重新加载 pm2-out.log')
}

main()
