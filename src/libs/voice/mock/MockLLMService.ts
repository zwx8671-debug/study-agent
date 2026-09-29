/** @format */

import { Readable } from 'stream'
import { ChatResponse } from 'uniai'
import { v7 } from 'uuid'
import $ from '@utils/util'
import { getLogger } from '@utils/Logger'

const logger = getLogger('MockLLMService')

/**
 * Mock LLM 服务 - 策略模式实现
 * 不管输入什么，随机选择一段长文本
 * 一个字一个字的流式回复
 */
export class MockLLMService {
    // 预设长文本池
    private static readonly LONG_TEXT_POOL = [
        `人工智能技术正在深刻改变着我们的生活方式。从智能手机的语音助手，到自动驾驶汽车，再到医疗诊断系统，AI的应用已经渗透到社会的各个角落。机器学习算法能够从海量数据中学习模式，不断提升自己的性能。深度学习的突破使得计算机在图像识别、语音识别等领域达到甚至超越人类的水平。然而，AI的发展也带来了一些挑战，比如数据隐私、算法偏见、就业影响等问题。我们需要在推动技术进步的同时，也要关注这些社会影响，确保AI技术的发展能够造福全人类。`,

        `在现代社会中，终身学习已经成为一种必然趋势。科技的快速发展使得知识更新的速度越来越快，我们需要不断学习新的技能来适应变化。学习不仅仅是在学校里的事情，而是贯穿整个人生的过程。互联网为我们提供了前所未有的学习资源，在线课程、电子书籍、教学视频等让知识变得触手可及。但同时，如何在海量信息中筛选出有价值的内容，如何保持学习的动力和专注力，也是我们需要面对的挑战。培养良好的学习习惯，保持好奇心和求知欲，是终身学习的关键。`,

        `随着全球化的深入发展，跨文化交流变得越来越频繁和重要。不同文化背景的人们在商业、教育、艺术等各个领域进行着广泛的交流与合作。理解和尊重文化差异，培养跨文化沟通能力，已经成为现代人必备的素质。语言是文化交流的重要工具，学习外语不仅能帮助我们更好地与他人沟通，还能让我们从不同的视角看待世界。在全球化的时代，我们既要保持自己的文化特色，也要以开放的心态去学习和接纳其他文化，在交流中实现共同发展和进步。`,

        `健康的生活方式对于每个人都至关重要。规律的作息、均衡的饮食、适量的运动，这些看似简单的习惯，却能对我们的身心健康产生深远的影响。现代社会的快节奏生活常常让人忽视健康，长期的压力和不良习惯可能导致各种健康问题。我们需要更加重视身体发出的信号，及时调整生活方式。除了身体健康，心理健康也同样重要。保持积极乐观的心态，学会管理压力，培养良好的人际关系，都是维护心理健康的重要途径。健康是一切的基础，只有拥有健康的身心，我们才能更好地追求自己的目标和梦想。`,

        `创新是推动社会进步的重要动力。从历史上看，每一次重大的技术创新都会带来生产力的飞跃和社会的变革。创新不仅仅是科学家和工程师的事情，每个人都可以在自己的领域进行创新。创新思维需要我们突破常规，敢于尝试新的方法和途径。失败是创新过程中不可避免的一部分，重要的是从失败中学习，不断改进。在当今快速变化的时代，创新能力成为个人和组织竞争力的核心要素。我们需要培养创新意识，鼓励创新实践，营造有利于创新的环境和氛围。`,

        `环境保护是当今世界面临的重大挑战之一。气候变化、空气污染、水资源短缺、生物多样性丧失等问题日益严重，威胁着人类的可持续发展。保护环境不仅是政府和企业的责任，每个人都应该从自己做起，从日常生活中的小事做起。节约用水用电、减少使用一次性用品、垃圾分类、绿色出行，这些看似微不足道的行为，如果每个人都能坚持，就能产生巨大的环保效益。我们只有一个地球，保护环境就是保护我们自己和子孙后代的未来。让我们共同行动起来，为建设美丽的地球家园贡献自己的力量。`,

        `阅读是一种非常有益的习惯，它能够丰富我们的知识，开阔我们的视野，提升我们的思维能力。在信息爆炸的时代，虽然我们可以通过各种渠道获取信息，但深度阅读仍然是不可替代的。书籍能够提供系统化的知识和深入的思考，帮助我们更好地理解这个世界。阅读不仅仅是获取信息，更是一种思想的对话和心灵的滋养。无论是经典文学、历史传记，还是科学著作、哲学思考，不同类型的书籍都能给我们带来不同的启发。养成良好的阅读习惯，让阅读成为生活的一部分，我们将受益终生。`,

        `团队合作在现代工作中越来越重要。很多复杂的项目需要不同专业背景的人共同协作才能完成。有效的团队合作需要明确的目标、清晰的分工、良好的沟通和相互的信任。每个团队成员都应该充分发挥自己的优势，同时也要学会倾听和理解他人的观点。在团队中，冲突和分歧是不可避免的，关键是如何以建设性的方式解决这些问题。优秀的团队领导者能够激发成员的潜力，营造积极向上的团队氛围。通过团队合作，我们不仅能够取得更好的工作成果，还能从中学习和成长，建立宝贵的人际关系。`
    ]

    /**
     * 模拟聊天方法
     * 返回一个 Readable 流，逐字输出文本
     */
    public static async chat(): Promise<Readable> {
        // 随机选择一段长文本
        const text = this.getRandomLongText()
        logger.infoMsg(`Selected text (length: ${text.length} chars)`)
        logger.infoMsg(`Preview: ${text.substring(0, 50)}...`)

        await $.sleep(1000)

        // 创建一个可读流
        const stream = new Readable({
            read() {
                // 空实现，我们会手动 push 数据
            }
        })

        // 异步逐字推送数据
        this.pushTextCharByChar(stream, text)

        return stream
    }

    /**
     * 逐字推送文本到流
     * 模拟 LLM 的流式输出
     */
    private static async pushTextCharByChar(stream: Readable, text: string): Promise<void> {
        logger.infoMsg('Starting to stream text...')

        for (let i = 0; i < text.length; i = i + 2) {
            const char1 = text[i]
            const char2 = text[i + 1]

            const char3 = char1 + char2

            const chat: ChatResponse = {
                object: '',
                id: v7(),
                content: char3,
                promptTokens: 500,
                completionTokens: 250,
                totalTokens: 750,
                model: 'gpt-4.1'
            }
            // 推送单个字符
            stream.push($.stringify(chat))

            // 模拟延迟：每个字符间隔 10-50ms
            // 注意：中文字符和标点符号可以有不同的延迟
            await this.sleep(10 + Math.random() * 40)
        }

        // 所有字符发送完毕后，结束流
        stream.push(null)
        logger.infoMsg(`Stream ended, total ${text.length} chars sent`)
    }

    /**
     * 从长文本池中随机选择一个文本
     */
    private static getRandomLongText(): string {
        const index = Math.floor(Math.random() * this.LONG_TEXT_POOL.length)
        return this.LONG_TEXT_POOL[index]
    }

    /**
     * 辅助方法：延迟
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
