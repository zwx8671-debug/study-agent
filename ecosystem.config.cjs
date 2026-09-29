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
            name: 'coco-cloud-ts',
            // 当前工作目录
            cwd: __dirname,
            // 启动脚本路径
            script: 'dist/src/app.js',
            // Node.js 执行参数，启用 source map 支持以显示 TypeScript 源码堆栈
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
            time: false,
            // 环境变量配置
            env: {
                NODE_ENV: 'development',
                PORT: 8002,
                HOST: '0.0.0.0',
                LOG_LEVEL: 'info',
                PATH_PREFIX: '/coco-cloud-ts'
            },
            // 生产环境变量配置（从 .env.production 文件同步）
            env_production: {
                NODE_ENV: 'production',
                PORT: 8002,
                HOST: '0.0.0.0',
                LOG_LEVEL: 'warn',
                PATH_PREFIX: '/coco-cloud-ts',

                // Redis 配置
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASS: '',
                REDIS_DB: 11,

                // PostgreSQL 数据库连接设置
                DB_TYPE: 'postgres',
                DB_HOST: 'postgres60c3c5ab8727.rds-pg.ivolces.com',
                DB_USER: 'dev',
                DB_PASS: 'mbdfwrHQYk4ZZbZ2',
                DB_PORT: 5432,
                DB_NAME: 'yuewa',
                DB_SCHEMA: 'cocoadmin',

                // API 配置
                MEMORY_API_URL: 'http://localhost:8001',
                MGMT_API_URL: 'https://cloud.leapwatt.com/cloud-mgmt/openapi',
                COCOADMIN_API_URL: 'http://localhost:48080',
                COCOADMIN_API_KEY: 'sk-d7f3a9e2b1c84f6e5a0d3b7c9e1f2a4b',
                OTHER_API: 'http://localhost:9000',
                OTHER_API_KEY: 'sk-sfXEIp8N8e-U_Vf8YwHwlA',

                // 音视频服务配置
                TTS_SERVICE_TYPE: 'volcengine',
                STT_SERVICE_TYPE: 'volcengine'
            },
            // 进程文件路径
            pid_file: 'pids/pm2.pid',
            // 最小运行时间（毫秒），如果应用在这个时间内崩溃，PM2会认为启动失败
            min_uptime: '60s',
            // 定时重启，例如每天凌晨3点重启：'0 3 * * *'
            cron_restart: '',
            // 最大内存限制，超过则自动重启（MB）
            max_memory_restart: '2G'
        }
    ]
}
