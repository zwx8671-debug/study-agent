/** @format */

export class TokenUtil {
    /**
     * 从请求头中提取 token
     * @param headers 请求头对象
     * @returns token 字符串或 null
     */
    static extractTokenFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
        const authorization = headers.authorization || headers.Authorization

        if (!authorization) {
            return null
        }

        // 处理数组情况
        const authValue = Array.isArray(authorization) ? authorization[0] : authorization

        // 检查是否以 Bearer 开头
        if (authValue.startsWith('Bearer ')) {
            return authValue.replace('Bearer ', '')
        }

        return authValue
    }
}
