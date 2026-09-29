/** @format */

import { XMLParser } from 'fast-xml-parser'
import type { IXNode, INodeRaw } from './IPOM'

// XML节点类，实现IXNode接口
export class XNode implements IXNode {
    // 节点名称
    name: string
    // 节点属性键值对
    attrs: Record<string, string>
    // 子节点数组
    children: XNode[] = []
    // 节点文本内容（可选）
    text?: string
    // 节点提示内容（可选）
    prompt?: string

    // 构造函数，接收IXNode对象并初始化
    constructor(node: IXNode) {
        this.name = node.name
        this.attrs = node.attrs
        // 递归创建子节点
        this.children = node.children.map(c => new XNode(c))
        this.text = node.text
    }

    /**
     * 查找指定标签的子节点
     * @param tag 要查找的标签名
     * @param deep 是否深度查找（递归查找所有子孙节点）
     * @returns 返回匹配的节点数组
     */
    find(tag: string, deep = true): XNode[] {
        const result: XNode[] = []
        // 遍历直接子节点
        for (const child of this.children) {
            // 如果子节点名称匹配，添加到结果中
            if (child.name === tag) result.push(child)
            // 如果需要深度查找，递归查找子节点的子节点
            if (deep) result.push(...child.find(tag, true))
        }
        return result
    }

    /**
     * 移除指定标签的子节点
     * @param tag 要移除的标签名
     * @param deep 是否深度移除（递归移除所有子孙节点）
     * @returns 返回被移除的节点数组
     */
    remove(tag: string, deep = true): XNode[] {
        const removed: XNode[] = []
        // 过滤子节点，移除匹配的节点
        this.children = this.children.filter(c => {
            if (c.name === tag) {
                removed.push(c)
                return false
            }
            return true
        })
        // 如果需要深度移除，递归处理子节点
        if (deep) this.children.forEach(c => removed.push(...c.remove(tag, true)))
        return removed
    }

    /**
     * 添加子节点
     * @param node 要添加的节点
     */
    addChild(node: XNode) {
        this.children.push(node)
    }

    /**
     * 设置节点属性
     * @param key 属性键
     * @param value 属性值
     */
    setAttr(key: string, value: string) {
        this.attrs[key] = value
    }

    /**
     * 获取节点属性
     * @param key 属性键
     * @returns 属性值
     */
    getAttr(key: string) {
        return this.attrs[key]
    }

    /**
     * 将节点转换为JSON对象
     * @returns 返回IXNode格式的JSON对象
     */
    toJSON(): IXNode {
        return {
            name: this.name,
            attrs: this.attrs,
            children: this.children.map(c => c.toJSON()),
            text: this.text
        }
    }
}

/**
 * 创建XML解析器实例
 */
const parser = new XMLParser({
    // 不忽略属性
    ignoreAttributes: false,
    // 属性名前缀为空
    attributeNamePrefix: '',
    // 允许布尔属性
    allowBooleanAttributes: true,
    // 不保持顺序
    preserveOrder: false,
    // 修剪值
    trimValues: true,
    // 不解析属性值
    parseAttributeValue: false,
    // 不解析标签值
    parseTagValue: false,
    // 总是创建文本节点
    alwaysCreateTextNode: true
})

/**
 * 将XML字符串解析为XNode对象
 * @param xml XML字符串
 * @returns 返回解析后的XNode对象
 */
export function parseXMLToXNode(xml: string): XNode {
    // 解析XML为原始对象
    const raw = parser.parse(xml) as INodeRaw
    // 获取根节点键名
    const rootKey = Object.keys(raw)[0]
    // 标准化节点结构
    const normalized = normalize(raw[rootKey], rootKey)
    // 创建XNode实例
    return new XNode(normalized)
}

/**
 * 标准化节点对象结构
 * @param obj 节点对象
 * @param name 节点名称
 * @returns 返回标准化的IXNode对象
 */
function normalize(obj: any, name: string): IXNode {
    // 属性对象
    const attrs: Record<string, string> = {}
    // 子节点数组
    const children: IXNode[] = []
    // 文本内容
    let text: string | undefined

    // 遍历对象属性
    for (const key in obj) {
        // 处理文本节点
        if (key === '#text') {
            if (obj[key].trim()) {
                text = obj[key]
            }
        }
        // 处理数组类型的子节点
        else if (typeof obj[key] === 'object' && Array.isArray(obj[key])) {
            obj[key].forEach((child: any) => {
                children.push(normalize(child, key))
            })
        }
        // 处理对象类型的子节点
        else if (typeof obj[key] === 'object') {
            children.push(normalize(obj[key], key))
        }
        // 处理属性
        else {
            attrs[key] = obj[key] as string
        }
    }

    // 返回标准化的节点对象
    return { name, attrs, children, text }
}
