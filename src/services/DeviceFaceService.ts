/** @format */

import { Service } from 'fastify-decorators'
import { getLogger } from '@utils/Logger'
import { deviceFaceHttpdao } from '@httpdao/cocoadmin/DeviceFaceHttpdao'
import { DeviceFaceVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'

export interface FaceData {
    name: string
    /**
     * 设备redisID
     */
    threeId?: string
    faceBase?: string
}

@Service()
export class DeviceFaceService {
    private readonly log = getLogger(DeviceFaceService.name)

    /**
     * 同步设备的人脸信息
     * 入库流程：
     * 1、查询设备的关联人脸
     * 2、和入参人脸对比，对比字段是threeId，有则更新，数据库没有则新增，数据库多了则删除
     * @param seriesNum 设备序列号
     * @param faces 人脸数据列表
     */
    async syncDeviceFaces(seriesNum: string, faces: FaceData[]): Promise<void> {
        try {
            this.log.info(`Start syncing faces for device: ${seriesNum}`)

            // 1. 查询设备的关联人脸
            const existingFaces = await deviceFaceHttpdao.findBySeriesNum(seriesNum)
            this.log.debug(`Found ${existingFaces.length} existing faces for device: ${seriesNum}`)

            // 创建threeId到现有记录的映射
            const existingFaceMap = new Map<string, DeviceFaceVO>()
            existingFaces.forEach(face => {
                if (face.threeId) {
                    existingFaceMap.set(face.threeId, face)
                }
            })

            // 创建入参threeId到人脸数据的映射
            const inputFaceMap = new Map<string, FaceData>()
            faces.forEach(face => {
                if (face.threeId) {
                    inputFaceMap.set(face.threeId, face)
                }
            })

            // 2. 对比处理
            // 更新或新增处理
            for (const face of faces) {
                if (face.threeId && existingFaceMap.has(face.threeId)) {
                    // 有则更新
                    const existingFace = existingFaceMap.get(face.threeId)!
                    await deviceFaceHttpdao.update(existingFace.id, {
                        name: face.name,
                        faceBase: face.faceBase
                    })
                    this.log.debug(`Updated face with threeId: ${face.threeId}`)
                } else {
                    // 数据库没有则新增
                    await deviceFaceHttpdao.create({
                        name: face.name,
                        threeId: face.threeId,
                        faceBase: face.faceBase,
                        deviceSn: seriesNum
                    })
                    this.log.debug(`Created new face with threeId: ${face.threeId}`)
                }
            }

            // 数据库多了则删除（软删除）
            for (const [threeId, existingFace] of existingFaceMap) {
                if (!inputFaceMap.has(threeId)) {
                    await deviceFaceHttpdao.delete(existingFace.id)
                    this.log.debug(`Deleted face with threeId: ${threeId}`)
                }
            }

            this.log.info(`Finished syncing faces for device: ${seriesNum}`)
        } catch (error) {
            this.log.error(`Error syncing faces for device ${seriesNum}:`, error)
            throw error
        }
    }

    /**
     * 查询设备的所有人脸信息
     * @param seriesNum 设备序列号
     * @returns 人脸信息列表
     */
    async getDeviceFaces(seriesNum: string): Promise<DeviceFaceVO[]> {
        try {
            return await deviceFaceHttpdao.findBySeriesNum(seriesNum)
        } catch (error) {
            this.log.error(`Error getting faces for device ${seriesNum}:`, error)
            throw error
        }
    }

    /**
     * 获取设备人脸的简化数据（只包含id和name）
     * @param seriesNum 设备序列号
     * @returns 简化的人脸数据列表
     */
    async getDeviceFacesSimple(seriesNum: string): Promise<Array<{ id: string; name: string }>> {
        try {
            const faces = await deviceFaceHttpdao.findBySeriesNum(seriesNum)
            return faces.map(face => ({
                id: face.id,
                name: face.name
            }))
        } catch (error) {
            this.log.error(`Error getting simple faces for device ${seriesNum}:`, error)
            return []
        }
    }
}
