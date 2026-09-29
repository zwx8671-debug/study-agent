/** @format */
// noinspection JSNonASCIINames

/**
 * 提示词管理器
 *
 * 从提示词目录加载和管理所有提示词模板，支持静态文件加载和数据库动态加载
 * 提供多层次的提示词组合功能，包括系统级、产品级、Agent级和例程级
 *
 * @format
 */

import path from 'path'
import { readdirSync, readFileSync, statSync } from 'fs'
import { Prompt } from 'uniai'
import { path as ROOT } from 'app-root-path'
import { getLogger } from '@utils/Logger'
import { RoutineService } from '@service/RoutineService'
import { memoryHttpdao } from '@httpdao/mem/MemoryHttpdao'
import { lampMemoryHttpdao } from '@httpdao/mem/LampMemoryHttpdao'
import { XmlVoiceElementHandler } from './handler/XmlVoiceElementHandler'
import { XmlSaveElementHandler } from './handler/XmlSaveElementHandler'
import { getInstanceByToken } from 'fastify-decorators'
import { PromptData, StateData } from '@interface/IAgent'
import { systemPromptHttpdao, SystemPromptInnerRespVO } from '@httpdao/cocoadmin/SystemPromptHttpdao'
import { deviceAgentRunnerHttpdao } from '@httpdao/cocoadmin/DeviceAgentRunnerHttpdao'
import { deviceProductHttpdao } from '@httpdao/cocoadmin/DeviceProductHttpdao'
import { DeviceAgentRunnerVO, PomTriggerVO } from '@httpdao/cocoadmin/common/cocoadmin.interface'
import { pomAgentHttpdao } from '@httpdao/cocoadmin/PomAgentHttpdao'
import { TriggerInterface } from './handler/trigger/TriggerInterface'
import { ShortTermMemoryRedisService } from '@service/redis/ShortTermMemoryRedisService'
import { TriggerPromptName } from '@interface/IAgentTrigger'
import { TriggerPromptRedisService } from '@service/redis/TriggerPromptRedisService'
import { characterHttpdao } from '@httpdao/cocoadmin/CharacterHttpdao'
import { DeviceResourcePromptRedisService } from '@service/redis/DeviceResourcePromptRedisService'
import { deviceFamilyHttpdao } from '@httpdao/cocoadmin/DeviceFamilyHttpdao'

/** 默认提示词文件夹路径 */
const DEFAULT_PROMPT_PATH = path.resolve(`${ROOT}/assets/PE-V3`)

// noinspection NonAsciiCharacters
/**
 * 提示词管理器类
 *
 * 负责加载、管理和组合各种提示词模板
 * 支持从文件系统和数据库加载提示词，提供统一的访问接口
 */
export class PromptManager {
    /** 提示词文件夹路径 */
    public path: string
    /** 日志记录器 */
    private log = getLogger(PromptManager.name)
    /** 例程服务 */
    private routineService: RoutineService = getInstanceByToken<RoutineService>(RoutineService)
    private triggerPromptRedisService: TriggerPromptRedisService =
        getInstanceByToken<TriggerPromptRedisService>(TriggerPromptRedisService)
    private deviceResourcePrompt: DeviceResourcePromptRedisService =
        getInstanceByToken<DeviceResourcePromptRedisService>(DeviceResourcePromptRedisService)

    /** 已加载的提示词缓存 */
    private readonly prompts: Map<string, Prompt> = new Map()

    /**
     * 构造函数
     * @param path - 提示词文件夹路径，默认为 assets/prompts
     */
    constructor(path: string = DEFAULT_PROMPT_PATH) {
        this.loadPrompts(path)
        this.path = path
    }

    /**
     * 加载指定目录下的所有提示词文件
     * @param basePath - 基础目录路径
     * @private
     */
    private loadPrompts(basePath: string): void {
        this.scanDirectory(basePath, basePath)
    }

    /**
     * 递归扫描目录，加载所有.md文件作为提示词模板
     * @param currentPath - 当前扫描的目录路径
     * @param basePath - 基础目录路径，用于计算相对路径
     * @private
     */
    private scanDirectory(currentPath: string, basePath: string): void {
        const entries = readdirSync(currentPath)

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry)
            const stat = statSync(fullPath)

            // 递归扫描子目录
            if (stat.isDirectory()) this.scanDirectory(fullPath, basePath)
            // 处理 .md 文件
            else if (stat.isFile() && entry.endsWith('.md')) this.loadPromptFile(fullPath, basePath)
        }
    }

    /**
     * 加载单个提示词文件并缓存到内存中
     * @param filePath - 文件完整路径
     * @param basePath - 基础目录路径，用于计算相对路径作为键名
     * @private
     */
    private loadPromptFile(filePath: string, basePath: string): void {
        const promptContent = readFileSync(filePath, 'utf-8')

        // 计算相对路径并移除 .md 后缀
        const relativePath = path.relative(basePath, filePath)
        const key = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')

        const prompt = Prompt.fromMarkdown(promptContent)
        this.prompts.set(key, prompt)
    }

    /**
     * 临时读取最新文件变更（不使用map缓存）
     * @param key - 提示词模板的键名（不包含.md后缀）
     * @returns 从文件加载的最新Prompt对象
     */
    load(key: string): Prompt {
        const text = readFileSync(path.join(this.path, `${key}.md`), 'utf-8')
        return Prompt.fromMarkdown(text)
    }

    /**
     * 获取指定路径的 Prompt
     * @param key - 提示词模板的键名
     * @returns 克隆的Prompt对象，如果缓存中不存在则从文件加载
     */
    get(key: string): Prompt {
        return this.prompts.get(key)?.clone() || this.load(key)
    }

    /**
     * 获取所有已加载的 Prompt 键名
     * @returns 所有已加载提示词的键名数组
     */
    keys(): string[] {
        return Array.from(this.prompts.keys())
    }

    /**
     * 检查是否存在指定键名的 Prompt
     * @param key - 要检查的提示词键名
     * @returns 是否存在该键名的提示词
     */
    has(key: string): boolean {
        return this.prompts.has(key)
    }

    /**
     * 获取所有 Prompts
     * @returns 所有已加载提示词的副本映射
     */
    all(): Map<string, Prompt> {
        return new Map(this.prompts)
    }

    /**
     * 重新加载 Prompts
     * @description 清空当前缓存并重新扫描加载所有提示词文件
     */
    reload(): void {
        this.prompts.clear()
        this.loadPrompts(this.path)
    }

    /**
     * Agent级别Prompt
     * @param agentId agent ID
     */
    async getAgentPromptByDB(agentId: string): Promise<Prompt> {
        let prompt = new Prompt('Agent Prompt', '')
        try {
            // 1、根据产品ID和nodeModuleName获取数据库的Routine列表
            const agent = await pomAgentHttpdao.getAgentById(agentId)
            // 2. 创建Prompt对象并返回，nodeModuleName作为 prompt_title
            if (agent) {
                prompt = new Prompt('用户提示词', agent.prompt)
            }
        } catch (error) {
            this.log.error(`Failed to get AgentPrompt for ${agentId}:`, error)
        }
        return prompt
    }

    /**
     * Product 级别Prompt
     * @param productId Product ID
     */
    async getProductPromptByDB(productId: number): Promise<Prompt> {
        let prompt = new Prompt('Product Prompt', '')
        try {
            // 1、根据产品ID和nodeModuleName获取数据库的Routine列表
            const product = await deviceProductHttpdao.findById(productId)
            // 2. 创建Prompt对象并返回，nodeModuleName作为 prompt_title
            if (product) {
                prompt = new Prompt('产品提示词', product.prompt)
            }
        } catch (error) {
            this.log.error(`Failed to get ProductPrompt for ${productId}:`, error)
        }
        return prompt
    }

    /**
     * 创建综合的AI提示词
     * 整合系统提示、产品配置、Agent配置、例程和记忆信息
     * @param productId 产品ID，默认为预设值
     * @param agentId Agent ID，默认为预设值
     * @param sessionId 会话ID，用于获取记忆信息，默认为预设值
     * @param deviceSN
     * @returns 完整的Markdown格式系统提示词
     * @private
     */
    public async getPrompt(
        productId: number | undefined,
        agentId: string | undefined,
        sessionId: string | undefined,
        deviceSN: string
    ): Promise<Prompt> {
        // 如果参数不完整，返回空Prompt
        if (!productId || !agentId || !sessionId) {
            this.log.warn(`getPrompt参数不完整: productId=${productId}, agentId=${agentId}, sessionId=${sessionId}`)
            return new Prompt('元指令', '')
        }
        return this.getPromptV4(productId, agentId, sessionId, deviceSN, 'master')
    }

    /**
     * 创建 Trigger 的AI提示词
     * 整合系统提示、产品配置、Agent配置、例程和记忆信息
     * @param productId 产品ID，默认为预设值
     * @param agentId Agent ID，默认为预设值
     * @param sessionId 会话ID，用于获取记忆信息，默认为预设值
     * @param deviceSN
     * @returns 完整的Markdown格式系统提示词
     * @private
     */
    public async getTriggerPrompt(
        productId: number | undefined,
        agentId: string | undefined,
        sessionId: string | undefined,
        deviceSN: string
    ): Promise<string> {
        // 如果参数不完整，返回空Prompt
        if (!productId || !agentId || !sessionId || !deviceSN) {
            this.log.warn(`getPrompt参数不完整: productId=${productId}, agentId=${agentId}, sessionId=${sessionId}`)
            return ''
        }
        return this.getTriggerPromptV4(productId, agentId, sessionId, deviceSN, 'trigger')
    }

    /**
     * 2025年11月3日 使用数据库 基于V3晓波版本
     * @param productId 产品ID，用于获取产品特定配置
     * @param agentId AgentID，用于获取Agent特定配置和相关技能
     * @param sessionId 会话ID，用于获取会话相关的记忆信息
     * @param deviceSN
     * @param type 提示词类型，可选值为 'master' 或 'trigger'
     * @returns Promise<Prompt> 返回构建好的Prompt对象
     */
    public async getPromptV4(
        productId: number,
        agentId: string,
        sessionId: string,
        deviceSN: string,
        type: string
    ): Promise<Prompt> {
        // cocolamp：需要 space_id 才能请求“最近记忆”
        let memoriesTask: Promise<Prompt | null>
        if (productId === 7) {
            memoriesTask = (async () => {
                try {
                    const family = await deviceFamilyHttpdao.getByDevice(deviceSN)
                    const spaceId = family?.spaceId
                    if (!spaceId) {
                        return null
                    }
                    return await lampMemoryHttpdao.latestMemory(spaceId)
                } catch (e) {
                    this.log.warnMsg('getPromptV4 获取 spaceId 失败（忽略）', { deviceSN, errorMsg: e })
                    return null
                }
            })()
        } else {
            memoriesTask = memoryHttpdao.getMainMemoriesSelfReflection(sessionId)
        }

        // 全并发异步获取所有需要的Prompt
        const [agentPrompt, skills, dbPeTree, character, memories, deviceResources] = await Promise.all([
            // Agent表特定配置
            this.getAgentPromptByDB(agentId),
            // agent的技能
            deviceAgentRunnerHttpdao.findByAgentId(agentId),
            // 系统提示词
            systemPromptHttpdao.listByProductId(productId, type),
            // 人格
            characterHttpdao.getCharacter(agentId),
            // 记忆提示词
            memoriesTask,
            // 资源提示词、routine_pe 是routine提示词
            this.deviceResourcePrompt.getPromptEntries(deviceSN)
        ])
        if (!dbPeTree) {
            return new Prompt('元指令', '')
        }
        // 构建Prompt树并添加Agent和产品相关的Prompt内容，一级多个舍弃其他的，保留第一个
        let contentPE = this.buildPromptTree(dbPeTree)[0]
        if (!contentPE) {
            return new Prompt('元指令', '')
        }
        let content = contentPE.toMarkdown()
        if (character) {
            const metaPrompt = character.metaPrompt
            const characterPrompt = character.characterPrompt
            content = metaPrompt + content + characterPrompt
        }
        // 将Prompt树转换为Markdown格式并进行变量替换
        const routinePE: PromptData = deviceResources.routinePE
        let routinePrompt: Prompt | null = null
        if (routinePE.prompt) {
            routinePrompt = Prompt.fromMarkdown(routinePE.prompt)
        }
        content = this.replaced(content, skills, [], memories, routinePrompt)

        contentPE = Prompt.fromMarkdown(content)

        if (agentPrompt) contentPE.add(agentPrompt)

        const resourcePE: PromptData[] = deviceResources.resourcePE
        if (resourcePE) {
            let deviceResourcePrompts = ''
            for (let i = 0; i < resourcePE.length; i++) {
                const deviceResourcePrompt = resourcePE[i].prompt
                deviceResourcePrompts += deviceResourcePrompt
            }

            contentPE.add(Prompt.fromMarkdown(deviceResourcePrompts))
        }
        return contentPE
    }

    public async getTriggerPromptV4(
        productId: number,
        agentId: string,
        sessionId: string,
        deviceSN: string,
        type: string
    ): Promise<string> {
        // 全并发异步获取所有需要的Prompt
        const [deviceResources, triggers, dbPeTree] = await Promise.all([
            // 资源提示词、routine_pe 是routine提示词
            this.deviceResourcePrompt.getPromptEntries(deviceSN),
            // agent的trigger
            this.triggerPromptRedisService.getAllPrompts(deviceSN),
            // pomTriggerHttpdao.findAllEffectiveByAgentId(agentId),

            // 系统提示词
            systemPromptHttpdao.listByProductId(productId, type)
        ])
        if (!triggers) {
            return ''
        }

        if (!dbPeTree) {
            return ''
        }

        // 构建Prompt树并添加Agent和产品相关的Prompt内容，一级多个舍弃其他的，保留第一个
        const contentPE = this.buildPromptTree(dbPeTree)[0]
        if (!contentPE) {
            return ''
        }

        let content = contentPE.toMarkdown()

        // routines替换 TODO 写一个专门 routinePE 查询方法
        const routinePE: PromptData = deviceResources.routinePE
        // 将Prompt树转换为Markdown格式并进行变量替换
        if (routinePE.prompt) {
            content = content.replace(/\${availableRoutines}/g, routinePE.prompt)
        }

        const sys_prompt = triggers[`${TriggerPromptName.sys_prompt}`]
        const res_prompt = triggers[`${TriggerPromptName.res_prompt}`]
        const list_prompt = triggers[`${TriggerPromptName.list_prompt}`]

        content = content + '\n\n' + sys_prompt + '\n\n' + res_prompt + '\n\n' + list_prompt
        return content
    }

    /**
     * 替换占位符
     * @param content 合并后的内容
     * @param skills 技能
     * @param triggers
     * @param memories 记忆
     * @param routinesPrompt Routines
     * @private
     */
    private replaced(
        content: string,
        skills: DeviceAgentRunnerVO[],
        triggers: PomTriggerVO[],
        memories: Prompt | null,
        routinesPrompt: Prompt | null
    ) {
        // 语音替换占位符
        content = XmlVoiceElementHandler.replaced(content)
        // 技能替换符
        content = XmlSaveElementHandler.replaced(skills, content)
        // Trigger替换符
        content = TriggerInterface.replaced(triggers, content)
        // 记忆替换
        if (memories) {
            content = content.replace(/\${memories}/g, memories.toMarkdown(3))
        } else {
            content = content.replace(/\${memories}/g, '')
        }
        // routines替换
        if (routinesPrompt) {
            const str = routinesPrompt.toMarkdown(4)
            content = content.replace(/\${availableRoutines}/g, str)
        } else {
            this.log.warn('No availableRoutines found')
            content = content.replace(/\${availableRoutines}/g, '')
        }
        return content
    }

    // 根据 peTree 组成 Prompt 树结构
    public buildPromptTree(nodes: SystemPromptInnerRespVO[]): Prompt[] {
        return nodes.map(node => {
            // 创建当前节点的 Prompt
            const prompt = Prompt.fromMarkdown(node.contentCn)

            // 递归处理子节点
            if (node.children && node.children.length > 0) {
                const childPrompts = this.buildPromptTree(node.children)
                childPrompts.forEach(childPrompt => prompt.add(childPrompt))
            }

            return prompt
        })
    }

    /**
     * 组合硬件信息提示词
     * TODO 这个返回是routine执行结果，之后还有其他领域（eg：视觉）的结果，需要细化
     * @param state
     * @param faceData 人脸数据，只包含id和name字段
     * @param deviceSN 设备序列号，用于获取短期记忆
     * @private
     */
    public async getRobotStateV4(state: StateData[], deviceSN: string, faceData?: Array<{ id: string; name: string }>) {
        // 拼接 state 硬件信息
        let temp = ''
        if (state && state.length > 0) {
            // 只处理type为text的项目，name作为标题，value作为描述
            state
                .filter(item => item.type === 'json')
                .forEach(item => {
                    temp += `- **${item.desc}**: ${item.value}\n`
                })
        }

        // 添加人脸数据
        /*      if (faceData && faceData.length > 0) {
            const faceJson = JSON.stringify(faceData)
            temp += `- **设备已录入的人脸信息**: ${faceJson}\n`
        }*/

        // 添加短期记忆
        try {
            const shortTermMemoryService = getInstanceByToken<ShortTermMemoryRedisService>(ShortTermMemoryRedisService)
            const memories = await shortTermMemoryService.getMemories(deviceSN)
            if (memories && memories.length > 0) {
                const memoryText = memories.join('\n')
                temp += `\n- **短期记忆（最近5分钟的检索信息）**:\n${memoryText}\n`
            }
        } catch (error) {
            this.log.error(`Failed to get short-term memories for device: ${deviceSN}`, error)
        }

        if (!temp) {
            return ''
        }

        return '当前可用状态信息，对话请考虑当前状态进行对话\n' + temp
    }
}

export const promptManager = new PromptManager()
