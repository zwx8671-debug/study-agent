/** @format */
import { AudioResponse, ChatXml2Result, CommonUtils } from '@interface/ICommon'
import { Shell, ShellDeviceInfo } from '../libs/xml/Shell'
import { TTSBaseService } from '../libs/voice/TTSBaseService'
import { TTSFactory } from '../libs/voice/TTSFactory'
import AgentService from '@service/AgentService'
import { getInstanceByToken } from 'fastify-decorators'
import { PassThrough } from 'stream'
import { env } from '@config/env'
import fs from 'fs'
import $ from '@utils/util'

export class TTSService {
    static async parseByLoopWithAudio2(
        xml: string,
        needRoot: boolean,
        shellDeviceInfo: ShellDeviceInfo
    ): Promise<ChatXml2Result> {
        return TTSService.parseByLoopWithAudio(
            xml,
            needRoot,
            shellDeviceInfo.agentId,
            shellDeviceInfo.sessionId,
            shellDeviceInfo.deviceSN
        )
    }

    /**
     * 解析 XML 并生成带音频的结果
     * 通过 Shell loop 处理 XML，同时生成文本 FuncToken 和音频 FuncToken
     * @param xml - 要解析的 XML 字符串
     * @param needRoot - 是否需要保留根元素
     * @param agentId - Agent ID ,如果要用trigger、save、prompt等标签一定要入参
     * @param sessionId - 会话 ID ,如果要用trigger、save、prompt等标签一定要入参
     * @param deviceSN - 设备序列号 ,如果要用trigger、save、prompt等标签一定要入参
     * @returns 包含文本和音频 FuncToken 的结果对象
     */
    static async parseByLoopWithAudio(
        xml: string,
        needRoot: boolean,
        agentId: string,
        sessionId: string,
        deviceSN: string
    ): Promise<ChatXml2Result> {
        // 解析 XML 生成文本 FuncToken（不包含音频）
        const { textFuncTokens, errors } = await Shell.syncLoopParse(xml, needRoot, agentId, sessionId, deviceSN)
        if (errors.length > 0) {
            throw errors
        }

        // 创建 TTS 服务实例并建立连接
        const tts: TTSBaseService = TTSFactory.createTTSFromConfig(deviceSN)
        await tts.connect().then(() => {
            console.log('TTS connected... ...')
        })

        // 获取 AgentService 实例
        const agentService: AgentService = getInstanceByToken<AgentService>(AgentService)

        // 创建流式处理管道：socketLlmStream 输入文本，socketAudioStream 输出音频
        const socketLlmStream = new PassThrough()
        const socketAudioStream = new PassThrough()

        // 启动 TTS 处理流程
        agentService.processTTS(deviceSN, socketAudioStream, socketLlmStream, tts)

        // 将所有文本 FuncToken 写入 socketLlmStream
        for (const textFuncToken of textFuncTokens) {
            socketLlmStream.write($.stringify(textFuncToken))
        }
        // 结束 socketLlmStream 输入，触发 TTS 处理完成
        socketLlmStream.end('http')

        // 收集音频 FuncToken 到临时数组
        const audioFuncTokens: AudioResponse[] = []

        // 监听 socketAudioStream 的 data 事件，收集生成的音频 FuncToken
        socketAudioStream.on('data', chunk => {
            const func = $.json<AudioResponse>(chunk.toString())
            audioFuncTokens.push(func)
        })

        // 等待 socketAudioStream 处理完成
        await new Promise<void>(resolve => {
            socketAudioStream.once('end', () => {
                resolve()
            })
        })

        // 将 FuncToken 数组转换为 AudioResponse
        const audioResponse = CommonUtils.toAudioRes(audioFuncTokens)

        // 初始化返回结果对象
        const chatXml2Result: ChatXml2Result = {
            textFuncTokens: textFuncTokens,
            audioFuncTokens: audioResponse || { id: '', audio: [] }
        }

        // 测试用，正式服不用
        if (env.DEBUG == 'true') {
            fs.writeFileSync(
                `./audio.json`,
                new TextEncoder().encode(JSON.stringify(chatXml2Result.audioFuncTokens, null, 2))
            )
            fs.writeFileSync(`./llm.json`, new TextEncoder().encode(JSON.stringify(textFuncTokens, null, 2)))
        }

        // 销毁流
        socketLlmStream.removeAllListeners()
        socketAudioStream.removeAllListeners()
        // 返回包含文本和音频的完整结果
        return chatXml2Result
    }
}
