/** @format */

import { Controller, GET } from 'fastify-decorators'
import type { FastifyRequest } from 'fastify'
import { env } from '@config/env'

@Controller('/')
export default class IndexController {
    @GET('/')
    index(req: FastifyRequest) {
        const data = req.headers
        return `${req.i18n.t('index.hello')}\n${data['accept-language']}`
    }

    @GET('/health')
    health() {
        return env.SERVER_ID
    }
}
