/** @format */

import { Prompt } from 'uniai'
import { resolve } from 'path'
import type { PromptFunc } from './IPOM'
import { parseXMLToXNode, XNode } from './XNode'
import { getFunctionUtils } from '@utils/CodeUtil'

// 获取函数工具实例
const util = getFunctionUtils()
// 导入routines目录下的所有函数
const META_FUNC = util.importFrom<PromptFunc>(resolve(__dirname, './routines'))

// POM管理器类
export class POManager {
    // 函数映射表，存储标签名到函数的映射
    private funcs: Map<string, PromptFunc> = new Map()
    // 根节点
    private root: XNode
    // 提示树（可选）
    private promptTree?: Prompt
    // 设备属性
    private sessionAttrs?: Record<string, string>

    /**
     * 【入口】构造函数
     * @param xml XML字符串
     * @param sessionAttrs
     */
    constructor(xml: string, sessionAttrs?: Record<string, string>) {
        this.sessionAttrs = sessionAttrs
        // 解析XML为XNode对象
        this.root = parseXMLToXNode(xml)
        // 注册所有导入的函数
        for (const meta of META_FUNC) this.register(meta.name, meta.func)
    }

    /**
     * 从XML创建POManager实例的静态方法
     * @param xml XML字符串
     * @returns 返回POManager实例
     */
    public static fromXML(xml: string): POManager {
        return new POManager(xml)
    }

    /**
     * 注册函数
     * @param tag 标签名
     * @param func 提示函数
     */
    register(tag: string, func: PromptFunc) {
        this.funcs.set(tag, func)
    }

    /**
     * 异步解析节点树，执行对应的函数并构建提示树
     * <system_pom name="虚拟根节点">
     *     <system_pom name="元指令" />
     *     <system_pom name="保密声明" />
     *     <system_pom name="角色档案" />
     *     <system_pom name="行为控制（通过 XML）[保密]" />
     *     <system_pom name="系统保留 XML 标签" />
     *     <system_pom name="Routines" />
     *     <system_pom name="状态感知" />
     *     <system_pom name="附录: Routine 索引参考" />
     *     <system_pom name="空间感知与交互" />
     *     <system_pom name="记忆" />
     * </system_pom>
     *
     * @returns 返回构建完成的提示树
     */
    async parse() {
        // 存储所有需要执行的异步任务
        const tasks: Promise<void>[] = []

        // 遍历节点树，收集需要执行的异步任务
        const walk = (node: XNode) => {
            // 获取节点对应的函数
            const func = this.funcs.get(node.name)
            // 如果函数存在
            if (func)
                // 添加任务到任务列表
                tasks.push(
                    // 执行函数并处理结果
                    Promise.resolve(func(...util.mapArgs(node.name, node.attrs, this.sessionAttrs))).then(p => {
                        // 将函数执行结果存储到节点的prompt属性中
                        node.prompt = p
                    })
                )

            // 递归处理子节点
            node.children.forEach(walk)
        }

        // 从根节点开始遍历整个节点树
        walk(this.root)
        // 等待所有异步任务执行完成
        await Promise.all(tasks)
        // 构建最终的提示树结构
        this.promptTree = this.buildPromptTree(this.root)
        return this.promptTree
    }

    /**
     * 当前 PROMPT 树中与 routines 目录已注册函数同名的 XML 标签名（深度优先，同一标签多次出现则多次列出）
     */
    collectRoutineTagNames(): string[] {
        const out: string[] = []
        const walk = (node: XNode) => {
            if (this.funcs.has(node.name)) {
                out.push(node.name)
            }
            node.children.forEach(walk)
        }
        walk(this.root)
        return out
    }

    /**
     * 构建提示树
     * @param node XNode节点
     * @returns 返回构建的Prompt对象
     */
    private buildPromptTree(node: XNode): Prompt {
        // 如果节点有prompt内容，则从markdown创建Prompt，否则创建包含节点名称和文本的Prompt
        const prompt = node.prompt ? new Prompt(node.name, node.prompt) : new Prompt(node.name, node.text)
        // 遍历子节点并添加到提示树中
        for (const child of node.children) {
            const childPrompt = this.buildPromptTree(child)
            prompt.add(childPrompt)
        }
        return prompt
    }

    /**
     * 转换为Markdown格式
     * @returns 返回Markdown字符串
     */
    toMarkdown() {
        // 如果提示树未构建，抛出错误
        if (!this.promptTree) throw new Error('Call parse() first')
        // 返回提示树的Markdown表示
        return this.promptTree.toMarkdown()
    }
}
