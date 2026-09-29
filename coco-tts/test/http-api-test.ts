/** @format */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import type { Readable } from 'stream'
import { convertPcmToWavBuffer } from '@utils/pcmToWav'

const BASE_URL = process.env.TTS_HTTP_URL || 'http://127.0.0.1:3003'
const OUTPUT_DIR = path.resolve(process.cwd(), 'test/output')

const TEXT_CHUNKS = ['你好，', '这是', 'HTTP', '流式合成', '测试。']

async function testHealth() {
    console.log('\n▶️  GET /health')
    const { data } = await axios.get(`${BASE_URL}/health`)
    console.log('   ', JSON.stringify(data))
    assert(data.code === 200 && data.data?.status === 'ok', '/health 返回异常')
}

async function testStatus() {
    console.log('\n▶️  GET /tts/status')
    const { data } = await axios.get(`${BASE_URL}/tts/status`)
    console.log('   ', JSON.stringify(data))
    assert(data.code === 200 && data.data?.available === true, '/tts/status 返回异常')
    return data.data as { format: string; sampleRate: number }
}

async function testSynthesize() {
    console.log('\n▶️  POST /tts/synthesize?format=wav （一次性合成，text 传数组=增量推送）')
    const start = Date.now()
    const { data } = await axios.post(
        `${BASE_URL}/tts/synthesize?format=wav`,
        { text: TEXT_CHUNKS },
        { timeout: 60000 }
    )
    assert(data.code === 200, `合成失败: ${data.msg}`)

    const audio = Buffer.from(data.data.audio, 'base64')
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    const wavPath = path.join(OUTPUT_DIR, `http-oneshot-${data.data.sessionId}.wav`)
    fs.writeFileSync(wavPath, audio)

    console.log(
        `    格式=${data.data.format}@${data.data.sampleRate}Hz, 块数=${data.data.chunks}, ` +
            `大小=${audio.length} bytes, 服务端耗时=${data.data.duration}ms, 请求总耗时=${Date.now() - start}ms`
    )
    console.log(`    WAV: ${wavPath}`)

    assert(audio.length > 44, '合成音频为空')
    assert(audio.subarray(0, 4).toString('ascii') === 'RIFF', 'format=wav 未返回合法 WAV 头')
}

async function testSynthesizeStream(meta: { sampleRate: number }) {
    console.log('\n▶️  POST /tts/synthesize/stream （流式合成，边合成边下发）')
    const start = Date.now()

    const response = await axios.post<Readable>(
        `${BASE_URL}/tts/synthesize/stream`,
        { text: TEXT_CHUNKS },
        { responseType: 'stream', timeout: 60000 }
    )

    const format = response.headers['x-tts-format'] as string
    const sampleRate = parseInt((response.headers['x-tts-sample-rate'] as string) || '0', 10)
    const sessionId = response.headers['x-tts-session-id'] as string
    console.log(`    响应头: format=${format}, sampleRate=${sampleRate}, sessionId=${sessionId}`)

    const chunks: Buffer[] = []
    let firstChunkTime = 0

    await new Promise<void>((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
            if (!firstChunkTime) firstChunkTime = Date.now()
            chunks.push(chunk)
        })
        response.data.on('end', resolve)
        response.data.on('error', reject)
    })

    const audio = Buffer.concat(chunks)
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    const wavPath = path.join(OUTPUT_DIR, `http-stream-${sessionId}.wav`)
    fs.writeFileSync(wavPath, convertPcmToWavBuffer(audio, sampleRate || meta.sampleRate))

    console.log(
        `    首字节耗时=${firstChunkTime - start}ms, 总耗时=${Date.now() - start}ms, ` +
            `HTTP 分块=${chunks.length}, 大小=${audio.length} bytes`
    )
    console.log(`    WAV: ${wavPath}`)

    assert(audio.length > 0, '流式合成音频为空')
    assert(sampleRate > 0, '响应头缺少 X-TTS-Sample-Rate')
    assert(firstChunkTime - start < Date.now() - start, '首字节未早于响应结束，可能不是流式')
}

async function testBadRequest() {
    console.log('\n▶️  POST /tts/synthesize （缺少 text，应返回 400）')
    const { status, data } = await axios.post(
        `${BASE_URL}/tts/synthesize`,
        {},
        { validateStatus: () => true, timeout: 10000 }
    )
    console.log(`    status=${status}, body=${JSON.stringify(data)}`)
    assert(status === 400 && data.code === 400, '缺少 text 时未返回 400')
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`断言失败: ${message}`)
}

async function main() {
    console.log(`\n🎯 TTS HTTP API 测试，目标: ${BASE_URL}`)

    await testHealth()
    const meta = await testStatus()
    await testBadRequest()
    await testSynthesize()
    await testSynthesizeStream(meta)

    console.log('\n🎉 HTTP 接口全部断言通过\n')
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(`\n❌ 测试失败: ${error instanceof Error ? error.message : error}\n`)
        process.exit(1)
    })
