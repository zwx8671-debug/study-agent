/** @format */

/**
 * Socket.IO 客户端测试工具
 * 用于测试 Agent Socket.IO 端点
 */

const { stdout } = require('process')
const { io } = require('socket.io-client')

const priKey =
    '-----BEGIN PRIVATE KEY-----\n' +
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCjH4NVRllIeOcB\n' +
    '/0GY4z+dBLIt8YrCEOEWcxg/06mC4SBp+gp4u1LhH/6G2gwqTmONmfg1uqXu+5lB\n' +
    'XRITJ0ADVnKcJ99fhDwUoHZ5yrMpwfduEruvqkoc5u9C2TbqqX7N8NqMzxUHUPAh\n' +
    'IvqgmfehoagK2Tw5jnBQ63s6Y1HTaFoLMqubH32IhTOm3MQ7STD4dp5luP/hvL7K\n' +
    'iNN7vb87t3F9NvJI3pxXxCrdYubQf/5zlBbt3NnknLeTO00VCCY7ci0hGerlCoPU\n' +
    'D4XF6SHfR+1xLvwKQiO64U60+5m/mrMWeNgZLUzuPIsLmQb1qNIRxgO5fdClJ5Cj\n' +
    'kYBhEV1lAgMBAAECggEACB/ycm2j1k6BURHl8kfFXByHBG9Otj5Re8UFTO6Nt6Ff\n' +
    'dC/aVCueY+ysSIq1RukrH7sux/xRNf9NoZoRY6dVkqT8Zec9grwrIurgI85TEK4i\n' +
    '1RZ1Rzlf4iMlgSqhB9yj3n2T4SYSWdAv+bKMkbHBigkrfcjWrVY5JWqpM14Njg5E\n' +
    '2ECXPcP5khBsyMlXMb15PSQ8o6AaXkvatjInduZCvvYpjjnflIAkVLnOeXdcAqgY\n' +
    'dNwo4Jysct7Vcc0DeduP/3pWtkh8mj7xTrgLgNfQO+qP79jggsbY5kb0I7aySrfa\n' +
    'w9GuLov0QXyClw7XHkGiD4D1ggUQ/upuhmHip4aT4QKBgQDfLy/ksqS3+skiWC8S\n' +
    'Hl/2g/jWmTU+qFheSjVeSGkFArHyl/yYJunb2d6ZGIlIKz6xxwVAIPRAgch/dF9f\n' +
    'l5KIG0LAoQ9UhdGrcbZKyzfTocFEX05wMdRrV5mZbjk6+jePu+kNM2hXV4Z6/juz\n' +
    'SvxW6t9WfVs/pZSogPquRCJD4QKBgQC7G5RkzyuiPVRSnnxyNaQeHWbgurZ1D7sT\n' +
    'WKxDEBmubAFRdOil5sRHVcB1YI6bkOo9DSEzjmtPVFZca8IpsQ9w1PfxTdBdkuGX\n' +
    'xMOs5qFNAbkZdeJSbQ5ISeG99+9dxx7oy6zKT6cOOAzuskxulCBZaxckhYQHPt5q\n' +
    'WvvofadKBQKBgQC8oCftNOKsL8OgSEF4Ib3fHgjIbnImw6b0Aen7Bl3kAzQcIUI1\n' +
    '4eWSjx9n6unT2eDB5b/VRETK5CVtOxCEPRl1+PxAy56mQ/dB2/hCXGCRd8tdGuOz\n' +
    'RRoPotjJaPPrmaAt1ZYRNxp/fxTEjGwuizibySP6+DWPpETw6Rl1AVaoYQKBgD0Q\n' +
    'ByHPKqJL+ZTs/BgZwXHCjqyQwrL5a0gpDC7mtjriLJv012gtI6lUJvcnh+LlLEy4\n' +
    'WDmHJSZCk9ydnkQU8MEV/8TUbEfdg5oQMPvgWIvVIB9bBX148cxNsEpa+9dTAJdg\n' +
    'wQdVb2OIj0/nCGKeHOCRvn/AwxHKRrPW9ZcuSsYxAoGAUt+j7uugh23nVkNNShzC\n' +
    '0YPgClKDe3lVxz1dwn9xby9+3IyPlcsY5YPEH84OdP5e+MPJlkrlriZu6BByvI9H\n' +
    'faIVjZ1uVfcmQQcxVKuc/2lwfDpJCaBZxvWBLiIMdBlV7npfP45cw6YEed80mEVM\n' +
    'qAnugN7l03vPXqEBjH7zQUg=\n' +
    '-----END PRIVATE KEY-----'

var token = ''

function decryptToken(encryptedToken, privateKey) {
    try {
        // 将base64格式的加密数据转换为Buffer
        const encryptedBuffer = Buffer.from(encryptedToken, 'base64')

        // 使用私钥解密
        const decryptedBuffer = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_PADDING // 使用与加密时相同的填充方式
            },
            encryptedBuffer
        )

        // 将解密后的Buffer转换为字符串
        return decryptedBuffer.toString('utf8')
    } catch (error) {
        throw new Error(`Token decryption failed: ${error instanceof Error ? error.message : String(error)}`)
    }
}

class SocketIOTestClient {
    constructor(baseUrl = 'http://localhost:4000') {
        this.baseUrl = baseUrl
        this.connections = new Map()
    }

    /**
     * 连接到指定命名空间
     * @param {string} namespace - 命名空间 (如 '/agent')
     * @param deviceSN
     * @param serverID - 可选的 server-id，用于指定路由到特定服务器
     */
    async connect(namespace = '', deviceSN = '001', serverID = '') {
        // ✅ 推荐：使用 Query 参数传递 device-sn 和 server-id
        // 这样 Nginx 可以读取并进行一致性哈希路由
        let url = `${this.baseUrl}${namespace}?device-sn=${deviceSN}`
        if (serverID) {
            url += `&server-id=${serverID}`
        }
        console.log(`Connecting to: ${url}`)

        return new Promise((resolve, reject) => {
            const socket = io(url, {
                reconnection: true,
                transports: ['websocket']
                // ⚠️ 不再使用 extraHeaders，改用 URL query 参数
                // 这样浏览器和 Node.js 客户端都能正常工作
            })

            socket.on('connect', () => {
                console.log(`✅ Connected to ${url}, socket.id=${socket.id}`)
                this.connections.set(namespace, socket)
                socket.on('connect:response', res => {
                    console.log(`📨 [${namespace || 'root'}] ---- connected:`, res)
                    const key = res.data.token
                    console.log('key:', key)
                    token = decryptToken(key, priKey)
                })
                socket.on('chat:response', res => {
                    if (res.code === 200) stdout.write(res.data?.content || '')
                })
                socket.on('join:response', res => {
                    console.log(`📨 [${namespace || 'root'}] join:`, res)
                })

                socket.on('disconnect', reason => {
                    console.log(`❌ Disconnected from ${url}, reason=${reason}`)
                    this.connections.delete(namespace)
                })

                socket.on('connect_error', error => {
                    console.error(`💥 Socket.IO connect_error on ${url}:`, error.message)
                })

                socket.on('error:global', error => {
                    console.error(`💥 Socket.IO error:global on ${url}:`, error.message)
                })
                socket.on('device:offline', error => {
                    console.error(`💥 Socket.IO device:offline on ${url}:`, error.message)
                })

                resolve(socket)
            })

            socket.on('connect_error', error => {
                console.error(`💥 Connection failed to ${url}:`, error.message)
                reject(error)
            })
        })
    }

    /**
     * 向命名空间发送消息
     */
    send(namespace, event, message) {
        const socket = this.connections.get(namespace)
        if (socket && socket.connected) {
            socket.emit(event, message)
            console.log(`📤 [${namespace || 'root'}] Emit ${event}:`, message)
        } else {
            console.error(`❌ No active connection to ${namespace}`)
        }
    }

    /**
     * 关闭指定命名空间连接
     */
    close(namespace) {
        const socket = this.connections.get(namespace)
        if (socket) {
            socket.disconnect()
            this.connections.delete(namespace)
        }
    }

    /**
     * 关闭所有连接
     */
    closeAll() {
        this.connections.forEach((socket, namespace) => {
            socket.disconnect()
        })
        this.connections.clear()
    }
}

// 测试脚本
async function runTests() {
    const client = new SocketIOTestClient()

    console.log('🚀 Starting Socket.IO tests...\n')

    try {
        // 测试 Agent 命名空间
        console.log('\n2️⃣ Testing Agent chat namespace...')
        await client.connect('/agent')

        // 加入 chat 房间
        client.send('/agent', 'join', {
            device: 'test-device'
        })

        // 发送聊天消息
        setTimeout(() => {
            client.send('/agent', 'chat', {
                id: `msg_${Date.now()}`,
                device: 'test-device',
                text: '给我编一首诗歌，赞美佛罗里达州',
                end: true
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
import crypto from 'crypto'

module.exports = SocketIOTestClient
