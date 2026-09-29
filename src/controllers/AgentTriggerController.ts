/** @format */

import { Controller, Inject, POST } from 'fastify-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import type { FastifyRequest } from 'fastify'
import { TriggerResponseEvent, TriggerXmlRequest } from '@interface/IAgentTrigger'
import { TriggerService } from '@service/TriggerService'
import { TTSService } from '@service/TTSService'

@Controller('/agent-trigger')
export default class AgentTriggerController {
    private logger: Logger = getLogger(AgentTriggerController.name)

    @Inject(TriggerService)
    private triggerService!: TriggerService

    /**
     * 一键执行XML,前端页面的调试接口和routine
     */
    @POST({ url: '/chat-xml' })
    async chatXml(req: FastifyRequest) {
        const data = req.body as TriggerXmlRequest

        const { textFuncTokens, audioFuncTokens } = await TTSService.parseByLoopWithAudio(data.text, false, '', '', '')
        return await this.triggerService.sendAudioWithAck(
            data.deviceSN,
            textFuncTokens,
            audioFuncTokens,
            true,
            TriggerResponseEvent.CHAT_ONCE
        )
    }
}
