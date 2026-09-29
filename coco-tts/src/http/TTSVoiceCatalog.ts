/** @format */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { TTSFactory, TTSServiceType } from '@tts/TTSFactory'
import { env } from '@config/env'
import type { ProviderCatalog, VoiceItem } from './TTSHttpRoute.types'

interface AssetVoice {
    voice_name: string
    voice_type: string
    language?: string
    emotion?: string[]
    group?: string
}

interface AssetVoiceFile {
    voice_data?: AssetVoice[]
}

const PROVIDER_META: Record<TTSServiceType, { name: string; file?: string; fallback: VoiceItem[] }> = {
    [TTSServiceType.Volcengine]: {
        name: '火山引擎',
        file: 'volc_tts.json',
        fallback: []
    },
    [TTSServiceType.Azure]: {
        name: 'Azure',
        file: 'azure_tts_simplified.json',
        fallback: []
    },
    [TTSServiceType.Qwen]: {
        name: 'Qwen',
        file: 'qwen_tts.json',
        fallback: [
            {
                name: '龙安欢',
                speaker: 'longanhuan_v3.6',
                language: '中文',
                emotions: [],
                group: 'realtime'
            },
            { name: '芊悦', speaker: 'Cherry', language: '中文', emotions: [], group: 'http' }
        ]
    },
    [TTSServiceType.Mock]: {
        name: 'Mock',
        fallback: [{ name: '模拟音色', speaker: 'mock-speaker', language: 'zh', emotions: [] }]
    }
}

/**
 * 解析 assets 目录下的文件（兼容 tsx 与 dist 运行）
 */
export function resolveAsset(...parts: string[]): string | undefined {
    const candidates = [
        resolve(process.cwd(), 'assets', ...parts),
        resolve(process.cwd(), 'dist', 'assets', ...parts)
    ]
    return candidates.find(file => existsSync(file))
}

function loadVoices(file?: string, fallback: VoiceItem[] = []): VoiceItem[] {
    if (!file) return fallback
    const path = resolveAsset(file)
    if (!path) return fallback

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as AssetVoiceFile
        const items = (parsed.voice_data || []).map(item => ({
            name: item.voice_name,
            speaker: item.voice_type,
            language: item.language || '',
            emotions: item.emotion || [],
            group: item.group
        }))
        return items.length > 0 ? items : fallback
    } catch {
        return fallback
    }
}

/**
 * 按提供商 + speaker 查找音色（含 group，用于区分 Qwen realtime / http）
 */
export function findProviderVoice(providerId: string, speaker?: string): VoiceItem | undefined {
    if (!speaker) return undefined
    const type = (Object.values(TTSServiceType) as string[]).includes(providerId)
        ? (providerId as TTSServiceType)
        : undefined
    if (!type) return undefined
    const meta = PROVIDER_META[type]
    return loadVoices(meta.file, meta.fallback).find(item => item.speaker === speaker)
}

/**
 * 全部提供商的音色目录，供测试页切换试听
 */
export function getVoiceCatalog(): { current: string; providers: ProviderCatalog[] } {
    const current = env.TTS_SERVICE_TYPE
    const providers = Object.values(TTSServiceType).map(id => {
        const meta = PROVIDER_META[id]
        const audio = TTSFactory.getAudioMetaFor(id)
        return {
            id,
            name: meta.name,
            format: audio.format,
            sampleRate: audio.sampleRate,
            defaultSpeaker: TTSFactory.getDefaultSpeakerFor(id),
            configured: TTSFactory.isConfigured(id),
            voices: loadVoices(meta.file, meta.fallback)
        }
    })
    return { current, providers }
}
