/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult } from '@httpdao/cocoadmin/common/cocoadmin.interface'

/**
 * 登录用户信息
 */
export interface LoginUser {
    id: number
    userType: number
    info: object
    tenantId: number
    scopes: string[]
    expiresTime: string
    visitTenantId: number
}
/**
 * 设备验签信息
 */
export interface DeviceInnerTokenCheckRespVO {
    id: string
    seriesNum: string
    productId: number
    expiresTime: string
}

/**
 * 认证相关HTTP DAO
 */
export class AuthHttpDao {
    private log = getLogger(AuthHttpDao.name)

    /**
     * 校验会员用户Token
     * @param token 用户token
     * @returns 登录用户信息或undefined(失败时)
     */
    async checkToken(token: string): Promise<LoginUser | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/member/checkToken`,
            params: {
                token
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<LoginUser>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`Token校验失败: ${response.data.msg},入参：${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`Token校验请求异常,入参：${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }
    /**
     * 校验设备Token
     * @param token 用户token
     * @returns 登录用户信息或undefined(失败时)
     */
    async checkTokenForDevice(token: string): Promise<DeviceInnerTokenCheckRespVO | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device/checkToken`,
            params: {
                token
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceInnerTokenCheckRespVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`Token校验失败: ${response.data.msg},入参：${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`Token校验请求异常,入参：${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }
}

export const authHttpDao = new AuthHttpDao()
