/** @format */

/**
 * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#adjust-speaking-languages
 *
 * rate	指示文本的说话率。口语速率可以应用于单词或句子级别。速率变化应在原始音频的倍以内。您可以表示为：0.52rate
 * 相对值：
 * 作为相对数字：表示为充当默认值乘数的数字。例如，值为 导致原始费率没有变化。值为 会导致原始费率减半。值为 将导致原始速率的两倍。
 * 百分比：表示为数字，前面加上“+”（可选）或“-”，后跟“%”，表示相对变化。例如：或 。<prosody rate="50%">some text</prosody><prosody rate="-50%">some text</prosody>
 * 常量值：
 * x-slow（相当于 0.5， -50%）
 * slow（相当于 0.64，-46%）
 * medium（相当于 1，默认值）
 * fast（相当于 1.55，+55%）
 * x-fast（相当于 2，+100%）
 *
 * volume	指示说话声音的音量。音量变化可以在句子级别应用。您可以将体积表示为：
 * 绝对值：表示为 到 的范围内的数字，从最安静到最响亮，例如 。默认值为 。0.0100.075100.0
 * 相对值：
 * 作为相对数字：表示为前面带有“+”或“-”的数字，指定更改音量的量。
 * 百分比：表示为数字，前面加上“+”（可选）或“-”，后跟“%”，表示相对变化。例如：或 。<prosody volume="50%">some text</prosody><prosody volume="+3%">some text</prosody>
 * 常量值：
 * silent（相当于 0）
 * x-soft（相当于 0.2）
 * soft（相当于 0.4）
 * medium（相当于 0.6）
 * loud（相当于 0.8）
 * x-loud（相当于 1，默认值）
 *
 * style	特定于语音的说话风格。你可以表达快乐、同理心和平静等情绪。您还可以针对客户服务、新闻广播和语音助手等不同场景优化语音。如果样式值缺失或无效，则忽略整个元素，服务使用默认的中性语音。
 * 有关自定义语音样式，请参阅自定义语音样式示例。mstts:express-as
 * @param text 文本
 * @param lang 语言 eg: zh-CN
 * @param voiceName 音色
 * @param rate 语速
 * @param volume 音量
 * @param style 情绪、特定于语音的说话风格
 */
export function buildSsml(
    text: string,
    lang: string,
    voiceName: string,
    rate?: string,
    volume?: string,
    style?: string
) {
    // 处理可能为空值的参数
    const rateAttr = rate ? `rate="${rate}"` : ''
    const volumeAttr = volume ? `volume="${volume}"` : ''
    const styleAttr = style ? `<mstts:express-as style="${style}">${text}</mstts:express-as>` : text

    // 构建prosody标签，只包含有值的属性
    let prosodyAttrs = ''
    if (rateAttr) prosodyAttrs += ` ${rateAttr}`
    if (volumeAttr) prosodyAttrs += ` ${volumeAttr}`

    return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"  xmlns:mstts='http://www.w3.org/2001/mstts' xmlns:emo='http://www.w3.org/2009/10/emotionml'  xml:lang="${lang}">
            <voice name="${voiceName}">
                ${prosodyAttrs ? `<prosody ${prosodyAttrs}>` : ''}
                        ${styleAttr}
                ${prosodyAttrs ? `</prosody>` : ''}
            </voice>
        </speak>
    `
}
