/** @format */

import { Controller, GET, POST } from 'fastify-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import type { FastifyRequest } from 'fastify'
import { ChatXmlRequest, ChatXmlResponse, FuncToken, ResponseEvent } from '@interface/IAgent'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { Shell } from '../libs/xml/Shell'
import { AudioResponse, AuthType, CoCoNamespace } from '@interface/ICommon'
import { TTSService } from '@service/TTSService'

@Controller('/agent')
export default class AgentController {
    private logger: Logger = getLogger(AgentController.name)

    /**
     * 一键执行XML,前端页面的调试接口和routine
     */
    @POST({ url: '/chat-xml' })
    async chatXml(req: FastifyRequest) {
        const data = req.body as ChatXmlRequest

        // 处理XML
        let interrupt = true
        if (data.type == 'routine') {
            interrupt = false
            const res = await Shell.syncLoopParse(data.text, false, '', '', '')
            if (res.errors.length > 0) {
                throw res.errors
            }
            return await this.sendWithAck(data.deviceSN, res.textFuncTokens, interrupt, ResponseEvent.CHAT_ONCE)
        } else if (data.type == 'debug') {
            const { textFuncTokens, audioFuncTokens } = await TTSService.parseByLoopWithAudio(
                data.text,
                false,
                '',
                '',
                ''
            )
            return await this.sendAudioWithAck(
                data.deviceSN,
                textFuncTokens,
                audioFuncTokens,
                interrupt,
                ResponseEvent.CHAT_ONCE
            )
        } else {
            throw new Error(`type[${data.type}] 不存在`)
        }
    }

    /**
     * 一键执行XML
     */
    @POST({ url: '/chat-xml-un-audio' })
    async chatXmlUnAudio(req: FastifyRequest) {
        const data = req.body as { text: string; deviceSN: string }
        return await Shell.syncLoopParse(data.text, false, '', '', '')
    }

    /**
     * 执行技能，根据名称执行
     */
    @GET({ url: '/run' })
    async run(req: FastifyRequest<{ Querystring: Record<string, string> }>) {
        const name = req.query.name
        const deviceSN = req.query.deviceSN
        const runXml = `<RUN name="${name}" />`
        // 处理XML
        const res = await Shell.syncLoopParse(runXml, true, '', '', '')
        if (res.errors.length > 0) {
            throw res.errors
        }
        return await this.sendWithAck(deviceSN, res.textFuncTokens, true, ResponseEvent.CHAT_ONCE)
    }

    /**
     * 查询设备，并且发送技能执行结果
     */
    private async sendAudioWithAck(
        deviceSN: string,
        textFuncTokens: FuncToken[],
        audioFuncTokens: AudioResponse,
        interrupt: boolean,
        event: ResponseEvent
    ) {
        // socket io响应
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.Agent, deviceSN)
        if (deviceSocket) {
            const robotResponses = await SocketCommonResponse.successEmitWithAck<ChatXmlResponse>(
                event,
                deviceSocket,
                '',
                { funcTokens: textFuncTokens, interrupt }
            )

            // chat:audio 发送音频
            if (audioFuncTokens) {
                SocketCommonResponse.successTo<AudioResponse>({
                    authType: AuthType.client,
                    data: audioFuncTokens,
                    ns: CoCoNamespace.Agent,
                    room: deviceSN,
                    event: ResponseEvent.CHAT_AUDIO,
                    msg: ''
                })
            }

            // http响应
            return {
                funcTokens: textFuncTokens,
                audioFuncTokens,
                robotResponses
            }
        } else {
            throw new Error('device not online')
        }
    }

    /**
     * 查询设备，并且发送技能执行结果
     */
    private async sendWithAck(deviceSN: string, funcTokens: FuncToken[], interrupt: boolean, event: ResponseEvent) {
        // socket io响应
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.Agent, deviceSN)
        if (deviceSocket) {
            const robotResponses = await SocketCommonResponse.successEmitWithAck<ChatXmlResponse>(
                event,
                deviceSocket,
                '',
                { funcTokens, interrupt }
            )

            // http响应
            return {
                funcTokens,
                robotResponses
            }
        } else {
            throw new Error('device not online')
        }
    }
}
