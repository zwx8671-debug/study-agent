/** @format */

export const corsConfig = {
    origin: true, // 允许任何来源
    credentials: true, // 允许携带凭证
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // 添加PATCH方法
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-API-Key', 'X-Client-Version'],
    exposedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Total-Count' // 如果需要在响应中暴露自定义头部
    ],
    maxAge: 86400 // 24小时
}
