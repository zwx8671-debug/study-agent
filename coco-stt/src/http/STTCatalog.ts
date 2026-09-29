/** @format */

import { existsSync } from 'fs'
import { resolve } from 'path'
import { env } from '@config/env'
import { STTServiceType } from '@interface/ISTT'
import { STTFactory } from '@stt/STTFactory'
import type { ProviderCatalog, ProviderParamField, ProvidersData } from './STTHttpRoute.types'

const SAMPLE_RATE = 16000
const FORMAT = 'pcm'

const LANGUAGE_OPTIONS = [
    { value: 'zh-CN', label: 'zh-CN 中文' },
    { value: 'en-US', label: 'en-US English' },
    { value: 'ja-JP', label: 'ja-JP 日本語' }
]

const LANGUAGE_PARAM: ProviderParamField = {
    key: 'language',
    label: '语言',
    type: 'select',
    options: LANGUAGE_OPTIONS,
    defaultValue: 'zh-CN'
}

const PROVIDER_META: Record<
    STTServiceType,
    { name: string; stream: boolean; http: boolean; file: boolean; params: ProviderParamField[] }
> = {
    [STTServiceType.Volcengine]: {
        name: '火山引擎',
        stream: true,
        http: true,
        file: true,
        params: [
            LANGUAGE_PARAM,
            { key: 'enableItn', label: 'ITN 数字规范化', type: 'boolean', defaultValue: true },
            { key: 'enablePunc', label: '标点', type: 'boolean', defaultValue: true },
            {
                key: 'resultType',
                label: '结果类型',
                type: 'select',
                options: [
                    { value: 'full', label: 'full 全量' },
                    { value: 'single', label: 'single 增量' }
                ],
                defaultValue: 'full'
            }
        ]
    },
    [STTServiceType.Azure]: {
        name: 'Azure',
        stream: true,
        http: true,
        file: false,
        params: [LANGUAGE_PARAM]
    },
    [STTServiceType.Qwen]: {
        name: 'Qwen',
        stream: true,
        http: true,
        file: false,
        params: [
            {
                ...LANGUAGE_PARAM,
                options: [{ value: 'auto', label: 'auto 自动检测' }, ...LANGUAGE_OPTIONS],
                defaultValue: 'zh-CN'
            }
        ]
    },
    [STTServiceType.Mock]: {
        name: 'Mock',
        stream: true,
        http: true,
        file: false,
        params: [LANGUAGE_PARAM]
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

/**
 * 全部提供商目录，供测试页切换识别引擎
 */
export function getProviderCatalog(): ProvidersData {
    const current = env.STT_SERVICE_TYPE || STTServiceType.Qwen
    const providers: ProviderCatalog[] = Object.values(STTServiceType).map(id => {
        const meta = PROVIDER_META[id]
        return {
            id,
            name: meta.name,
            format: FORMAT,
            sampleRate: SAMPLE_RATE,
            configured: STTFactory.isConfigured(id),
            stream: meta.stream,
            http: meta.http,
            file: meta.file,
            params: meta.params
        }
    })
    return {
        current,
        format: FORMAT,
        sampleRate: SAMPLE_RATE,
        socketioPort: env.SOCKETIO_PORT,
        pathPrefix: env.PATH_PREFIX,
        providers
    }
}
