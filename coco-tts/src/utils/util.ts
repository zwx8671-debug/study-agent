/** @format */

/**
 * 工具函数集合
 */
const util = {
    /**
     * 将对象转换为 JSON 字符串
     * @param obj 要序列化的对象
     * @returns JSON 字符串
     */
    stringify(obj: any): string {
        return JSON.stringify(obj)
    },

    /**
     * 将 JSON 字符串解析为对象
     * @param str JSON 字符串
     * @returns 解析后的对象
     */
    parse<T = any>(str: string): T {
        return JSON.parse(str)
    }
}

export default util
