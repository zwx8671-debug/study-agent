/** @format */

export function convertToPlaybackRate(value: number) {
    // 计算基础播放速度
    const rate = 1.0 + value / 100

    // 检查范围并返回相应值
    if (rate > 2) {
        return 2.0 // 超出上限取上限值
    } else if (rate < 0.5) {
        return 0.5 // 低于下限取下限值
    } else {
        return rate // 在范围内返回计算值
    }
}

/**
 *  0.5-2转为 -50-100
 *  火山值转化
 * @param speed
 */
export function correctVolcEngineConvertSpeed(speed: number): string {
    const validSpeed = Math.max(0.5, Math.min(2.0, speed))
    // 正确公式：范围是150（从-50到100）对应1.5倍速范围（从0.5到2.0）
    const result = (validSpeed - 0.5) * (150 / 1.5) - 50
    return Math.round(result) + '' // 四舍五入为整数
}

/**
 *  0.5-2转为 [-50%,+100%]
 *  火山值转化
 * @param speed
 */
export function correctAzureConvertSpeed(speed: number): string {
    const validSpeed = Math.max(0.5, Math.min(2.0, speed))
    // 正确公式：范围是150（从-50到100）对应1.5倍速范围（从0.5到2.0）
    const result = (validSpeed - 0.5) * (150 / 1.5) - 50
    // 只有加音量才需要显式'+'
    let sign = ''
    if (result > 0) {
        sign = '+'
    }
    return sign + Math.round(result) + '%' // 四舍五入为整数
}
