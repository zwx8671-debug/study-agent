/** @format */

import fs from 'fs'
import path from 'path'
import { io } from 'socket.io-client'
import MsgpackParser from 'socket.io-msgpack-parser'

const SAMPLE_RATE = 16000
const WAV_PATH = process.argv[2] || 'D:\\Users\\AA\\Music\\请听到叮的声音后，匀速自然朗读：123456789.wav'
const SERVER = process.argv[3] || 'http://127.0.0.1:4000'
const PROVIDER = process.argv[4] || 'qwen'

function parseWav(buf: Buffer) {
    const ascii = (o: number, n: number) => buf.subarray(o, o + n).toString('ascii')
    if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('not wav')
    let off = 12
    let channels = 1
    let sampleRate = 16000
    let bits = 16
    let data = buf.subarray(44)
    while (off + 8 <= buf.length) {
        const id = ascii(off, 4)
        const size = buf.readUInt32LE(off + 4)
        if (id === 'fmt ') {
            channels = buf.readUInt16LE(off + 10)
            sampleRate = buf.readUInt32LE(off + 12)
            bits = buf.readUInt16LE(off + 22)
        } else if (id === 'data') {
            data = buf.subarray(off + 8, off + 8 + size)
            break
        }
        off += 8 + size + (size % 2)
    }
    return { channels, sampleRate, bits, data }
}

function toMono16k(pcm: Buffer, sampleRate: number, channels: number, bits: number): Buffer {
    if (bits !== 16) throw new Error(`only 16-bit pcm, got ${bits}`)
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
    let mono: Int16Array
    if (channels === 1) {
        mono = samples
    } else {
        const frames = Math.floor(samples.length / channels)
        mono = new Int16Array(frames)
        for (let i = 0; i < frames; i++) {
            let sum = 0
            for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
            mono[i] = sum / channels
        }
    }
    if (sampleRate === SAMPLE_RATE) return Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength)
    const ratio = sampleRate / SAMPLE_RATE
    const length = Math.round(mono.length / ratio)
    const out = new Int16Array(length)
    for (let i = 0; i < length; i++) {
        const src = i * ratio
        const i0 = Math.floor(src)
        const i1 = Math.min(i0 + 1, mono.length - 1)
        const t = src - i0
        out[i] = mono[i0] * (1 - t) + mono[i1] * t
    }
    return Buffer.from(out.buffer)
}

async function main() {
    if (!fs.existsSync(WAV_PATH)) throw new Error(`file not found: ${WAV_PATH}`)
    const raw = fs.readFileSync(WAV_PATH)
    const wav = parseWav(raw)
    const pcm = toMono16k(wav.data, wav.sampleRate, wav.channels, wav.bits)
    console.log(`file=${path.basename(WAV_PATH)} wav=${wav.sampleRate}Hz ${wav.channels}ch ${wav.bits}bit data=${wav.data.length} pcm16k=${pcm.length}`)

    const sessionId = `slice-${Date.now()}`
    const socket = io(SERVER, {
        transports: ['websocket'],
        parser: MsgpackParser
    })

    const texts: string[] = []
    let ended: { ok: boolean; text?: string; error?: string } | null = null

    await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('connect timeout')), 8000)
        socket.once('connect', () => {
            clearTimeout(t)
            resolve()
        })
        socket.once('connect_error', err => {
            clearTimeout(t)
            reject(err)
        })
    })
    console.log(`connected ${socket.id}`)

    socket.on('stt:data', (d: { text?: string }) => {
        if (d?.text) {
            texts.push(d.text)
            console.log(`data: ${d.text}`)
        }
    })
    socket.on('stt:error', (d: { error?: string }) => {
        console.error(`error: ${d.error}`)
        ended = { ok: false, error: d.error }
    })
    socket.on('stt:ended', (d: { success?: boolean; text?: string; error?: string }) => {
        ended = { ok: d.success !== false, text: d.text, error: d.error }
    })

    await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('start timeout')), 15000)
        socket.once('stt:started', (d: { success?: boolean; error?: string; provider?: string }) => {
            clearTimeout(t)
            if (d.success === false) reject(new Error(d.error || 'start failed'))
            else {
                console.log(`started provider=${d.provider}`)
                resolve()
            }
        })
        socket.once('stt:error', (d: { error?: string }) => {
            clearTimeout(t)
            reject(new Error(d.error || 'start error'))
        })
        socket.emit('stt:start', {
            deviceSN: 'slice-test',
            sessionId,
            format: 'pcm',
            provider: PROVIDER,
            language: 'zh-CN'
        })
    })

    const step = 3200
    let sent = 0
    for (let i = 0; i < pcm.length; i += step) {
        const slice = pcm.subarray(i, Math.min(i + step, pcm.length))
        socket.emit('stt:audio', {
            deviceSN: 'slice-test',
            sessionId,
            format: 'pcm',
            audio: [slice]
        })
        sent += slice.length
        await new Promise(r => setTimeout(r, 100))
    }
    console.log(`sent ${sent} bytes in ${Math.ceil(pcm.length / step)} slices`)

    socket.emit('stt:end', { deviceSN: 'slice-test', sessionId, end: true })
    const deadline = Date.now() + 20000
    while (!ended && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100))
    }
    socket.disconnect()
    const summary = ended as { ok: boolean; text?: string; error?: string } | null
    if (!summary) throw new Error('end timeout')
    console.log(`ended ok=${summary.ok} text=${summary.text || texts.at(-1) || '(empty)'} error=${summary.error || ''}`)
    if (!summary.ok) process.exit(1)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
