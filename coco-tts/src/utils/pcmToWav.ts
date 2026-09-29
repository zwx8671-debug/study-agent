/** @format */

import fs from 'fs'
import path from 'path'
import { env } from '@config/env'
import { getLogger } from './Logger'

const log = getLogger('pcmToWav')

/** Windows/Linux 文件名非法字符 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g

/**
 * 将 PCM 数据转换为 WAV 格式并保存到文件
 * @param pcmData PCM 音频数据 Buffer
 * @param filename 输出文件名
 * @param sampleRate 采样率，默认 16000
 * @param numChannels 声道数，默认 1 (单声道)
 * @param bitsPerSample 每个样本的位数，默认 16
 */
export function convertPcmToWav2(
    pcmData: Buffer,
    filename: string,
    sampleRate: number = 16000,
    numChannels: number = 1,
    bitsPerSample: number = 16
): void {
    try {
        const wavHeader = createWavHeader(pcmData.length, sampleRate, numChannels, bitsPerSample)
        const wavData = Buffer.concat([wavHeader, pcmData])
        fs.writeFileSync(filename, wavData)
        log.info(`WAV file saved: ${filename}`)
    } catch (error) {
        log.error(`Failed to convert PCM to WAV: ${error}`)
        throw error
    }
}

/**
 * 创建 WAV 文件头
 * @param dataLength PCM 数据长度
 * @param sampleRate 采样率
 * @param numChannels 声道数
 * @param bitsPerSample 每个样本的位数
 * @returns WAV 文件头 Buffer
 */
function createWavHeader(
    dataLength: number,
    sampleRate: number,
    numChannels: number,
    bitsPerSample: number
): Buffer {
    const header = Buffer.alloc(44)
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8

    // RIFF chunk descriptor
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4) // ChunkSize
    header.write('WAVE', 8)

    // fmt sub-chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
    header.writeUInt16LE(numChannels, 22) // NumChannels
    header.writeUInt32LE(sampleRate, 24) // SampleRate
    header.writeUInt32LE(byteRate, 28) // ByteRate
    header.writeUInt16LE(blockAlign, 32) // BlockAlign
    header.writeUInt16LE(bitsPerSample, 34) // BitsPerSample

    // data sub-chunk
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40) // Subchunk2Size

    return header
}

/**
 * 将 PCM 数据转换为 WAV 格式 Buffer
 * @param pcmData PCM 音频数据 Buffer
 * @param sampleRate 采样率，默认 16000
 * @param numChannels 声道数，默认 1 (单声道)
 * @param bitsPerSample 每个样本的位数，默认 16
 * @returns WAV 格式的 Buffer
 */
export function convertPcmToWavBuffer(
    pcmData: Buffer,
    sampleRate: number = 16000,
    numChannels: number = 1,
    bitsPerSample: number = 16
): Buffer {
    const wavHeader = createWavHeader(pcmData.length, sampleRate, numChannels, bitsPerSample)
    return Buffer.concat([wavHeader, pcmData])
}

/**
 * 调试用：仅当 SAVE_PCM=true 时，将 PCM 落盘为 WAV 到 SAVE_PCM_DIR 目录
 * @param pcmData PCM 音频数据
 * @param filename 文件名（非法字符会被替换为下划线）
 * @param sampleRate 采样率
 * @returns 落盘文件路径；未开启或失败时返回 undefined
 */
export function saveDebugWav(pcmData: Buffer, filename: string, sampleRate: number = 16000): string | undefined {
    if (!env.SAVE_PCM || pcmData.length === 0) return undefined

    try {
        fs.mkdirSync(env.SAVE_PCM_DIR, { recursive: true })
        const filePath = path.join(env.SAVE_PCM_DIR, filename.replace(ILLEGAL_FILENAME_CHARS, '_'))
        convertPcmToWav2(pcmData, filePath, sampleRate)
        return filePath
    } catch (error) {
        log.error(`Failed to save debug WAV: ${error}`)
        return undefined
    }
}
