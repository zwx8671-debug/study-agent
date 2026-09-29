/** @format */
import { LLM_COUNT, Shell } from '../../libs/xml/Shell'
import { ChatSession } from '@service/dto/IAgent.dto'
import { ChatMessage, ChatModelProvider, ChatResponse, ChatRoleEnum, type Prompt } from 'uniai'
import { PomAgentWithDialogsVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { getLogger, Logger } from '@utils/Logger'
import ai from '@utils/uniai'

import { promptManager, PromptManager } from '../../libs/xml/PromptManager'
import $ from '@utils/util'
import { v7 } from 'uuid'
import { conversationMessagesHttpdao } from '@httpdao/cocoadmin/ConversationMessagesHttpdao'
import { Step, traceContext } from '@utils/TraceContext'
import { Readable } from 'stream'
import { lockManager, LockManager } from '@utils/LockManager'
import { Inject, Service } from 'fastify-decorators'
import PomAgentService from '@service/PomAgentService'
import { ShortTermMemoryRedisService } from '@service/redis/ShortTermMemoryRedisService'
import { SocketCommonResponse } from '../../common/SocketCommonResponse'
import { ChatAssistantResponse, LampSearchMemoryVideoItem, ResponseEvent, ResponseFlag } from '@interface/IAgent'
import type { RetrieveMemoryItem } from '@httpdao/mem/LampMemoryHttpdao'
import { infraFileHttpdao } from '@httpdao/cocoadmin/InfraFileHttpdao'
import { AuthType, CoCoNamespace } from '@interface/ICommon'

/**
 * 在 Prompt 树中递归查找 title === lamp_search_memory 的节点（与 POM new Prompt(node.name, node.prompt) 一致），返回其 content（routine 写入的 JSON 原样）
 */
function tryGetLampSearchMemoryPayloadString(extPrompt: Prompt): string | undefined {
    const nodes = extPrompt.getByTitle('lamp_search_memory', true)
    for (const n of nodes) {
        const c = n.content?.trim()
        if (c) return c
    }
    return undefined
}

/**
 * 将 lamp_search_memory routine 返回的原始 JSON 数组字符串压缩为 [{ title, summary, video_path }]，
 * video_path 优先 memory_card.video_path，否则取 memory_card.video_url 的 pathname。
 */
function transformLampSearchMemoryPayload(raw?: string): LampSearchMemoryVideoItem[] {
    try {
        if (!raw) {
            return []
        }
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) {
            return []
        }
        const rows = parsed as RetrieveMemoryItem[]

        return rows
            .map(
                item =>
                    ({
                        title: item.title ?? '',
                        summary: item.summary ?? '',
                        video_path: item.memory_card?.video_path ?? ''
                    }) as LampSearchMemoryVideoItem
            )
            .filter(item => item.video_path.trim() !== '')
    } catch {
        return []
    }
}

@Service()
export class AgentPrompt {
    /** Prompt 管理器，用于管理AI提示词 */
    private promptManager: PromptManager = promptManager
    /** 锁管理器，用于控制会话并发 */
    private lockManager: LockManager = lockManager
    /** 日志记录器 */
    private log: Logger = getLogger(AgentPrompt.name)
    @Inject(PomAgentService)
    private pomAgentService!: PomAgentService
    @Inject(ShortTermMemoryRedisService)
    private shortTermMemoryService!: ShortTermMemoryRedisService
    /**
     * 设置Shell 接流 事件监听器
     * @param shell
     * @param lock
     * @param deviceSN
     * @param messages 每次 prompt 事件都是基于前一次修改后的数据
     * @param agent
     * @param provider
     * @param model
     */
    shellPromptEvent(
        shell: Shell,
        lock: ChatSession,
        deviceSN: string,
        messages: ChatMessage[],
        agent: PomAgentWithDialogsVO,
        provider: string,
        model: string
    ) {
        shell.on('prompt', async (extPrompt, routineNames: string[]) => {
            console.log(routineNames, extPrompt)
            if (shell.llmCount >= LLM_COUNT) {
                return
            }

            // 保存 extPrompt 到 Redis 作为短期记忆，TTL 5分钟
            try {
                await this.shortTermMemoryService.addMemory(deviceSN, extPrompt.toString(), 300)
                this.log.infoMsg(`短期记忆已保存，设备SN: ${deviceSN}`)
            } catch (error) {
                this.log.errorMsg('保存短期记忆失败:', { errorMsg: error })
            }

            // 等待上个流结束，最多等待1000ms
            let five = 0
            while (shell.llmCount > shell.llmEndCount && five <= 10) {
                five++
                await $.sleep(100)
            }
            this.log.infoMsg(
                `等待上个流结束[llmCount:${shell.llmCount}][llmEndCount:${shell.llmEndCount}]]，等待时间：${five * 100}ms`
            )

            if (shell.llmCount > shell.llmEndCount) {
                // 强行end，如果没有end，超时1秒，Assistant保存不了数据库
                lock.llmStream?.emit('end')
                this.log.warnMsg(`强制结束LLM流，设备SN: ${deviceSN}`)
            }

            // 销毁上一个流
            lock.llmStream?.removeAllListeners()
            lock.llmStream?.destroy()

            // 增加接流次数
            shell.llmCount++

            // 接流携带上一轮llm的结果
            const content = shell.llmSet[shell.llmCount - 2] ? shell.llmSet[shell.llmCount - 2].llmRes : ''
            messages.push({
                role: ChatRoleEnum.ASSISTANT,
                content: content
            })

            // 携带 经过检索... 字符串
            const systemMsg = '经过检索...\n' + extPrompt
            messages.push({
                role: ChatRoleEnum.SYSTEM,
                content: systemMsg
            })

            const systemMsgId = v7()
            // 创建新的消息记录并插入数据库
            await conversationMessagesHttpdao.createMessage(
                agent.dialogs[0].id,
                ChatRoleEnum.SYSTEM,
                systemMsg,
                provider,
                model,
                agent.sessionId,
                systemMsgId
            )
            traceContext.updateContext({ messageId: systemMsgId, step: Step.SYSTEM })

            // 接流
            const startTime = Date.now()
            const [inputStream] = await Promise.all([
                ai
                    .chat(messages, { stream: true, provider: provider as ChatModelProvider, model })
                    .catch(error => {
                        this.log.errorMsg('LLM Chat error:', { errorMsg: error })
                        throw new Error(`LLM Chat failed: ${error.message}`)
                    })
                    .finally(() => {
                        this.log.infoMsg(`【接流】LLM Chat request finished, total time: ${Date.now() - startTime} ms`)
                    })
            ])
            if (!(inputStream instanceof Readable)) {
                throw new Error('LLM Chat inputStream is not Readable')
            }

            lock.llmStream = inputStream

            lock.llmStream.on('data', (chunk: Buffer) => {
                this.handleLLMData(chunk, shell, deviceSN)
            })
            lock.llmStream.once('end', async () => {
                this.log.infoMsg('【接流】LLM Chat 响应流结束')
                const systemReplyMsgId = v7()
                traceContext.updateContext({ messageId: systemReplyMsgId, step: Step.SYSTEM_REPLY })

                // extPrompt 为 POM 解析结果；routineNames 为本次 XML 中实际出现的 routines 标签名（见 POManager.collectRoutineTagNames）
                // 仅当包含 lamp_search_memory 且能解析出其 JSON 返回值时，经压缩后由 CHAT 下发（与 LLMStreamHandler 同通道）
                const lampVideo = tryGetLampSearchMemoryPayloadString(extPrompt)
                const items = transformLampSearchMemoryPayload(lampVideo)
                const itemJson = JSON.stringify(items)

                if (items.length > 0) {
                    try {
                        for (const item of items) {
                            item.video_url = await infraFileHttpdao.presignGetUrl(item.video_path)
                        }

                        SocketCommonResponse.successTo<ChatAssistantResponse>({
                            authType: AuthType.web,
                            ns: CoCoNamespace.Agent,
                            room: deviceSN,
                            event: ResponseEvent.CHAT,
                            data: {
                                id: traceContext.getTraceId(),
                                role: ChatRoleEnum.ASSISTANT,
                                flag: ResponseFlag.CHUNK,
                                video: items,
                                timestamp: Date.now()
                            },
                            msg: 'lamp_search_memory 精简视频列表'
                        })
                    } catch (error) {
                        this.log.errorMsg('lamp 视频预签名填充失败', { errorMsg: error })
                    }
                }

                this.handlerEndEvent(shell, deviceSN, systemReplyMsgId, lock, agent, provider, model, itemJson)
            })
        })
    }

    public handlerEndEvent(
        shell: Shell,
        deviceSN: string,
        messageId: string,
        lock: ChatSession,
        agent: PomAgentWithDialogsVO,
        provider: string,
        model: string,
        video?: string
    ) {
        // 响应结束
        if (!shell.currentLLMFlag || shell.llmCount >= LLM_COUNT) {
            this.log.infoMsg(`第${shell.llmCount}轮接流终止`)
            lock.shell?.emit('llmEnd')
        }

        // 保存信息
        // 保存到数据库
        this.pomAgentService.createMsgAndSummaryAndGenTitle(
            deviceSN,
            agent.dialogs[0].id,
            ChatRoleEnum.ASSISTANT,
            shell.currentLLMRes,
            provider,
            model,
            agent.sessionId,
            false,
            messageId,
            // tokenCount 用 cocoadmin 的 Token计数器，但这个先不删除
            shell.currentLLMAssistanceToken,
            shell.currentLLMRequestId,
            video
        )
        shell.completeOneMsg(messageId)

        // LLM回复结束
        shell.llmEndCount++

        this.log.infoMsg(`[finish-${shell.llmCount}轮-LLM]结束了处理 currentLLMRequestId[${shell.currentLLMRequestId}]`)
    }

    /**
     * 处理 LLM 响应数据
     * @param chunk
     * @param shell
     * @param deviceSN
     * @private
     */
    public handleLLMData(chunk: Buffer<ArrayBufferLike>, shell: Shell, deviceSN: string) {
        try {
            const message = $.json<ChatResponse>(chunk.toString())

            shell.setLlmSetRequestId(message.id, message.promptTokens, message.completionTokens)
            shell.addLlmSetContent(message.content)
            // 添加到shell add进行XML解析
            shell.add(message.content)
        } catch (error) {
            this.log.errorMsg('Error parsing chat stream chunk:', { errorMsg: error })
            this.lockManager.interrupt(deviceSN, error).catch(error => {
                this.log.errorMsg('Error interrupting chat session:', { errorMsg: error })
            })
        }
    }
}
