/** @format */

import { PassThrough } from 'stream'
import { CocoSocket } from '@utils/socket-decorators'
import { ChatAssistantResponse, ChatRequest, FuncToken, ResponseEvent, ResponseFlag } from '@interface/IAgent'
import { SocketCommonResponse } from '../../common/SocketCommonResponse'
import { getLogger, type Logger } from '@utils/Logger'
import $ from '@utils/util'
import { env } from '@config/env'
import fs from 'fs'
import { CoCoNamespace } from '@interface/ICommon'

/**
 * LLM 流处理器
 * 负责处理 LLM 输出流的监听和数据转发
 *
 * 设计说明：
 * - 使用多例模式，每次调用 handle 创建新的处理实例
 * - 优势：自动管理事件监听器生命周期，方法结束后自动销毁，避免内存泄漏
 * - 每个流处理是独立的，不会相互干扰
 */
export class LLMStreamHandler {
    private readonly log: Logger = getLogger(LLMStreamHandler.name)

    /**
     * 处理 LLM 流事件
     * @param socketLlmStream LLM 输出流
     * @param socket Socket 连接
     * @param req 聊天请求
     * @param deviceSN 设备序列号
     * @param responseData 响应数据
     * @returns tokens 数组(用于调试)
     */
    handle(
        socketLlmStream: PassThrough,
        socket: CocoSocket,
        req: ChatRequest,
        deviceSN: string,
        responseData: ChatAssistantResponse
    ): FuncToken[] {
        const tokens: FuncToken[] = []

        const onData = (chunk: Buffer) => {
            try {
                const func = $.json<FuncToken>(chunk.toString())

                // 测试用，正式服不用
                if (env.DEBUG == 'true') {
                    tokens.push(func)
                }
                // 非音频 给APP+设备都下发
                SocketCommonResponse.successToAll<ChatAssistantResponse>({
                    ns: CoCoNamespace.Agent,
                    room: deviceSN,
                    event: ResponseEvent.CHAT,
                    data: {
                        ...responseData,
                        idx: func.idx,
                        image: func.image,
                        name: func.name,
                        pattern: func.pattern,
                        params: func.params,
                        text: func.text,
                        audioId: func?.audioId,
                        token: func.token,
                        timestamp: Date.now(),
                        flag: ResponseFlag.CHUNK
                    },
                    msg: 'Chat stream chunk'
                })
            } catch (e) {
                const error = (e as Error).message || 'Stream data parsing error'
                SocketCommonResponse.success({
                    socket,
                    room: deviceSN,
                    event: ResponseEvent.CHAT,
                    data: { ...responseData, content: error, timestamp: Date.now(), flag: ResponseFlag.END },
                    msg: error
                })

                this.log.errorMsg('Error parsing stream data chunk:', { errorMsg: e })
            }
        }

        const onEnd = () => {
            // 测试用，正式服不用
            if (env.DEBUG == 'true') {
                fs.writeFileSync(`./llm.json`, new TextEncoder().encode(JSON.stringify(tokens, null, 2)))
            }
            // end 事件时，发送结束标记
            SocketCommonResponse.success<ChatAssistantResponse>({
                socket,
                room: deviceSN,
                event: ResponseEvent.CHAT,
                data: { ...responseData, timestamp: Date.now(), flag: ResponseFlag.END, model: req.model },
                msg: 'Chat stream ended'
            })

            // 清理事件监听器，防止内存泄漏
            this.cleanup(socketLlmStream, onData, onEnd, onError)
        }

        const onError = (e: Error) => {
            SocketCommonResponse.error({
                socket,
                room: deviceSN,
                event: ResponseEvent.CHAT,
                msg: e.message
            })

            // 清理事件监听器
            this.cleanup(socketLlmStream, onData, onEnd, onError)
        }

        socketLlmStream.on('data', onData)
        socketLlmStream.once('end', onEnd)
        socketLlmStream.once('error', onError)

        return tokens
    }

    /**
     * 清理事件监听器
     * @private
     */
    private cleanup(
        socketLlmStream: PassThrough,
        onData: (chunk: Buffer) => void,
        onEnd: () => void,
        onError: (e: Error) => void
    ) {
        socketLlmStream.removeListener('data', onData)
        socketLlmStream.removeListener('end', onEnd)
        socketLlmStream.removeListener('error', onError)
        this.log.infoMsg('LLM stream listeners cleaned up')
    }
}
