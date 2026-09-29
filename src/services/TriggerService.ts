/** @format */

import { Service } from 'fastify-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import { FuncToken } from '@interface/IAgent'
import { TriggerResponseEvent, TriggerXmlResponse } from '@interface/IAgentTrigger'
import { SocketCommonResponse } from '../common/SocketCommonResponse'
import { AudioResponse, AuthType, CoCoNamespace } from '@interface/ICommon'
import { traceContext } from '@utils/TraceContext'

@Service()
export class TriggerService {
    private log: Logger = getLogger(TriggerService.name)

    /**
     * 查询设备，并且发送技能执行结果
     */
    public async sendAudioWithAck(
        deviceSN: string,
        textFuncTokens: FuncToken[],
        audioFuncTokens: AudioResponse,
        interrupt: boolean,
        event: TriggerResponseEvent
    ) {
        // socket io响应
        const deviceSocket = await SocketCommonResponse.getDeviceCocoSocket(CoCoNamespace.AgentTrigger, deviceSN)
        if (deviceSocket) {
            const robotResponses = await SocketCommonResponse.successEmitWithAck<TriggerXmlResponse>(
                event,
                deviceSocket,
                '',
                { id: traceContext.getTraceId(), funcTokens: textFuncTokens, interrupt }
            )

            // chat:audio 发送音频
            if (audioFuncTokens && audioFuncTokens.audio) {
                SocketCommonResponse.successTo<AudioResponse>({
                    authType: AuthType.client,
                    data: audioFuncTokens,
                    ns: CoCoNamespace.AgentTrigger,
                    room: deviceSN,
                    event: TriggerResponseEvent.TRIGGER_AUDIO,
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
}
