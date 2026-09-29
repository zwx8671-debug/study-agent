/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import {
    CommonResult,
    CreateDeviceFaceReqVO,
    DeviceFaceInnerRespVO,
    DeviceFaceVO,
    FaceDiffReqVO,
    FaceDiffRespVO,
    UpdateDeviceFaceReqVO
} from './common/cocoadmin.interface'

/**
 * 设备人脸管理 HTTP DAO
 */
export class DeviceFaceHttpdao {
    private log = getLogger(DeviceFaceHttpdao.name)

    /**
     * 根据设备序列号查询人脸列表
     * @param seriesNum 设备序列号
     * @returns 人脸列表
     */
    async findBySeriesNum(seriesNum: string): Promise<DeviceFaceVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/list`,
            params: {
                seriesNum
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceFaceVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询人脸列表失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询人脸列表请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 创建人脸信息
     * @param faceData 人脸数据
     * @returns 创建的人脸信息或undefined
     */
    async create(faceData: CreateDeviceFaceReqVO): Promise<DeviceFaceVO | undefined> {
        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/create`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: faceData
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceFaceVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                this.log.infoMsg(`人脸创建成功: ${response.data.data.id}`)
                return response.data.data
            }

            this.log.warnMsg(`创建人脸失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`创建人脸请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 更新人脸信息
     * @param id 人脸ID
     * @param updateData 更新数据
     * @returns 更新后的人脸信息或undefined
     */
    async update(id: string, updateData: UpdateDeviceFaceReqVO): Promise<DeviceFaceVO | undefined> {
        const config = {
            method: 'put' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/${id}`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: updateData
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceFaceVO>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                this.log.infoMsg(`人脸更新成功: ${id}`)
                return response.data.data
            }

            this.log.warnMsg(`更新人脸失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`更新人脸请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }

    /**
     * 删除人脸信息（软删除）
     * @param id 人脸ID
     * @returns 是否删除成功
     */
    async delete(id: string): Promise<boolean> {
        const config = {
            method: 'delete' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/${id}`,
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<boolean>> = await axios(config)

            if (response.data.code === 200) {
                this.log.infoMsg(`人脸删除成功: ${id}`)
                return response.data.data ?? true
            }

            this.log.warnMsg(`删除人脸失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`删除人脸请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return false
    }

    /**
     * 根据设备序列号查询人脸列表（内部接口版本）
     * @param seriesNum 设备序列号
     * @returns 人脸列表
     */
    async getDeviceFaceList(seriesNum: string): Promise<DeviceFaceInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/list`,
            params: {
                seriesNum
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceFaceInnerRespVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询设备人脸列表失败: ${response.data.msg}, seriesNum: ${seriesNum}`)
        } catch (error) {
            this.log.errorMsg(`查询设备人脸列表请求异常, seriesNum: ${seriesNum}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 人脸对比 - 多设备上报本地faceId，返回各设备缺少的faceId
     * @param faceDiffReq 人脸对比请求
     * @returns 人脸对比结果列表
     */
    async faceDiff(faceDiffReq: FaceDiffReqVO): Promise<FaceDiffRespVO[]> {
        const config = {
            method: 'post' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/device-face/diff`,
            headers: {
                'Content-Type': 'application/json',
                innerKey: env.COCOADMIN_API_KEY
            },
            data: faceDiffReq
        }

        try {
            const response: AxiosResponse<CommonResult<FaceDiffRespVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`人脸对比失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`人脸对比请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return []
    }
}

export const deviceFaceHttpdao = new DeviceFaceHttpdao()
