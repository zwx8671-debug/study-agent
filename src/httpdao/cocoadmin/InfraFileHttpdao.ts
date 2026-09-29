/** @format */
import { CommonResult } from './common/cocoadmin.interface'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { getLogger } from '@utils/Logger'

/**
 * COCOADMIN 基础设施 - 文件相关 inner 接口
 */
export class InfraFileHttpdao {
    private log = getLogger(InfraFileHttpdao.name)

    /**
     * 根据文件访问地址生成带签名的临时访问 URL
     * GET /inner/infra/file/presign-get-url
     *
     * @param fileAccessUrl 文件访问地址（如 lamp 返回的 video_path）
     * @param expirationSeconds 有效期（秒），默认由服务端处理时可不传
     */
    async presignGetUrl(fileAccessUrl: string, expirationSeconds?: number): Promise<string | undefined> {
        const url = fileAccessUrl?.trim()
        if (!url) return undefined

        const params = new URLSearchParams()
        params.set('url', url)
        if (expirationSeconds != null && expirationSeconds > 0) {
            params.set('expirationSeconds', String(expirationSeconds))
        }

        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/infra/file/presign-get-url?${params.toString()}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<string>> = await axios(config)
            if (response.data.code === 200 && response.data.data) {
                return response.data.data
            }
            this.log.warnMsg(`presignGetUrl 未返回有效 data: ${response.data?.msg ?? ''}`, { fileAccessUrl: url })
            return undefined
        } catch (e) {
            this.log.errorMsg('presignGetUrl 请求异常', { errorMsg: e, fileAccessUrl: url })
            return undefined
        }
    }
}

export const infraFileHttpdao = new InfraFileHttpdao()
