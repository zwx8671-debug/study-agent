/**
 * 按日切分 pm2-out.log，不重启业务进程。
 * 只归档本项目日志；reloadLogs 经 ~/.pm2 互斥锁串行，避免打崩共享 daemon。
 *
 * @format
 */

const path = require('path')
const { createPm2LogTools } = require('./pm2-log-utils.cjs')

const ROOT = path.join(__dirname, '..')
createPm2LogTools({
    root: ROOT,
    appName: 'coco-tts',
    logPrefix: 'pm2:rotate'
}).rotateIfNewDay()
