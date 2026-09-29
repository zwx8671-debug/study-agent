/** @format */

import { Controller, GET, Inject } from 'fastify-decorators'
import type { FastifyRequest } from 'fastify'
import { promptManager, PromptManager } from '../libs/xml/PromptManager'
import PomAgentService from '@service/PomAgentService'
import AgentService from '@service/AgentService'
import { ChatBuffer } from '@service/dto/IAgent.dto'

@Controller('/prompt')
export default class DeviceController {
    private promptManager: PromptManager = promptManager
    @Inject(PomAgentService)
    private pomAgentService!: PomAgentService
    @Inject(AgentService)
    private agentService!: AgentService

    @GET({ url: '/get' })
    async getPE(req: FastifyRequest<{ Querystring: Record<string, string> }>) {
        const deviceSN = req.query.deviceSN
        const agent = await this.pomAgentService.findAgentByDeviceSN(deviceSN)
        const data = await this.promptManager.getPrompt(
            agent?.deviceSession?.device?.productId,
            agent?.id,
            agent?.sessionId,
            deviceSN
        )

        return data.toMarkdown()
    }

    @GET({ url: '/get-trigger' })
    async getTriggerPE(req: FastifyRequest<{ Querystring: Record<string, string> }>) {
        const deviceSN = req.query.deviceSN
        const agent = await this.pomAgentService.findAgentByDeviceSN(deviceSN)
        const data = await this.promptManager.getTriggerPrompt(
            agent?.deviceSession?.device?.productId,
            agent?.id,
            agent?.sessionId,
            deviceSN
        )

        return data
    }

    @GET({ url: '/getAll' })
    async getAllPE(req: FastifyRequest<{ Querystring: Record<string, string> }>) {
        const chat: ChatBuffer = {
            sttText: '',
            id: '',
            text: '',
            audio: [],
            image: [],
            stateImage: [],
            endtime: new Date().getTime()
        }
        const deviceSN = req.query.deviceSN
        const data = await this.agentService.mergeMsg(deviceSN, [], chat)

        return data.messages
    }
}
