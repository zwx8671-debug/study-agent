/** @format */

// UniAI 统一AI接口相关类型
import { ChatMessage, ChatModelProvider, ChatResponse, ChatRoleEnum } from 'uniai'
// Fastify 装饰器，用于服务注入
import { Service } from 'fastify-decorators'
// 日志工具
import { getLogger, type Logger } from '@utils/Logger'
// 统一AI接口实例
import ai from '@utils/uniai'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@service/ConfigService'
import { ConversationMessageVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'

/**
 * 小型提示词服务类
 * 专门负责处理简单的AI提示词任务，如生成对话标题、摘要等轻量级AI交互
 */
@Service()
export class SmallPromptService {
    /** 日志记录器 */
    private log: Logger = getLogger(SmallPromptService.name)

    /**
     * 根据对话的第一个问题生成对话标题
     * 使用AI模型根据用户的第一个问题自动生成简洁的对话标题
     * @param question 用户的问题文本
     * @param provider AI模型提供商，默认为OpenAI
     * @param model AI模型名称，默认为GPT-4
     * @returns 生成的对话标题，失败时返回原始问题的截取文本
     */
    async generateDialogTitle(
        question: string,
        provider: string = DEFAULT_PROVIDER,
        model: string = DEFAULT_MODEL
    ): Promise<string> {
        let resultText = ''
        try {
            // 构建用于生成标题的提示词
            const prompt: ChatMessage[] = [
                {
                    role: ChatRoleEnum.SYSTEM,
                    content: `你是一个助手，请根据问题生成一个对话的标题，且控制在10字以内`
                },
                {
                    role: ChatRoleEnum.USER,
                    content: `问题：${question}`
                }
            ]

            this.log.infoMsg(`生成对话标题请求 - provider=${provider}, model=${model}`)
            // 同步获取AI响应（非流式）
            const chatResponse = (await ai.chat(prompt, {
                stream: false,
                provider: provider as ChatModelProvider,
                model
            })) as ChatResponse
            resultText = chatResponse.content.trim()

            // 如果生成的标题为空，使用原始问题的前10个字符作为标题
            if (resultText.length === 0) {
                resultText = question.substring(0, 10)
                this.log.warnMsg(`AI生成标题为空，使用问题截取：${resultText}`)
            } else {
                this.log.infoMsg(`成功生成对话标题：${resultText}`)
            }
        } catch (error) {
            this.log.errorMsg('生成对话标题时发生错误:', { errorMsg: error })
            // 发生错误时使用原始问题的前10个字符作为标题
            resultText = question.substring(0, 10)
        }
        return resultText
    }

    /**
     * 生成对话历史摘要
     * 根据多轮对话内容生成综合性摘要
     * @param conversationTurns 对话轮次数组
     * @param previousSummary 上一次的摘要内容（可选）
     * @param provider AI模型提供商，默认为OpenAI
     * @param model AI模型名称，默认为GPT-4
     * @returns 生成的历史摘要
     */
    async generateHistorySummary(
        conversationTurns: ConversationMessageVO[],
        previousSummary?: string,
        provider: string = DEFAULT_PROVIDER,
        model: string = DEFAULT_MODEL
    ): Promise<string> {
        try {
            /** 累积摘要的最大长度（字数） */
            const summarySize: number = 500
            // 过滤出 role 和 content 字段
            const filteredTurns = conversationTurns.map(turn => ({
                role: turn.role,
                content: turn.content
            }))
            const turnsJson = JSON.stringify(filteredTurns)
            /** 用于生成摘要的提示词 */
            const summaryPrompt: string = `
                # 任务说明
                请基于以下输入：以AI为第一人称整合[历史摘要]与[新对话块]，保留未被覆盖的历史信息，衔接新增内容（≤${summarySize}字）
                
                ## 输入数据
                [历史摘要]: ${previousSummary || ''}
                [新对话块]: ${turnsJson}
                
                ## 输出要求：输出是字符串
        
                ## 合法输出示例：用户张明从医生转教师，其子需报名A校社团
            `

            const prompt: ChatMessage[] = [
                {
                    role: ChatRoleEnum.SYSTEM,
                    content: summaryPrompt
                }
            ]

            this.log.infoMsg(
                `生成对话历史摘要请求 - provider=${provider}, model=${model}, turns=${conversationTurns.length}`
            )
            // 同步获取AI响应（非流式）
            const chatResponse = (await ai.chat(prompt, {
                stream: false,
                provider: provider as ChatModelProvider,
                model
            })) as ChatResponse
            return chatResponse.content
        } catch (error) {
            this.log.errorMsg(`${provider} - ${model} 生成对话历史摘要时发生错误:`, { errorMsg: error })
            // 发生错误时使用简单的备用摘要
            const topics = conversationTurns
                .slice(0, 3)
                .map(turn => turn.content.substring(0, 15))
                .join('、')

            return `对话内容涉及：${topics}等话题`
        }
    }
}

// 导出服务实例
export const smallPromptService = new SmallPromptService()
