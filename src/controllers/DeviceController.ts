/** @format */

import { Controller, POST } from 'fastify-decorators'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { deviceHttpdao } from '@httpdao/cocoadmin/DeviceHttpdao'
import { HttpCommonResponse } from '../common/HttpCommonResponse'
import { CheckBindRequest, CheckBindResponse, DeviceBindRequest } from '@httpdao/cocoadmin/common/cocoadmin.interface'

@Controller('/device')
export default class DeviceController {
    @POST({ url: '/bind' })
    async bind(req: FastifyRequest<{ Body: DeviceBindRequest }>, reply: FastifyReply) {
        const data = await deviceHttpdao.bind({
            name: req.body.name,
            seriesNum: req.body.deviceSN,
            userId: req.body.userId,
            code: req.body.code
        })
        return reply.send(HttpCommonResponse.data(data))
    }

    @POST({ url: '/check-bind' })
    async checkBind(req: FastifyRequest<{ Body: CheckBindRequest }>, reply: FastifyReply) {
        const data = await deviceHttpdao.checkBind(req.body)
        return reply.send(HttpCommonResponse.data<CheckBindResponse>(data, data.bindFlag))
    }
}
