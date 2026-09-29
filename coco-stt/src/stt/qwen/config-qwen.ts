/** @format */

// 实时语音识别：https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide
// WebSocket VAD / Manual：https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-interaction-process

export const QWEN_ASR_STREAM_MODEL = process.env.QWEN_ASR_STREAM_MODEL || process.env.QWEN_ASR_MODEL || 'qwen3-asr-flash-realtime'
export const QWEN_ASR_HTTP_MODEL = process.env.QWEN_ASR_HTTP_MODEL || 'qwen3-asr-flash'
export const QWEN_ASR_MODEL = QWEN_ASR_STREAM_MODEL
export const QWEN_ASR_WORKSPACE_ID = process.env.QWEN_ASR_WORKSPACE_ID || ''
export const QWEN_ASR_API_KEY = process.env.QWEN_ASR_API_KEY || ''
export const QWEN_ASR_REGION = process.env.QWEN_ASR_REGION || 'cn-beijing'
export const QWEN_ASR_API_HOST = process.env.QWEN_ASR_API_HOST || (QWEN_ASR_WORKSPACE_ID ? `${QWEN_ASR_WORKSPACE_ID}.${QWEN_ASR_REGION}.maas.aliyuncs.com` : '')
export const QWEN_ASR_WS_URL = process.env.QWEN_ASR_WS_URL || (QWEN_ASR_API_HOST ? `wss://${QWEN_ASR_API_HOST}/api-ws/v1/realtime` : '')
export const QWEN_ASR_COMPATIBLE_BASE_URL = process.env.QWEN_ASR_COMPATIBLE_BASE_URL || (QWEN_ASR_API_HOST ? `https://${QWEN_ASR_API_HOST}/compatible-mode/v1` : '')
export const QWEN_ASR_SAMPLE_RATE = parseInt(process.env.QWEN_ASR_SAMPLE_RATE || '16000', 10)
export const QWEN_ASR_TIMEOUT = parseInt(process.env.QWEN_ASR_TIMEOUT || '5000', 10)
// 本服务上游总会发 stt:end，语义是 Manual 模式。server_vad 在立刻 finish 时会被服务端丢弃未完成识别。
export const QWEN_ASR_ENABLE_SERVER_VAD = (process.env.QWEN_ASR_ENABLE_SERVER_VAD || 'true').toLowerCase() === 'true'
export const QWEN_ASR_VAD_THRESHOLD = parseFloat(process.env.QWEN_ASR_VAD_THRESHOLD || '0.2')
export const QWEN_ASR_VAD_SILENCE_DURATION_MS = parseInt(process.env.QWEN_ASR_VAD_SILENCE_DURATION_MS || '400', 10)
export const QWEN_ASR_LANGUAGE = process.env.QWEN_ASR_LANGUAGE || ''
export const QWEN_ASR_ENABLE_ITN = (process.env.QWEN_ASR_ENABLE_ITN || 'false').toLowerCase() === 'true'

export function validateQwenAsrConfig(): void {
    if (!QWEN_ASR_API_KEY) throw new Error('QWEN_ASR_API_KEY is required')
    if (!QWEN_ASR_COMPATIBLE_BASE_URL) throw new Error('QWEN_ASR_COMPATIBLE_BASE_URL or QWEN_ASR_WORKSPACE_ID/QWEN_ASR_API_HOST is required')
    if (!QWEN_ASR_COMPATIBLE_BASE_URL.includes('.cn-beijing.maas.aliyuncs.com')) {
        throw new Error(`Only China region is enabled for Qwen ASR now, invalid url: ${QWEN_ASR_COMPATIBLE_BASE_URL}`)
    }
}
