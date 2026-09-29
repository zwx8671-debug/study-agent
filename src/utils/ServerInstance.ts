/** @format */

import type { Server } from 'socket.io'

/**
 * 全局 Fastify 服务器实例访问器
 * 用于在服务层中访问 server 实例，特别是 Socket.IO
 */
class ServerInstance {
    private _server: any = null

    /**
     * 设置全局 server 实例
     * @param server Fastify 实例
     */
    setServer(server: any): void {
        this._server = server
    }

    /**
     * 获取全局 server 实例
     * @returns Fastify 实例，如果未设置则为 null
     */
    getServer(): any {
        return this._server
    }

    /**
     * 获取 Socket.IO 实例
     * @returns Socket.IO Server 实例，如果未设置则为 null
     */
    getIO(): Server {
        return this._server?.io || null
    }
}

// 导出单例实例
export const serverInstance = new ServerInstance()
