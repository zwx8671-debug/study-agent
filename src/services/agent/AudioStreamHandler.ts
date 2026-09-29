/** @format */

import { PassThrough } from 'stream'
import { ResponseEvent } from '@interface/IAgent'
import { SocketCommonResponse } from '../../common/SocketCommonResponse'
import { getLogger, type Logger } from '@utils/Logger'
import $ from '@utils/util'
import { env } from '@config/env'
import fs from 'fs'
import { metricsLogger } from '@utils/MetricsLogger'
import { AudioResponse, AuthType, CoCoNamespace } from '@interface/ICommon'
import { CocoSocket } from '@utils/socket-decorators'

/**
 * Audio 流处理器
 * 负责处理音频输出流的监听和数据转发
 *
 * 设计说明：
 * - 使用多例模式，每次调用 handle 创建新的处理实例
 * - 优势：自动管理事件监听器生命周期，方法结束后自动销毁，避免内存泄漏
 * - 每个流处理是独立的，不会相互干扰
 */
export class AudioStreamHandler {
    private readonly log: Logger = getLogger(AudioStreamHandler.name)

    /**
     * 处理音频流事件
     * @param socketAudioStream 音频输出流
     * @param socket
     * @param deviceSN 设备序列号
     * @returns audioTokens 数组(用于调试)
     */
    handle(socketAudioStream: PassThrough, socket: CocoSocket, deviceSN: string) {
        const audioTokens: AudioResponse[] = []

        const onData = (chunk: Buffer) => {
            const audioResponse = $.json<AudioResponse>(chunk.toString())
            // 测试用，正式服不用
            if (env.DEBUG == 'true') {
                audioTokens.push(audioResponse)
            }

            SocketCommonResponse.successTo<AudioResponse>({
                authType: AuthType.client,
                ns: CoCoNamespace.Agent,
                room: deviceSN,
                event: ResponseEvent.CHAT_AUDIO,
                data: audioResponse,
                msg: 'Chat stream chunk'
            })
        }

        const onEnd = () => {
            // 测试用，正式服不用
            if (env.DEBUG == 'true') {
                fs.writeFileSync(`./audio.json`, new TextEncoder().encode(JSON.stringify(audioTokens, null, 2)))
            }

            // 【埋点】输出完整的 Chat 性能指标
            metricsLogger.logChatMetrics(true)

            // 清理事件监听器，防止内存泄漏
            this.cleanup(socketAudioStream, onData, onEnd, onError)
        }

        const onError = (e: Error) => {
            SocketCommonResponse.error({
                socket,
                room: deviceSN,
                event: ResponseEvent.CHAT_AUDIO,
                msg: e.message
            })

            // 【埋点】输出完整的 Chat 性能指标（错误）
            metricsLogger.logChatMetrics(false, e.message)

            // 清理事件监听器
            this.cleanup(socketAudioStream, onData, onEnd, onError)
        }

        socketAudioStream.on('data', onData)
        socketAudioStream.on('end', onEnd)
        socketAudioStream.on('error', onError)
    }

    /**
     * 清理事件监听器
     * @private
     */
    private cleanup(
        socketAudioStream: PassThrough,
        onData: (chunk: Buffer) => void,
        onEnd: () => void,
        onError: (e: Error) => void
    ) {
        socketAudioStream.removeListener('data', onData)
        socketAudioStream.removeListener('end', onEnd)
        socketAudioStream.removeListener('error', onError)
        this.log.infoMsg('Audio stream listeners cleaned up')
    }
}
