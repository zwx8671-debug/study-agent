/** @format */

import { Service } from 'fastify-decorators'
import { getLogger } from '@utils/Logger'
import { pomAgentRoutineHttpdao } from '../httpdao/cocoadmin/PomAgentRoutineHttpdao'
import { RoutineInnerRespVO } from '../httpdao/cocoadmin/common/cocoadmin.interface'
import { Prompt } from 'uniai'

@Service()
export class RoutineService {
    private readonly log = getLogger(RoutineService.name)

    /**
     * 根据agentId获取例程列表
     * @param agentId
     */
    /**
     * 根据代理ID获取例程树结构
     * @param agentId 代理ID
     * @returns 返回构建好的提示数组，如果获取失败则返回空数组
     */
    async getRoutinesTreeByAgentId(agentId: string) {
        const data = await pomAgentRoutineHttpdao.getRoutinesTreeByAgentId(agentId)

        if (data) {
            const structure = data.structure
            const structurePE = data.structurePe
            const structureRoutines = data.structureRoutines

            // 定义目录分类
            const catalog = ['sys', 'user', 'mcp']

            const prompts: Prompt[] = []
            // 遍历目录分类，构建对应的模块提示
            for (const ele of catalog) {
                const prompt = this.buildModulePrompts(ele, structure, structurePE, structureRoutines)
                if (prompt) {
                    prompts.push(prompt)
                }
            }
            return prompts
        }

        this.log.error(`Failed to get routines for ${agentId} agentId`)
        return []
    }

    /**
     * 构建模块提示信息
     * @param moduleName - 模块名称
     * @param structure - 模块结构定义，描述模块间的层级关系
     * @param structurePE - 模块描述信息，包含各模块的详细说明
     * @param structureRoutines - 结构化例程，包含各模块下的例程信息
     * @returns 返回构建好的Prompt对象，如果模块不存在则返回null
     */
    buildModulePrompts(
        moduleName: string,
        structure: { [key: string]: string[] },
        structurePE: { [key: string]: string },
        structureRoutines: { [key: string]: { abstractText: string; rank: number }[] }
    ): Prompt | null {
        let modulePE = structurePE[moduleName]
        if (!modulePE) {
            modulePE = ''
        }

        // 一级Prompt
        const prompt = new Prompt(moduleName, modulePE)
        const children = structure[moduleName]

        if (children && Array.isArray(children)) {
            for (const twoTitle of children) {
                const twoPe = structurePE[`${moduleName}.${twoTitle}`]
                const routines = structureRoutines[`${moduleName}.${twoTitle}`]

                let routinesPE = ''
                if (Array.isArray(routines)) {
                    // 避免修改原始数组
                    const sortedRoutines = [...routines].sort((a, b) => a.rank - b.rank)
                    routinesPE = sortedRoutines.map(item => item.abstractText).join('\n\n')
                }

                // 创建二级Prompt并添加到一级Prompt中
                const twoPrompt = new Prompt(twoTitle, twoPe ? `${twoPe}\n\n${routinesPE}` : routinesPE)

                prompt.add(twoPrompt)
            }
        }

        return prompt
    }

    /**
     * 根据agentId获取例程列表
     * @param agentId
     * @param key
     */
    async getDynamicRoutinesByAgentId(key: string, agentId: string): Promise<Prompt[]> {
        const routines = await pomAgentRoutineHttpdao.getDynamicRoutinesByAgentId(agentId, key)
        return this.mapToPE(routines, agentId)
    }

    private map(routines: RoutineInnerRespVO[]) {
        // 使用 Map 来维护插入顺序
        const grouped = new Map<number, RoutineInnerRespVO[]>()

        // 先按照 rank 数字排序
        const sortedRoutines = routines.sort((a, b) => {
            const rankA = a.moduleNodeRank ?? 0
            const rankB = b.moduleNodeRank ?? 0
            return rankA - rankB
        })

        // 按排序后的顺序分组（使用moduleNodeId作为分组键）
        sortedRoutines.forEach(routine => {
            const groupKey = routine.moduleNodeRank ?? 0
            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, [])
            }
            grouped.get(groupKey)?.push(routine)
        })

        return grouped
    }

    private mapToPE(routines: RoutineInnerRespVO[], agentId: string) {
        const grouped = this.map(routines)
        this.log.debug(`Get ${grouped.size} modules for agent ${agentId}`)

        try {
            const prompts: Prompt[] = []
            // 2. Routine列表的abstract拼接成一个 prompt_content
            grouped.forEach(routines => {
                const promptContent = this.generatePromptContent(routines)
                const prompt = new Prompt(routines[0].moduleNodeName, promptContent)
                prompts.push(prompt)
            })

            return prompts
        } catch (error) {
            this.log.error(`Failed to get routines for ${agentId} :`, error)
            // 返回默认的空 Prompt
            return []
        }
    }

    /**
     * 将例程列表转换为Prompt内容
     * @param routines 例程列表
     * @returns 拼接后的prompt内容
     */
    generatePromptContent(routines: RoutineInnerRespVO[]): string {
        const abstracts = routines
            .sort((a, b) => a.rank - b.rank)
            .map(routine => routine.abstractText)
            .filter(abstract => abstract && abstract.trim().length > 0)
            .join('\n\n')

        return routines[0].moduleNodeDescription + '\n\n' + abstracts
    }
}
