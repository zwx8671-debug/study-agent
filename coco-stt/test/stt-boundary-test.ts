/** @format */

/**
 * 边界测试：A1–A9 流式会话状态机 + 仍存在的 HTTP 同步接口。
 * 不测已删除的 /stt/file/submit、/stt/file/query。
 *
 *   pnpm test:boundary
 *   npx tsx test/stt-boundary-test.ts --skip-idle
 */

import fs from 'fs'
import path from 'path'
import { io, type Socket } from 'socket.io-client'
import MsgpackParser from 'socket.io-msgpack-parser'

const SAMPLE_RATE = 16000
const HTTP_BASE = process.env.STT_HTTP_URL || 'http://127.0.0.1:4002'
const IO_BASE = process.env.STT_IO_URL || 'http://127.0.0.1:4000'
const WAV_PATH = path.resolve(process.cwd(), 'assets/test-ui/samples/ding-123456789.wav')
const PROVIDERS = ['qwen', 'volcengine'] as const
const SKIP_IDLE = process.argv.includes('--skip-idle')
const IDLE_WAIT_MS = 31000
const START_TIMEOUT_MS = 15000
const END_TIMEOUT_MS = 20000

type Provider = (typeof PROVIDERS)[number]

interface CaseResult {
    id: string
    ok: boolean
    detail: string
}

const results: CaseResult[] = []

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

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function newSession() {
    return {
        deviceSN: 'boundary-test',
        sessionId: `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
}

function connectSocket(): Promise<Socket> {
    const socket = io(IO_BASE, {
        transports: ['websocket'],
        parser: MsgpackParser,
        reconnection: false
    })
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('socket connect timeout')), 8000)
        socket.once('connect', () => {
            clearTimeout(t)
            resolve(socket)
        })
        socket.once('connect_error', err => {
            clearTimeout(t)
            reject(err)
        })
    })
}

function once<T>(
    socket: Socket,
    event: string,
    timeoutMs: number
): { promise: Promise<T>; cancel: () => void } {
    let onEvent: ((payload: T) => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => {
        if (timer) clearTimeout(timer)
        if (onEvent) socket.off(event, onEvent)
    }
    const promise = new Promise<T>((resolve, reject) => {
        timer = setTimeout(() => {
            cancel()
            reject(new Error(`${event} timeout ${timeoutMs}ms`))
        }, timeoutMs)
        onEvent = (payload: T) => {
            cancel()
            resolve(payload)
        }
        socket.once(event, onEvent)
    })
    return { promise, cancel }
}

function waitSessionEvent<T extends { sessionId?: string }>(
    socket: Socket,
    event: string,
    sessionId: string,
    timeoutMs: number
): { promise: Promise<T>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onEvent = (payload: T) => {
        if (payload?.sessionId && payload.sessionId !== sessionId) return
        cleanup()
        resolveFn(payload)
    }
    let resolveFn: (payload: T) => void = () => undefined
    const cleanup = () => {
        if (timer) clearTimeout(timer)
        socket.off(event, onEvent)
    }
    const promise = new Promise<T>((resolve, reject) => {
        resolveFn = resolve
        timer = setTimeout(() => {
            cleanup()
            reject(new Error(`${event} timeout ${timeoutMs}ms`))
        }, timeoutMs)
        socket.on(event, onEvent)
    })
    return {
        promise,
        cancel: cleanup
    }
}

async function startSession(
    socket: Socket,
    provider: string,
    extras: Record<string, unknown> = {}
): Promise<{ sessionId: string; provider?: string }> {
    const attempts = 3
    let lastError = 'start failed'
    for (let i = 0; i < attempts; i++) {
        const { deviceSN, sessionId } = newSession()
        const started = waitSessionEvent<{ success?: boolean; error?: string; provider?: string; sessionId?: string }>(
            socket,
            'stt:started',
            sessionId,
            START_TIMEOUT_MS
        )
        const errored = waitSessionEvent<{ error?: string; sessionId?: string }>(
            socket,
            'stt:error',
            sessionId,
            START_TIMEOUT_MS
        )
        socket.emit('stt:start', {
            deviceSN,
            sessionId,
            format: 'pcm',
            provider,
            language: 'zh-CN',
            ...extras
        })
        try {
            const winner = await Promise.race([
                started.promise.then(d => ({ kind: 'started' as const, d })),
                errored.promise.then(d => ({ kind: 'error' as const, d }))
            ])
            if (winner.kind === 'started' && winner.d.success !== false) {
                return { sessionId, provider: winner.d.provider }
            }
            lastError = winner.d.error || `${winner.kind} success=${String((winner.d as { success?: boolean }).success)}`
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err)
        } finally {
            started.cancel()
            errored.cancel()
        }
        await sleep(400)
    }
    throw new Error(lastError)
}

function sendAudio(socket: Socket, sessionId: string, pcm: Buffer) {
    socket.emit('stt:audio', {
        deviceSN: 'boundary-test',
        sessionId,
        format: 'pcm',
        audio: [pcm]
    })
}

async function endSession(socket: Socket, sessionId: string): Promise<{ ended: boolean; error?: string }> {
    const ended = waitSessionEvent<{ success?: boolean; error?: string; text?: string; sessionId?: string }>(
        socket,
        'stt:ended',
        sessionId,
        END_TIMEOUT_MS
    )
    const errored = waitSessionEvent<{ error?: string; sessionId?: string }>(socket, 'stt:error', sessionId, END_TIMEOUT_MS)
    socket.emit('stt:end', { deviceSN: 'boundary-test', sessionId, end: true })
    try {
        const winner = await Promise.race([
            ended.promise.then(d => ({ kind: 'ended' as const, d })),
            errored.promise.then(d => ({ kind: 'error' as const, d }))
        ])
        if (winner.kind === 'ended') return { ended: winner.d.success !== false, error: winner.d.error }
        return { ended: false, error: winner.d.error }
    } finally {
        ended.cancel()
        errored.cancel()
    }
}

async function runCase(id: string, fn: () => Promise<string>): Promise<void> {
    await sleep(600)
    const started = Date.now()
    try {
        const detail = await fn()
        results.push({ id, ok: true, detail: `${detail} (${Date.now() - started}ms)` })
        console.log(`PASS ${id}  ${detail}`)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ id, ok: false, detail: message })
        console.log(`FAIL ${id}  ${message}`)
    }
}

async function withSocket<T>(fn: (socket: Socket) => Promise<T>): Promise<T> {
    const socket = await connectSocket()
    try {
        return await fn(socket)
    } finally {
        socket.removeAllListeners()
        socket.disconnect()
    }
}

async function httpJson(pathname: string, init: RequestInit): Promise<{ status: number; body: { code?: number; msg?: string; data?: unknown } }> {
    const res = await fetch(`${HTTP_BASE}${pathname}`, init)
    const body = (await res.json()) as { code?: number; msg?: string; data?: unknown }
    return { status: res.status, body }
}

async function main() {
    if (!fs.existsSync(WAV_PATH)) throw new Error(`missing wav: ${WAV_PATH}`)
    const raw = fs.readFileSync(WAV_PATH)
    const wav = parseWav(raw)
    const pcm = toMono16k(wav.data, wav.sampleRate, wav.channels, wav.bits)
    const tiny = pcm.subarray(0, 3200)
    const short = pcm.subarray(0, Math.min(pcm.length, 3200 * 8))

    console.log(`HTTP ${HTTP_BASE}`)
    console.log(`IO   ${IO_BASE}`)
    console.log(`wav  ${path.basename(WAV_PATH)} pcm=${pcm.length}B`)
    console.log('')

    // ---------- A 会话状态机 ----------
    await runCase('A1 未 start 就 audio', async () => {
        return withSocket(async socket => {
            const { sessionId } = newSession()
            const errored = once<{ error?: string }>(socket, 'stt:error', 4000)
            sendAudio(socket, sessionId, tiny)
            const err = await errored.promise
            if (!err.error) throw new Error('expected stt:error')
            return err.error
        })
    })

    await runCase('A2 未 start 就 end，连接仍可用', async () => {
        return withSocket(async socket => {
            const first = newSession()
            let gotEnded = false
            socket.once('stt:ended', () => {
                gotEnded = true
            })
            socket.emit('stt:end', { deviceSN: first.deviceSN, sessionId: first.sessionId, end: true })
            await sleep(800)
            if (gotEnded) throw new Error('unexpected stt:ended')
            const started = await startSession(socket, 'qwen')
            const end = await endSession(socket, started.sessionId)
            if (!end.ended && !end.error) throw new Error('follow-up session did not settle')
            return 'no ended on orphan end; later start ok'
        })
    })

    for (const provider of PROVIDERS) {
        await runCase(`A3 ${provider} 二次 start 被拒，原会话可继续`, async () => {
            return withSocket(async socket => {
                const first = await startSession(socket, provider)
                const errored = once<{ error?: string }>(socket, 'stt:error', 4000)
                socket.emit('stt:start', {
                    deviceSN: 'boundary-test',
                    sessionId: `dup-${Date.now()}`,
                    format: 'pcm',
                    provider
                })
                const err = await errored.promise
                if (!err.error?.includes('一次链接')) throw new Error(`unexpected error: ${err.error}`)
                sendAudio(socket, first.sessionId, short)
                await sleep(200)
                const end = await endSession(socket, first.sessionId)
                if (!end.ended && !end.error) throw new Error('first session did not settle')
                return err.error
            })
        })

        await runCase(`A4 ${provider} start 后立刻 end，随后能再 start`, async () => {
            return withSocket(async socket => {
                const first = await startSession(socket, provider)
                const firstEnd = await endSession(socket, first.sessionId)
                const second = await startSession(socket, provider)
                sendAudio(socket, second.sessionId, tiny)
                const secondEnd = await endSession(socket, second.sessionId)
                if (!secondEnd.ended && !secondEnd.error) throw new Error('second session did not settle')
                return `first=${firstEnd.ended ? 'ended' : firstEnd.error}; second settled`
            })
        })

        await runCase(`A5 ${provider} 只发 1 帧后 end`, async () => {
            return withSocket(async socket => {
                const started = await startSession(socket, provider)
                sendAudio(socket, started.sessionId, tiny)
                await sleep(150)
                const end = await endSession(socket, started.sessionId)
                if (!end.ended && !end.error) throw new Error('session hung')
                return end.ended ? 'ended' : `error ${end.error}`
            })
        })
    }

    await runCase('A7 中途断连后新连接可 start', async () => {
        const socket = await connectSocket()
        const started = await startSession(socket, 'qwen')
        sendAudio(socket, started.sessionId, short)
        socket.disconnect()
        return withSocket(async next => {
            const again = await startSession(next, 'qwen')
            sendAudio(next, again.sessionId, tiny)
            const end = await endSession(next, again.sessionId)
            if (!end.ended && !end.error) throw new Error('new session hung')
            return 'reconnect start ok'
        })
    })

    await runCase('A8 end 后再 audio/end 不崩，且能再 start', async () => {
        return withSocket(async socket => {
            const first = await startSession(socket, 'qwen')
            sendAudio(socket, first.sessionId, tiny)
            await endSession(socket, first.sessionId)
            sendAudio(socket, first.sessionId, tiny)
            socket.emit('stt:end', { deviceSN: 'boundary-test', sessionId: first.sessionId, end: true })
            await sleep(400)
            const second = await startSession(socket, 'qwen')
            const end = await endSession(socket, second.sessionId)
            if (!end.ended && !end.error) throw new Error('restart after late end hung')
            return 'late audio/end ignored; restart ok'
        })
    })

    await runCase('A9 非法 provider 失败后同一连接可再 start', async () => {
        return withSocket(async socket => {
            const { sessionId } = newSession()
            const errored = once<{ error?: string }>(socket, 'stt:error', 4000)
            socket.emit('stt:start', {
                deviceSN: 'boundary-test',
                sessionId,
                format: 'pcm',
                provider: 'not-a-provider'
            })
            const err = await errored.promise
            if (!err.error?.toLowerCase().includes('provider') && !err.error?.includes('Unsupported')) {
                throw new Error(`unexpected error: ${err.error}`)
            }
            const started = await startSession(socket, 'qwen')
            const end = await endSession(socket, started.sessionId)
            if (!end.ended && !end.error) throw new Error('follow-up start hung')
            return err.error || 'invalid provider rejected'
        })
    })

    if (SKIP_IDLE) {
        results.push({ id: 'A6 start 后空闲 30s 被踢', ok: true, detail: 'skipped (--skip-idle)' })
        console.log('SKIP A6 start 后空闲 30s 被踢')
    } else {
        await runCase('A6 start 后空闲 30s 被踢', async () => {
            return withSocket(async socket => {
                await startSession(socket, 'qwen')
                const disconnected = new Promise<string>(resolve => {
                    socket.once('disconnect', reason => resolve(String(reason)))
                })
                const reason = await Promise.race([
                    disconnected,
                    sleep(IDLE_WAIT_MS + 2000).then(() => '')
                ])
                if (!reason) throw new Error('socket still connected after idle timeout')
                return `disconnect ${reason}`
            })
        })
    }

    // ---------- D 仍存在的 HTTP 同步接口（不含已删除的 submit/query）----------
    await runCase('D3 POST /stt/file/recognize 正常 wav', async () => {
        const { status, body } = await httpJson('/stt/file/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioData: raw.toString('base64'),
                audioFormat: 'wav',
                language: 'zh-CN',
                traceId: 'boundary-d3'
            })
        })
        if (status !== 200 || body.code !== 200) throw new Error(`HTTP ${status} ${body.msg}`)
        const text = (body.data as { text?: string } | undefined)?.text
        if (!text) throw new Error('empty text')
        return text
    })

    await runCase('D4 POST /stt/file/recognize 缺 url/audioData', async () => {
        const { status, body } = await httpJson('/stt/file/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'zh-CN', traceId: 'boundary-d4' })
        })
        if (status !== 400 && body.code !== 400) throw new Error(`expected 400, got HTTP ${status} code=${body.code}`)
        return body.msg || '400'
    })

    await runCase('D5 POST /stt/file/recognize 非法音频', async () => {
        const { status, body } = await httpJson('/stt/file/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioData: 'not-valid-audio',
                audioFormat: 'wav',
                traceId: 'boundary-d5'
            })
        })
        if (status < 400 && (body.code ?? 200) < 400) {
            throw new Error(`expected failure, got HTTP ${status} code=${body.code}`)
        }
        return `HTTP ${status} ${body.msg || ''}`.trim()
    })

    await runCase('D6 POST /stt/recognize 空 body', async () => {
        const { status, body } = await httpJson('/stt/recognize?traceId=boundary-d6', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: Buffer.alloc(0)
        })
        if (status !== 400 && body.code !== 400) throw new Error(`expected 400, got HTTP ${status} code=${body.code}`)
        return body.msg || '400'
    })

    await runCase('D7 POST /stt/recognize 非 WAV', async () => {
        const { status, body } = await httpJson('/stt/recognize?traceId=boundary-d7', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: Buffer.from('this is not a wav file')
        })
        if (status !== 400 && body.code !== 400) throw new Error(`expected 400, got HTTP ${status} code=${body.code}`)
        return body.msg || '400'
    })

    console.log('\n----------')
    const failed = results.filter(r => !r.ok)
    const skipped = results.filter(r => r.detail.startsWith('skipped'))
    console.log(`total=${results.length} pass=${results.filter(r => r.ok).length} fail=${failed.length} skip=${skipped.length}`)
    if (failed.length) {
        failed.forEach(r => console.log(`  FAIL ${r.id}: ${r.detail}`))
        process.exit(1)
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
