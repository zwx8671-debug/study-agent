/** @format */

// 测试生产环境 Socket.IO 连接
const { io } = require('socket.io-client')

console.log('🔍 测试本地环境 Socket.IO 连接...')

const connConfig = {
    path: '/coco-cloud-ts/socket.io',
    transports: ['polling', 'websocket'],
    timeout: 5000,
    forceNew: true
}

// 测试基础 Socket.IO 连接 - 使用正确的 Socket.IO 端点路径
console.log('尝试socket.io配置:', connConfig)

const socket = io('http://localhost:4000/coco-cloud-ts/agent', connConfig)

socket.on('connect', () => {
    console.log('✅ 本地环境 Socket.IO 连接成功!')
    console.log('Socket ID:', socket.id)

    // 测试 agent 命名空间
    const agentSocket = io('http://192.168.10.234/coco-cloud-ts/agent', connConfig)

    agentSocket.on('connect', () => {
        console.log('✅ Agent 命名空间连接成功!')
        console.log('Agent Socket ID:', agentSocket.id)
        process.exit(0)
    })

    agentSocket.on('connect_error', error => {
        console.log('❌ Agent 命名空间连接失败:', error.message)
        process.exit(1)
    })
})

socket.on('connect_error', error => {
    console.log('❌ Socket.IO 连接失败:', error.message)
    console.log('   错误详情:', error.description || 'N/A')
    process.exit(1)
})

// 15秒超时
setTimeout(() => {
    console.log('❌ 所有连接尝试超时')
    process.exit(1)
}, 15000)
