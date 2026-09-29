/** @format */

// UserController.ts
import { Controller, GET, Inject } from 'fastify-decorators'
import { ConfigService } from '@service/ConfigService'

@Controller('/config')
export default class UserController {
    @Inject(ConfigService)
    private configService!: ConfigService

    @GET({ url: '/resetConfig' })
    async resetConfig(): Promise<boolean> {
        await this.configService.resetConfig()
        return true
    }

    @GET({ url: '/timestamp' })
    async getTimestamp(): Promise<number> {
        return Date.now()
    }
}
