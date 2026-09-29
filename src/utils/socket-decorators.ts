/** @format */

import { DefaultEventsMap, Server, Socket, SocketData } from 'socket.io'
import { getLogger } from '@utils/Logger'
import { CODE, GlobalResponse, SocketResponse } from '@interface/ICommon'
import { NotifyEvent, RequestEvent, ResponseEvent, SyncEvent } from '@interface/IAgent'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { traceContext } from '@utils/TraceContext'
import { v7 as uuidv7 } from 'uuid'
import { TriggerRequestEvent } from '@interface/IAgentTrigger'
import { socketEventRequestTotal, SocketEventRequestLabelValues } from '../prometheus/metrics'

// 元数据键
const SOCKET_EVENTS_METADATA_KEY = Symbol('socket:events')
const SOCKET_NAMESPACE_METADATA_KEY = Symbol('socket:namespace')
const SOCKET_CONNECTION_MIDDLEWARE_METADATA_KEY = Symbol('socket:connection-middleware')
const logger = getLogger()
export type CocoSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>

// 事件处理器信息接口
export interface SocketEventHandler {
    eventName: string
    methodName: string | symbol
    middleware?: SocketMiddleware[]
}

// Socket 中间件类型
export type SocketMiddleware = (socket: CocoSocket, data: any, next: (error?: Error) => void) => void

// 连接阶段中间件类型（用于握手阶段，调用 next(err) 可直接拒绝连接）
export type ConnectionMiddleware = (socket: CocoSocket, next: (error?: Error) => void) => void

// Socket 事件装饰器
export function SocketEvent(eventName: string, middleware?: SocketMiddleware[]) {
    return function (target: any, propertyKey: string | symbol) {
        // 获取已存在的事件处理器
        const existingHandlers: SocketEventHandler[] =
            Reflect.getMetadata(SOCKET_EVENTS_METADATA_KEY, target.constructor) || []

        // 添加新的事件处理器
        existingHandlers.push({
            eventName,
            methodName: propertyKey,
            middleware
        })

        // 设置元数据
        Reflect.defineMetadata(SOCKET_EVENTS_METADATA_KEY, existingHandlers, target.constructor)
    }
}

// Socket 命名空间装饰器
export function SocketNamespace(namespace: string = '/', middleware?: Array<ConnectionMiddleware | SocketMiddleware>) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    return function (constructor: Function) {
        Reflect.defineMetadata(SOCKET_NAMESPACE_METADATA_KEY, namespace, constructor)

        if (middleware && middleware.length > 0) {
            const existing: Array<ConnectionMiddleware | SocketMiddleware> =
                Reflect.getMetadata(SOCKET_CONNECTION_MIDDLEWARE_METADATA_KEY, constructor) || []
            Reflect.defineMetadata(SOCKET_CONNECTION_MIDDLEWARE_METADATA_KEY, [...existing, ...middleware], constructor)
        }
    }
}

// Socket 连接装饰器
export function OnConnect() {
    return SocketEvent('connection')
}

// Socket 断开连接装饰器
export function OnDisconnect() {
    return SocketEvent('disconnect')
}

// 获取控制器的事件处理器
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function getSocketEventHandlers(constructor: Function): SocketEventHandler[] {
    return Reflect.getMetadata(SOCKET_EVENTS_METADATA_KEY, constructor) || []
}

// 获取控制器的命名空间
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function getSocketNamespace(constructor: Function): string {
    return Reflect.getMetadata(SOCKET_NAMESPACE_METADATA_KEY, constructor) || '/'
}

// 获取连接阶段中间件
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function getConnectionMiddleware(constructor: Function): Array<ConnectionMiddleware | SocketMiddleware> {
    return Reflect.getMetadata(SOCKET_CONNECTION_MIDDLEWARE_METADATA_KEY, constructor) || []
}

// Socket 控制器引导程序
export class SocketControllerBootstrap {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    static registerController(io: Server, controllerClass: Function, pathPrefix?: string) {
        let namespace = getSocketNamespace(controllerClass)
        // 如果提供了路径前缀，则添加到命名空间前面
        if (pathPrefix) {
            namespace = pathPrefix + namespace
        }

        const eventHandlers = getSocketEventHandlers(controllerClass)
        const connectionMiddleware = getConnectionMiddleware(controllerClass)

        logger.info(`🔌 注册 Socket.IO controller for namespace: ${namespace}`)

        // 创建命名空间
        const nsp = io.of(namespace)

        // 注册连接阶段中间件（握手时执行）。
        // 兼容两种签名：
        // - ConnectionMiddleware: (socket, next)
        // - SocketMiddleware: (socket, data, next) —— 自动传入 socket.handshake.auth 或 query
        const toConnMw = (mw: ConnectionMiddleware | SocketMiddleware): ConnectionMiddleware => {
            // 根据函数参数个数进行适配（>=3 认为是 SocketMiddleware）
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            if ((mw as Function).length >= 3) {
                const eventMw = mw as SocketMiddleware
                return (socket: CocoSocket, next: (error?: Error) => void) => {
                    const data = (socket.handshake && (socket.handshake as any).auth) || socket.handshake.query || {}
                    try {
                        eventMw(socket, data, next)
                    } catch (err) {
                        next(err as Error)
                    }
                }
            }
            return mw as ConnectionMiddleware
        }

        connectionMiddleware.forEach(mw => nsp.use(toConnMw(mw)))

        nsp.on('connection', (socket: CocoSocket) => {
            logger.info(`📡 Client connected to ${namespace}:`, socket.id)

            // 创建控制器实例
            const controllerInstance = new (controllerClass as any)()

            // 注册所有事件处理器
            eventHandlers.forEach(handler => {
                if (handler.eventName === 'connection') {
                    // 立即调用连接处理器
                    this.executeHandler(controllerInstance, handler, socket, null, undefined)
                } else {
                    // 注册其他事件处理器
                    socket.on(handler.eventName, (data, callback) => {
                        if (callback === undefined && typeof data === 'function') {
                            callback = data
                            data = null
                        }
                        this.executeHandler(controllerInstance, handler, socket, data, callback)
                    })
                }
            })
        })

        return nsp
    }

    /**
     * 执行Socket事件处理器
     * @param controller 控制器实例
     * @param handler Socket事件处理器配置
     * @param socket Socket连接对象
     * @param data 接收到的数据
     * @param callback 当使用emitWithAck时候有回调
     */
    private static executeHandler(
        controller: any,
        handler: SocketEventHandler,
        socket: CocoSocket,
        data: any,
        callback: ((args: any) => void) | undefined
    ) {
        // 从请求数据或 socket.data 中提取 traceId 和 deviceSN
        const requestTraceId = data?.traceId
        const deviceSN = data?.device || socket.data?.device?.deviceSN
        // 创建追踪上下文并在其中执行处理器
        traceContext.run(
            {
                traceId: requestTraceId || uuidv7(),
                deviceSN,
                event: handler.eventName,
                socketId: socket.id
            },
            () => {
                try {
                    // 【埋点】记录客户端请求事件次数（入站）
                    const namespace = socket.nsp.name
                    const authType = socket.data.authType || 'unknown'
                    const labels: SocketEventRequestLabelValues = {
                        event: handler.eventName,
                        namespace: namespace,
                        source: authType
                    }
                    socketEventRequestTotal.inc(labels)

                    // 需要检查房间的事件
                    const needCheckRoom: string[] = [
                        RequestEvent.CHAT,
                        RequestEvent.DONE,
                        NotifyEvent.APP_INTERRUPT,
                        NotifyEvent.DEVICE_STATE,
                        SyncEvent.RUNNER_SYNC,
                        TriggerRequestEvent.TRIGGER_SYNC,
                        SyncEvent.DEVICE_FACE
                    ]

                    if (needCheckRoom.includes(handler.eventName)) {
                        const deviceSN = socket.data.device?.deviceSN
                        if (!deviceSN || !socket.rooms.has(deviceSN)) {
                            SocketCommonResponse.error({
                                socket,
                                event: ResponseEvent.JOIN,
                                data: socket.data,
                                msg: `链接[${socket.id}]不在房间[${deviceSN}]，来源事件[${handler.eventName}]`
                            })
                            return
                        }
                    }

                    // 执行中间件（如果有）
                    if (handler.middleware && handler.middleware.length > 0) {
                        this.executeMiddleware(handler.middleware, socket, data, error => {
                            if (error) {
                                logger.errorMsg(`Error in socket event handler ${String(handler.eventName)}:`, {
                                    errorMsg: error
                                })
                                const errorResponse: SocketResponse<null> = {
                                    code: CODE.ERROR,
                                    data: null,
                                    msg: handler.eventName + ' - ' + error.message
                                }

                                socket.emit(GlobalResponse.ERROR, errorResponse)
                                return
                            }

                            // 执行处理器方法
                            logger.debug(`Socket[${socket.id}] event handler [${String(handler.methodName)}] executed`)
                            controller[handler.methodName](socket, data, callback).catch((error: unknown) => {
                                this.errorHandler(handler, error, socket, callback)
                            })
                        })
                    } else {
                        // 直接执行处理器方法
                        logger.debug(`Socket[${socket.id}] event handler [${String(handler.methodName)}] executed`)
                        controller[handler.methodName](socket, data, callback).catch((error: unknown) => {
                            this.errorHandler(handler, error, socket, callback)
                        })
                    }
                } catch (error) {
                    this.errorHandler(handler, error as Error, socket, callback)
                }
            }
        )
    }

    private static errorHandler(
        handler: SocketEventHandler,
        error: unknown,
        socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>,
        callback: ((args: any) => void) | undefined
    ) {
        logger.errorMsg(`Error in socket event handler ${String(handler.eventName)}:`, { errorMsg: error })

        const errorResponse: SocketResponse<null> = {
            code: CODE.ERROR,
            data: null,
            msg: 'Internal server error'
        }

        if (error instanceof Error) {
            errorResponse.msg = error.message
        }

        errorResponse.msg = handler.eventName + ' - ' + errorResponse.msg

        socket.emit(GlobalResponse.ERROR, errorResponse)

        if (callback) callback(errorResponse)
    }

    private static executeMiddleware(
        middleware: SocketMiddleware[],
        socket: CocoSocket,
        data: any,
        callback: (error?: Error) => void
    ) {
        let index = 0

        function next(error?: Error) {
            if (error) {
                callback(error)
                return
            }

            if (index >= middleware.length) {
                callback()
                return
            }

            const mw = middleware[index++]
            mw(socket, data, next)
        }

        next()
    }
}
