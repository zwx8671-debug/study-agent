/** @format */

import { DefaultEventsMap, RemoteSocket, SocketData } from 'socket.io'
import { AuthType, CoCoNamespace, CODE, SocketResponse } from '@interface/ICommon'
import { serverInstance } from '@utils/ServerInstance'
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import { DecorateAcknowledgementsWithMultipleResponses } from 'socket.io/dist/typed-events'
import { CocoSocket } from '@utils/socket-decorators'
import { SocketEventResponseLabelValues, socketEventResponseTotal } from '../prometheus/metrics'

type CocoRemoteSocket = RemoteSocket<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, SocketData>

/**
 * emit 响应超时时间
 */
const SOCKET_TIME_OUT = 5000

interface ResponseParams<T> {
    socket: CocoSocket
    event: string
    msg: string
    room?: string
    data?: T | null
}
interface ResponseParamsTo<T> {
    event: string
    msg: string
    ns: CoCoNamespace
    authType: AuthType
    room: string
    data?: T | null
}
interface ResponseParamsToAll<T> {
    ns: string
    event: string
    msg: string
    room: string
    data?: T | null
}
interface ResponseParamsMultiEvent<T> {
    socket: CocoSocket
    events: string[]
    msg: string
    room?: string
    data?: T | null
}

const log = getLogger('SocketCommonResponse')
export class SocketCommonResponse {
    /**
     * 格式化数据字符串用于日志输出
     * @param data 数据对象
     * @private
     */
    private static formatDataString<T>(data: T | null): string {
        const temp = JSON.stringify(data)
        if (temp) {
            return `${temp.slice(0, 100)}... 一共 ${temp.length} 字符`
        }
        return ''
    }

    /**
     * 创建响应对象
     * @param code 响应码
     * @param msg 消息
     * @param data 数据
     * @private
     */
    private static createResponse<T>(code: CODE, msg: string, data: T | null = null): SocketResponse<T | null> {
        return { code, data: data ?? null, msg }
    }

    /**
     * 内部抽象方法：发送响应并记录日志
     * @param params 响应参数
     * @param code 响应码
     * @param logMethod 日志方法
     * @private
     */
    private static emitResponse<T = null>(
        { socket, event, msg, room, data = null }: ResponseParams<T>,
        code: CODE,
        logMethod: (message: string) => void
    ): SocketResponse<T | null> {
        const dataString = this.formatDataString(data)
        const response = this.createResponse<T>(code, msg, data)

        // 【埋点】记录服务器响应事件次数（出站）
        const namespace = socket.nsp.name
        const status = code === CODE.SUCCESS ? 'success' : 'error'
        const labels: SocketEventResponseLabelValues = { event, namespace, status }
        socketEventResponseTotal.inc(labels)

        if (room) {
            // 只对当前进程内广播
            socket.nsp.local.to(room).emit(event, response)
            logMethod(`msg: ${msg}, room: ${room}, data: ${dataString}`)
        } else {
            socket.emit(event, response)
            logMethod(`msg: ${msg}, data: ${dataString}`)
        }

        return response
    }

    /**
     * 发送成功响应
     * @param params 响应参数对象
     */
    static success<T = null>(params: ResponseParams<T>) {
        return this.emitResponse(params, CODE.SUCCESS, log.debugMsg.bind(log))
    }

    /**
     * 发送错误响应
     * @param params 响应参数对象
     */
    static error<T = null>(params: ResponseParams<T>) {
        return this.emitResponse(params, CODE.ERROR, log.warnMsg.bind(log))
    }
    /**
     * 发送成功响应
     * @param res
     */
    static successTo<T = null>(res: ResponseParamsTo<T>) {
        return SocketCommonResponse.emitTo(res, CODE.SUCCESS)
    }

    /**
     * 发送失败响应
     * @param res
     */
    static errorTo<T = null>(res: ResponseParamsTo<T>) {
        return SocketCommonResponse.emitTo(res, CODE.ERROR)
    }

    /**
     * IO发送响应
     * @param res
     * @param code
     */
    static emitTo<T = null>(res: ResponseParamsTo<T>, code: CODE) {
        const temp = JSON.stringify(res.data)
        const dataString = `${temp.slice(0, 100)}... 一共 ${temp.length} 字符`

        const response: SocketResponse<T | null> = { code, data: res.data ?? null, msg: res.msg }

        // 【埋点】记录服务器响应事件次数（出站）
        const namespace = env.PATH_PREFIX + res.ns
        const status = code === CODE.SUCCESS ? 'success' : 'error'
        const labels: SocketEventResponseLabelValues = { event: res.event, namespace, status }
        socketEventResponseTotal.inc(labels)

        serverInstance
            .getIO()
            .of(namespace)
            // 只对当前进程内emit
            .local.in(res.room)
            .fetchSockets()
            .then((sockets: CocoRemoteSocket[]) => {
                for (const socket of sockets) {
                    const authType = socket.data.authType
                    if (socket && authType === res.authType) {
                        socket.emit(res.event, response)
                    }
                }
                log.debugMsg(`event: ${res.event}, msg: ${res.msg}, room: ${res.room}, data: ${dataString}`)
            })

        return response
    }

    /**
     * IO发送成功响应，只广播当前节点内
     * @param params 响应参数对象
     */
    static successToAll<T = null>({ ns, event, msg, room, data = null }: ResponseParamsToAll<T>) {
        ns = env.PATH_PREFIX + `${ns}`
        const dataString = this.formatDataString(data)
        const response = this.createResponse<T>(CODE.SUCCESS, msg, data)

        // 【埋点】记录服务器响应事件次数（出站）
        const labels: SocketEventResponseLabelValues = { event, namespace: ns, status: 'success' }
        socketEventResponseTotal.inc(labels)

        // 匹配成功后响应设备
        try {
            // 通过 Socket.IO 只对当前进程 向设备发送匹配结果
            serverInstance.getIO().of(ns).local.to(room).emit(event, response)
            log.debugMsg(`agent: ${ns}, msg: ${msg}, room: ${room}, data: ${dataString}`)
            return true
        } catch (e) {
            log.warnMsg(`agent: ${ns}, msg: ${msg}, room: ${room}, data: ${e}`)
            return false
        }
    }

    /**
     * 内部抽象方法：发送多事件响应并记录日志
     * @param params 响应参数
     * @param code 响应码
     * @param logMethod 日志方法
     * @private
     */
    private static emitMultiEventResponse<T = null>(
        { socket, events, msg, room, data = null }: ResponseParamsMultiEvent<T>,
        code: CODE,
        logMethod: (message: string) => void
    ): SocketResponse<T | null> {
        const dataString = this.formatDataString(data)
        const response = this.createResponse<T>(code, msg, data)

        // 【埋点】记录服务器响应事件次数（出站）
        const namespace = socket.nsp.name
        const status = code === CODE.SUCCESS ? 'success' : 'error'

        for (const event of events) {
            // 为每个事件分别记录指标
            const labels: SocketEventResponseLabelValues = { event, namespace, status }
            socketEventResponseTotal.inc(labels)

            if (room) {
                socket.nsp.local // 只对当前进程广播
                    .to(room)
                    .emit(event, response)
                logMethod(`msg: ${msg}, room: ${room}, data: ${dataString}`)
            } else {
                socket.emit(event, response)
                logMethod(`msg: ${msg}, data: ${dataString}`)
            }
        }
        return response
    }

    /**
     * 发送成功响应
     * @param params 响应参数对象
     */
    static successMultiEvent<T = null>(params: ResponseParamsMultiEvent<T>) {
        return this.emitMultiEventResponse(params, CODE.SUCCESS, log.debugMsg.bind(log))
    }

    /**
     * 发送错误响应
     * @param params 响应参数对象
     */
    static errorMultiEvent<T = null>(params: ResponseParamsMultiEvent<T>) {
        return this.emitMultiEventResponse(params, CODE.ERROR, log.warnMsg.bind(log))
    }

    /**
     * 获取 socket
     * @param ns
     * @param room
     */
    static async getDeviceCocoSocket(ns: CoCoNamespace, room: string) {
        const sockets: CocoRemoteSocket[] = await serverInstance
            .getIO()
            .of(env.PATH_PREFIX + ns)
            // 只对当前进程
            .local.in(room)
            .fetchSockets()
        for (const socket of sockets) {
            if (socket && AuthType.client === socket.data.authType) {
                return socket
            }
        }
    }

    static async successEmitWithAck<T = null>(event: string, socket: CocoRemoteSocket, msg: string, data: T) {
        const response = this.createResponse<T>(CODE.SUCCESS, msg, data)
        const temp = JSON.stringify(data)
        if (temp) {
            const dataString = this.formatDataString(data)
            log.infoMsg(`msg: ${msg}, data:${dataString}`)
        }
        try {
            return await socket.timeout(SOCKET_TIME_OUT).emitWithAck(event, response)
        } catch (error) {
            log.errorMsg(`Error callback:`, { errorMsg: error as Error })
        }
    }
}
