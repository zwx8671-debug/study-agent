/**
 * PM2 ecosystem config for production
 *
 * @format
 */

/**
 * PM2配置对象，用于定义应用程序的部署和运行参数
 * 包含应用名称、执行路径、运行模式等配置信息
 */
module.exports = {
    apps: [
        {
            // 应用程序名称
            name: 'coco-stt',
            // 当前工作目录
            cwd: __dirname,
            // 启动脚本路径
            script: 'dist/src/app.js',
            // Node.js 执行参数，启用 source map 支持以显示 TypeScript 源码堆栈
            // 启用 expose-gc 参数，监听gc
            node_args: '--enable-source-maps',
            // 执行模式，fork模式表示每个实例作为一个独立进程运行
            exec_mode: 'fork',
            // 实例数量，1表示只运行一个实例
            instances: 1,
            // 是否监听文件变化自动重启，false表示不监听
            watch: false,
            // 是否自动重启，true表示在应用崩溃时自动重启
            autorestart: true,
            // 最大重启次数，0表示无限制
            max_restarts: 0,
            // 重启延迟时间，单位毫秒
            restart_delay: 3000,
            // 指数退避重启延迟，单位毫秒
            exp_backoff_restart_delay: 100,
            // 标准输出日志文件路径
            out_file: 'logs/pm2-out.log',
            // 错误日志文件路径
            error_file: 'logs/pm2-error.log',
            // 是否合并日志
            merge_logs: true,
            // 是否在日志中添加时间戳
            time: false
        },
        {
            name: 'coco-stt-log-rotate',
            cwd: __dirname,
            script: 'scripts/pm2-rotate-daily.cjs',
            exec_mode: 'fork',
            instances: 1,
            watch: false,
            autorestart: false,
            // 与 coco-cloud-ts(00:00) / coco-tts(00:10) 错开
            cron_restart: '5 0 * * *',
            out_file: 'logs/pm2-rotate-out.log',
            error_file: 'logs/pm2-rotate-error.log',
            merge_logs: true,
            time: false
        }
    ]
}
