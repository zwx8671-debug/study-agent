/** @format */

/**
 * 构建 SSML (Speech Synthesis Markup Language) 格式的文本
 * SSML 是一种基于 XML 的标记语言，用于控制语音合成的各个方面
 * 
 * @param text 要转换为语音的文本内容
 * @param voice 语音名称/音色
 * @param language 语言代码，如 'zh-CN', 'en-US' 等
 * @param rate 语速，如 '1.0', '0.8', '1.5' 等
 * @param pitch 音高，如 '0%', '+10%', '-20%' 等
 * @returns SSML 格式的字符串
 */
export function buildSsml(
    text: string,
    voice: string,
    language: string = 'zh-CN',
    rate: string = '1.0',
    pitch: string = '0%'
): string {
    // 转义 XML 特殊字符
    const escapedText = escapeXml(text)

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}">
    <voice name="${voice}">
        <prosody rate="${rate}" pitch="${pitch}">
            ${escapedText}
        </prosody>
    </voice>
</speak>`
}

/**
 * 转义 XML 特殊字符
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * 简化版 SSML 构建器，只包含基本的语音和文本
 * @param text 文本内容
 * @param voice 语音名称
 * @param language 语言代码
 * @returns 简化的 SSML 字符串
 */
export function buildSimpleSsml(text: string, voice: string, language: string = 'zh-CN'): string {
    const escapedText = escapeXml(text)
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}">
    <voice name="${voice}">${escapedText}</voice>
</speak>`
}
