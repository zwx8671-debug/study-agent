/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import {
    CheckBindRequest,
    CheckBindResponse,
    CommonResult,
    DeviceDetailVO,
    DeviceInnerCreateReqVO,
    DeviceInnerCreateRespVO
} from './common/cocoadmin.interface'

/**
 * 设备相关HTTP DAO
 */
export class DeviceHttpdao {
    private log = getLogger(DeviceHttpdao.name)

    /**
     * 设备绑定/创建
     * @param req 设备绑定请求
     * @returns 设备绑定响应或undefined(失败时)
     */
    async bind(req: DeviceInnerCreateReqVO): Promise<DeviceInnerCreateRespVO | undefined> {
        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device/bind`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: {
                name: req.name,
                seriesNum: req.seriesNum,
                // 上游 body 常为字符串，cocoadmin 要求 JSON number，否则易 400
                userId: Number(req.userId),
                code: req.code
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceInnerCreateRespVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`设备绑定失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
            return undefined
        } catch (error: unknown) {
            const ax = error as { message?: string; response?: { status?: number; data?: unknown } }
            this.log.errorMsg(`设备绑定请求异常,入参:${JSON.stringify(config)}`, {
                errorMsg: ax?.message ?? String(error),
                responseStatus: ax?.response?.status,
                responseBody: ax?.response?.data
            })
            return undefined
        }
    }

    /**
     * 检查设备绑定关系
     * @returns 绑定关系检查结果或undefined(失败时)
     * @param param
     */
    async checkBind(param: CheckBindRequest): Promise<CheckBindResponse> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device/check-bind`,
            params: {
                seriesNum: param.deviceSN,
                timestamp: param.timestamp,
                signature: param.signature
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<CheckBindResponse>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`设备绑定关系检查失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (e) {
            this.log.errorMsg(`设备绑定关系检查请求异常: ${e},入参:${JSON.stringify(config)}`)
        }
        return {
            deviceSN: param.deviceSN,
            userId: 0,
            bindFlag: false,
            bindTime: null
        }
    }

    /**
     * 根据设备序列号获取设备详情
     * @param seriesNum 设备序列号
     * @returns 设备详情或null
     */
    async getDeviceBySN(seriesNum: string): Promise<DeviceDetailVO | null> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device/${seriesNum}`,
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceDetailVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`设备详情查询失败: ${response.data.msg}, seriesNum: ${seriesNum}`)
            return null
        } catch (error) {
            this.log.errorMsg(`设备详情查询请求异常, seriesNum: ${seriesNum}`, { errorMsg: error })
            return null
        }
    }
}

export const deviceHttpdao = new DeviceHttpdao()
