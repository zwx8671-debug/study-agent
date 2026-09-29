/** @format */
import { CommonResult } from './common/cocoadmin.interface'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { getLogger } from '@utils/Logger'

export interface CharacterDO {
    createTime: string
    updateTime: string
    creator: string
    updater: string
    deleted: number
    id: number
    name: string
    characterPrompt: string
    metaPrompt: string
}

/**
 * 人格
 */
export class CharacterHttpdao {
    private log = getLogger(CharacterHttpdao.name)
    async getCharacter(agentId: string): Promise<CharacterDO | undefined> {
        const config = {
            method: 'get' as const,
            url: env.COCOADMIN_API_URL + `/inner/robot/agent/${agentId}/character`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<CharacterDO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`人格查询异常,入参:${JSON.stringify(config)}`)
            return undefined
        } catch (e) {
            this.log.errorMsg(`人格查询异常: ${e},入参:${JSON.stringify(config)}`)
            return undefined
        }
    }
}
export const characterHttpdao = new CharacterHttpdao()
