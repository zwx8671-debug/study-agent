/** @format */

/**
 * HTTP 一次性语音识别基础抽象类
 * 与流式的 STTBaseService 不同，此类专用于 HTTP 请求 - 收到完整音频后一次性返回识别结果。
 * 无需事件机制和状态机，接口极简：只有一个 recognize 方法。
 */
export abstract class STTHttpBaseService {
    /**
     * 一次性识别音频数据，返回识别文本
     * @param audio   WAV 格式的音频 Buffer（需包含 WAV 文件头）
     * @param language 语言代码，默认 zh-CN，例如 en-US、ja-JP
     * @returns 识别出的文字；若无法识别则返回空字符串
     */
    public abstract recognize(audio: Buffer, language?: string): Promise<string>
}

