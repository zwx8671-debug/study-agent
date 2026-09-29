/** @format */
import { Socket } from 'socket.io'

export default {
    json<T>(text: string) {
        return JSON.parse(text) as T
    },
    stringify<T>(data: T) {
        return JSON.stringify(data)
    },
    toString(data: unknown) {
        if (typeof data === 'string') return data
        if (data instanceof Error) {
            return data.stack || data.message || data.toString()
        }
        try {
            return JSON.stringify(data)
        } catch {
            return String(data)
        }
    },
    trim(str: string | string[]) {
        let data = ''
        if (Array.isArray(str)) {
            for (const s of str) {
                data += s.trim()
            }
        } else {
            data += str.trim()
        }
        return data
    },
    sleep(time: number = 1000) {
        return new Promise<void>(resolve =>
            setTimeout(() => {
                resolve()
            }, time)
        )
    },
    /**
     * 获取客户端IP地址
     * @param socket Socket连接对象
     * @returns 客户端IP地址
     */
    getClientIP(socket: Socket): string {
        // 尝试从握手信息中获取IP
        const handshake = socket.handshake
        if (handshake && handshake.address) {
            return handshake.address
        }

        // 尝试从请求头中获取
        const headers = handshake.headers
        if (headers) {
            // 检查常见的IP头
            const xForwardedFor = headers['X-Forwarded-For']

            if (xForwardedFor) {
                // x-forwarded-for 可能包含多个IP
                return Array.isArray(xForwardedFor) ? xForwardedFor.toString() : xForwardedFor
            }

            const xRealIP = headers['X-Real-IP']
            if (xRealIP) {
                return Array.isArray(xRealIP) ? xRealIP.toString() : xRealIP
            }
        }

        // 默认返回未知
        return 'unknown'
    }
}
