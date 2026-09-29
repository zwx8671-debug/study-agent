/** @format */

import { Buffer } from 'buffer'
import fs from 'fs'

/**
 * PCM转WAV工具函数
 * @param pcmBuffer PCM数据缓冲区
 * @param sampleRate 采样率，默认16000
 * @param channels 声道数，默认1（单声道）
 * @param bitDepth 位深度，默认16
 * @returns WAV格式的Buffer
 */
export function pcmToWav(
    pcmBuffer: Buffer,
    sampleRate: number = 16000,
    channels: number = 1,
    bitDepth: number = 16
): Buffer {
    const header = Buffer.alloc(44)
    const dataLength = pcmBuffer.length
    const fileSize = 36 + dataLength

    // RIFF标识
    header.write('RIFF', 0)
    // 文件大小
    header.writeUInt32LE(fileSize, 4)
    // WAVE标识
    header.write('WAVE', 8)
    // fmt标识
    header.write('fmt ', 12)
    // fmt块大小
    header.writeUInt32LE(16, 16)
    // 音频格式（1表示PCM）
    header.writeUInt16LE(1, 20)
    // 声道数
    header.writeUInt16LE(channels, 22)
    // 采样率
    header.writeUInt32LE(sampleRate, 24)
    // 字节率
    header.writeUInt32LE((sampleRate * channels * bitDepth) / 8, 28)
    // 块对齐
    header.writeUInt16LE((channels * bitDepth) / 8, 32)
    // 位深度
    header.writeUInt16LE(bitDepth, 34)
    // data标识
    header.write('data', 36)
    // 数据块大小
    header.writeUInt32LE(dataLength, 40)

    return Buffer.concat([header, pcmBuffer])
}

/**
 * 将PCM文件转换为WAV文件
 * @param pcmFilePath PCM文件路径
 * @param wavFilePath WAV文件输出路径
 * @param sampleRate 采样率，默认16000
 * @param channels 声道数，默认1（单声道）
 * @param bitDepth 位深度，默认16
 */
export function convertPcmToWav(
    pcmFilePath: string,
    wavFilePath: string,
    sampleRate: number = 16000,
    channels: number = 1,
    bitDepth: number = 16
): void {
    try {
        // 读取PCM文件
        const pcmBuffer = fs.readFileSync(pcmFilePath)

        // 转换为WAV
        const wavBuffer = pcmToWav(pcmBuffer, sampleRate, channels, bitDepth)

        // 写入WAV文件
        fs.writeFileSync(wavFilePath, wavBuffer)

        console.log(`成功转换: ${pcmFilePath} -> ${wavFilePath}`)
    } catch (error) {
        console.error('PCM转WAV转换失败:', error)
        throw error
    }
}
/**
 * 将PCM文件转换为WAV文件
 * @param pcmBuffer
 * @param wavFilePath WAV文件输出路径
 * @param sampleRate 采样率，默认16000
 * @param channels 声道数，默认1（单声道）
 * @param bitDepth 位深度，默认16
 */
export function convertPcmToWav2(
    pcmBuffer: Buffer,
    wavFilePath: string,
    sampleRate: number = 16000,
    channels: number = 1,
    bitDepth: number = 16
): void {
    try {
        // 转换为WAV
        const wavBuffer = pcmToWav(pcmBuffer, sampleRate, channels, bitDepth)

        // 写入WAV文件
        fs.writeFileSync(wavFilePath, wavBuffer)
    } catch (error) {
        console.error('PCM转WAV转换失败:', error)
        throw error
    }
}
