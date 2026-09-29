/** @format */

import { Service } from 'fastify-decorators'
import { getLogger, type Logger } from '@utils/Logger'
import { ChatModelProvider } from 'uniai'
import { configHttpdao } from '../httpdao/cocoadmin/ConfigHttpdao'

// 默认的AI模型提供商
export let DEFAULT_PROVIDER: string = ChatModelProvider.Other
// 默认的AI模型
export let DEFAULT_MODEL: string = 'gpt-4.1'
// 快速响应的阈值
export let QUICK_RES_THRESHOLD: number = 0.5

@Service()
export class ConfigService {
    private log: Logger = getLogger(ConfigService.name)

    async resetConfig() {
        const config1 = await configHttpdao.get('DEFAULT_PROVIDER')
        if (config1) {
            DEFAULT_PROVIDER = config1
        }
        const config2 = await configHttpdao.get('DEFAULT_MODEL')
        if (config2) {
            DEFAULT_MODEL = config2
        }

        this.log.info(
            `重置配置成功，默认模型为(DEFAULT_PROVIDER：${DEFAULT_PROVIDER}) (DEFAULT_MODEL：${DEFAULT_MODEL})`
        )

        // 快速响应的阈值
        const config3 = await configHttpdao.get('QUICK_RES_THRESHOLD')
        if (config3) {
            QUICK_RES_THRESHOLD = parseFloat(config3)
            this.log.info(`快速响应的阈值为：${QUICK_RES_THRESHOLD}`)
        }
    }
}
