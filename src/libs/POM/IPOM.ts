/** @format */

import type { Fn } from '@utils/CodeUtil'

// 定义提示函数类型，可以返回字符串或Promise<string>
export type PromptFunc = Fn<string | Promise<string>>

// 定义原始节点接口，可以包含任意键值对
export interface INodeRaw {
    [key: string]: any
}

// 定义XML节点接口
export interface IXNode {
    // 节点名称
    name: string
    // 节点属性键值对
    attrs: Record<string, string>
    // 子节点数组
    children: IXNode[]
    // 节点文本内容（可选）
    text?: string
}
