/** @format */

/**
 * WebSocket客户端测试工具
 * 用于测试Agent WebSocket端点
 */

const { stdout } = require('process')
const WebSocket = require('ws')

class WSTestClient {
    constructor(baseUrl = 'ws://localhost:4000') {
        this.baseUrl = baseUrl
        this.connections = new Map()
    }

    /**
     * 连接到指定端点
     */
    async connect(endpoint = '') {
        const url = `${this.baseUrl}${endpoint}`
        console.log(`Connecting to: ${url}`)

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url)

            ws.on('open', () => {
                console.log(`✅ Connected to ${url}`)
                this.connections.set(endpoint, ws)

                ws.on('message', data => {
                    try {
                        const message = JSON.parse(data.toString())
                        stdout.write(message.data.content)
                    } catch (error) {
                        console.log(`📨 [${endpoint || 'root'}] Raw message:`, data.toString())
                    }
                })

                ws.on('close', () => {
                    console.log(`❌ Disconnected from ${url}`)
                    this.connections.delete(endpoint)
                })

                ws.on('error', error => {
                    console.error(`💥 WebSocket error on ${url}:`, error.message)
                })

                resolve(ws)
            })

            ws.on('error', error => {
                console.error(`💥 Connection failed to ${url}:`, error.message)
                reject(error)
            })
        })
    }

    /**
     * 发送消息到指定端点
     */
    send(endpoint, message) {
        const ws = this.connections.get(endpoint)
        if (ws && ws.readyState === WebSocket.OPEN) {
            const jsonMessage = typeof message === 'string' ? message : JSON.stringify(message)
            ws.send(jsonMessage)
            console.log(`📤 [${endpoint || 'root'}] Sent:`, jsonMessage)
        } else {
            console.error(`❌ No active connection to ${endpoint}`)
        }
    }

    /**
     * 关闭指定端点连接
     */
    close(endpoint) {
        const ws = this.connections.get(endpoint)
        if (ws) {
            ws.close()
            this.connections.delete(endpoint)
        }
    }

    /**
     * 关闭所有连接
     */
    closeAll() {
        this.connections.forEach((ws, endpoint) => {
            ws.close()
        })
        this.connections.clear()
    }
}

// 测试脚本
async function runTests() {
    const client = new WSTestClient()

    console.log('🚀 Starting WebSocket tests...\n')

    try {
        // 测试Agent聊天端点
        setTimeout(async () => {
            console.log('\n2️⃣ Testing Agent chat endpoint...')
            await client.connect('/agent/chat')

            // 发送文本消息
            client.send('/agent/chat', {
                id: `msg_${Date.now()}`,
                end: true,
                text: '你好'
            })
        }, 3000)
    } catch (error) {
        console.error('💥 Test failed:', error)
        client.closeAll()
        process.exit(1)
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runTests()
}

module.exports = WSTestClient
