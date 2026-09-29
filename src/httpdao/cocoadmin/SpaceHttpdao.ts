/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import {
    CommonResult,
    DeviceFaceInnerRespVO,
    DevicePetInnerRespVO,
    DeviceVoiceInnerRespVO
} from './common/cocoadmin.interface'

/**
 * 家庭 AES 密钥响应
 */
export interface SpaceAESKeyVO {
    spaces_id: string
    aes_key: string
}

/**
 * 家庭人脸信息
 */
export interface SpaceFaceVO {
    face_id: number
    user_id: number
    device_id: string
    face_url?: string
    name?: string
    created_at?: string
    [key: string]: any
}

/**
 * 家庭人脸列表响应
 */
export interface SpaceFaceListVO {
    spaces_id: string
    face_list: SpaceFaceVO[]
}

/**
 * 家庭设备信息
 */
export interface SpaceDeviceVO {
    device_id: string
    device_sn: string
    user_id: number
    bind_flag: boolean
}

/**
 * 家庭相关HTTP DAO
 */
export class SpaceHttpdao {
    private log = getLogger(SpaceHttpdao.name)

    /**
     * 查询家庭人脸列表（内部接口）
     * @param spaceId 家庭ID
     * @returns 人脸列表
     */
    async getFamilySpaceFaceList(spaceId: string): Promise<DeviceFaceInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/family-space/face-list`,
            params: {
                spaceId
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

            this.log.warnMsg(`查询家庭人脸列表失败: ${response.data.msg}, spaceId: ${spaceId}`)
        } catch (error) {
            this.log.errorMsg(`查询家庭人脸列表请求异常, spaceId: ${spaceId}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 查询家庭 AES 密钥（内部接口）
     * @param spaceId 家庭ID
     * @returns AES密钥或null
     */
    async getFamilySpaceAESKey(spaceId: string): Promise<string | null> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/family-space/aes-key`,
            params: {
                spaceId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<string>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询家庭AES密钥失败: ${response.data.msg}, spaceId: ${spaceId}`)
        } catch (error) {
            this.log.errorMsg(`查询家庭AES密钥请求异常, spaceId: ${spaceId}`, { errorMsg: error })
        }
        return null
    }

    /**
     * 查询家庭声纹列表（内部接口）
     * @param spaceId 家庭ID
     * @returns 声纹列表
     */
    async getFamilySpaceVoiceList(spaceId: string): Promise<DeviceVoiceInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/family-space/voice-list`,
            params: {
                spaceId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DeviceVoiceInnerRespVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询家庭声纹列表失败: ${response.data.msg}, spaceId: ${spaceId}`)
        } catch (error) {
            this.log.errorMsg(`查询家庭声纹列表请求异常, spaceId: ${spaceId}`, { errorMsg: error })
        }
        return []
    }

    /**
     * 查询家庭宠物列表（内部接口）
     * @param spaceId 家庭ID
     * @returns 宠物列表
     */
    async getFamilySpacePetList(spaceId: string): Promise<DevicePetInnerRespVO[]> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/family-space/pet-list`,
            params: {
                spaceId
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<DevicePetInnerRespVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }

            this.log.warnMsg(`查询家庭宠物列表失败: ${response.data.msg}, spaceId: ${spaceId}`)
        } catch (error) {
            this.log.errorMsg(`查询家庭宠物列表请求异常, spaceId: ${spaceId}`, { errorMsg: error })
        }
        return []
    }
}

export const spaceHttpdao = new SpaceHttpdao()
