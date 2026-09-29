/** @format */

import { CODE, HttpResponse } from '@interface/ICommon'

export class HttpCommonResponse {
    /**
     * 发送成功响应
     * @param msg
     * @param data
     */
    static success<T = null>(data: T | null, msg: string = 'success!') {
        const response: HttpResponse<T | null> = { code: CODE.SUCCESS, data: data ?? null, msg }
        return response
    }
    /**
     * 发送成功响应
     * @param flag
     * @param data
     */
    static data<T = null>(data: T | null, flag?: boolean) {
        if (!flag) {
            flag = !!data
        }

        let msg: string
        let response: HttpResponse<T | null>
        if (flag) {
            msg = 'success!'
            response = { code: CODE.SUCCESS, data: data ?? null, msg }
        } else {
            msg = 'fail!'
            response = { code: CODE.ERROR, data: data ?? null, msg }
        }
        return response
    }

    /**
     * 发送错误响应
     * @param msg
     * @param data
     */
    static error<T = null>(data: T | null, msg: string = 'fail!') {
        const response: HttpResponse<T | null> = { code: CODE.ERROR, data: data ?? null, msg }
        return response
    }
}
