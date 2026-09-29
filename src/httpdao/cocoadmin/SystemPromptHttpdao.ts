/** @format */
import { getLogger } from '@utils/Logger'
import { env } from '@config/env'
import axios, { AxiosResponse } from 'axios'
import { CommonResult, SystemPromptInnerRespVO } from './common/cocoadmin.interface'

// 导出SystemPromptInnerRespVO供外部使用
export { SystemPromptInnerRespVO } from './common/cocoadmin.interface'

/**
 * 将SystemPrompt数组转换为树形结构
 * @param list 原始SystemPrompt数组
 * @returns 树形结构的SystemPrompt数组（根节点集合）
 */
function buildSystemPromptTree(list: SystemPromptInnerRespVO[]): SystemPromptInnerRespVO[] {
    const nodeMap = new Map<number, SystemPromptInnerRespVO>()
    const roots: SystemPromptInnerRespVO[] = []

    // 初始化节点映射并清空children
    list.forEach(node => {
        nodeMap.set(node.id, { ...node, children: [] })
    })

    // 建立父子关系
    list.forEach(node => {
        const currentNode = nodeMap.get(node.id)
        if (!currentNode) return

        const parentNode = nodeMap.get(node.parentId)
        if (parentNode) {
            if (!parentNode.children) {
                parentNode.children = []
            }
            parentNode.children.push(currentNode)
        } else {
            roots.push(currentNode)
        }
    })

    // 排序所有层级的子节点
    function sortChildren(node: SystemPromptInnerRespVO) {
        if (node.children && node.children.length > 0) {
            node.children.sort((a, b) => a.rank - b.rank)
            node.children.forEach(child => sortChildren(child))
        }
    }

    roots.sort((a, b) => a.rank - b.rank)
    roots.forEach(root => sortChildren(root))

    return roots
}

/**
 * 系统提示词HTTP DAO
 */
export class SystemPromptHttpdao {
    private log = getLogger(SystemPromptHttpdao.name)

    /**
     * 根据product_id查询SystemPrompt
     * @param productId 产品ID
     * @param type 类型(可选，默认为'master')
     * @param key SystemPrompt key(可选)
     * @returns SystemPrompt数组或undefined(失败时)
     */
    async listByProductId(
        productId: string | number,
        type?: string,
        key?: string
    ): Promise<SystemPromptInnerRespVO[] | undefined> {
        const config = {
            method: 'get' as const,
            url: `${env.COCOADMIN_API_URL}/inner/robot/system-prompt/query`,
            params: {
                productId,
                ...(type && { type }),
                ...(key && { key })
            },
            headers: {
                innerKey: env.COCOADMIN_API_KEY
            }
        }

        try {
            const response: AxiosResponse<CommonResult<SystemPromptInnerRespVO[]>> = await axios(config)

            if (response.data.code === 200 && response.data.data) {
                return buildSystemPromptTree(response.data.data)
            }

            this.log.warnMsg(`查询SystemPrompt失败: ${response.data.msg},入参:${JSON.stringify(config)}`)
        } catch (error) {
            this.log.errorMsg(`查询SystemPrompt请求异常,入参:${JSON.stringify(config)}`, { errorMsg: error })
        }
        return undefined
    }
}

export const systemPromptHttpdao = new SystemPromptHttpdao()
