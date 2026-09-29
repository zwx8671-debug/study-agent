/** @format */

/**
 * 音频格式枚举
 */
export enum AudioFormatEnum {
    PCM = 'pcm',
    MP3 = 'mp3',
    WAV = 'wav',
    OGG = 'ogg',
    FLAC = 'flac',
    AAC = 'aac'
}

/**
 * Agent 接口定义
 */
export interface IAgent {
    id: string
    name?: string
    [key: string]: any
}
