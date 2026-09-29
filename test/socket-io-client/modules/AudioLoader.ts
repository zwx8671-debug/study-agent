/** @format */
/**
 * 音频加载器模块
 * 负责音频文件的读取、验证和 base64 编码
 */

import * as fs from 'fs'
import * as path from 'path'
import { Audio, AudioFlag, AudioFormatEnum } from '@interface/IAgent'
import { env } from '@config/env'

export interface AudioLoaderConfig {
    audioDir: string
    defaultFormat?: AudioFormatEnum
    defaultSampleRate?: number
    defaultChannels?: number
    defaultBitDepth?: number
}

/**
 * 音频加载器类
 */
export class AudioLoader {
    private audioDir: string
    private defaultFormat: AudioFormatEnum
    private defaultSampleRate: number
    private defaultChannels: number
    private defaultBitDepth: number
    private audioCache: Map<string, Buffer> = new Map()

    constructor(config: AudioLoaderConfig) {
        this.audioDir = config.audioDir
        this.defaultFormat = config.defaultFormat || AudioFormatEnum.MP3
        this.defaultSampleRate = config.defaultSampleRate || 16000
        this.defaultChannels = config.defaultChannels || 1
        this.defaultBitDepth = config.defaultBitDepth || 16
    }

    /**
     * 检查音频文件是否存在
     */
    audioExists(text: string): boolean {
        const audioPath = this.getAudioPath(text)
        return fs.existsSync(audioPath)
    }

    /**
     * 加载音频文件并转换为 Audio 对象
     */
    async loadAudio(text: string, audioId: string): Promise<Audio | null> {
        try {
            const audioPath = this.getAudioPath(text)

            if (!fs.existsSync(audioPath)) {
                return null
            }

            // 从缓存读取或加载文件
            let buffer: Buffer
            if (this.audioCache.has(audioPath)) {
                buffer = this.audioCache.get(audioPath)!
            } else {
                buffer = await fs.promises.readFile(audioPath)
                // 缓存音频数据（如果文件不太大）
                if (buffer.length < 10 * 1024 * 1024) {
                    // 小于 10MB 才缓存
                    this.audioCache.set(audioPath, buffer)
                }
            }

            // 转换为 base64
            const format = this.getAudioFormat(audioPath)

            return {
                base64: env.IS_BYTE ? buffer : buffer.toString('base64'),
                format,
                id: audioId,
                index: 0,
                flag: AudioFlag.END, // 整个文件作为一个完整的音频块
                sampleRate: this.defaultSampleRate,
                channels: this.defaultChannels,
                bitDepth: this.defaultBitDepth
            }
        } catch (error) {
            console.error(`加载音频文件失败: ${text}`, error)
            return null
        }
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.audioCache.clear()
    }

    /**
     * 获取缓存大小
     */
    getCacheSize(): number {
        return this.audioCache.size
    }

    /**
     * 获取音频文件路径
     */
    private getAudioPath(text: string): string {
        // 支持多种音频格式
        const formats = ['.mp3', '.wav', '.pcm']
        for (const format of formats) {
            const audioPath = path.join(this.audioDir, `${text}${format}`)
            if (fs.existsSync(audioPath)) {
                return audioPath
            }
        }
        // 默认返回 mp3 路径（即使不存在）
        return path.join(this.audioDir, `${text}.mp3`)
    }

    /**
     * 获取音频格式
     */
    private getAudioFormat(filePath: string): AudioFormatEnum {
        const ext = path.extname(filePath).toLowerCase()
        switch (ext) {
            case '.mp3':
                return AudioFormatEnum.MP3
            case '.wav':
                return AudioFormatEnum.WAV
            case '.pcm':
                return AudioFormatEnum.PCM
            case '.opus':
                return AudioFormatEnum.OPUS
            case '.webm':
                return AudioFormatEnum.WEBM
            default:
                return this.defaultFormat
        }
    }
}
