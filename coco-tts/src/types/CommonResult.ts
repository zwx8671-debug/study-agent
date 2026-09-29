/** @format */

/**
 * HTTP 接口统一响应结构
 */
export interface CommonResult<T> {
    code: number
    msg: string
    data?: T
}

export function ok<T>(data: T, msg = 'ok'): CommonResult<T> {
    return { code: 200, msg, data }
}

export function fail<T>(code: number, msg: string, data?: T): CommonResult<T> {
    return { code, msg, data }
}
