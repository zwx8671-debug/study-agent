/** @format */

// /** @format */
//
// import { SystemPrompt } from '../SystemPromptHttpdao'
//
// /**
//  * 将SystemPrompt数组转换为树形结构
//  * @param list 原始SystemPrompt数组
//  * @returns 树形结构的SystemPrompt数组（根节点集合）
//  */
// function buildSystemPromptTree(list: SystemPrompt[]): SystemPrompt[] {
//     const nodeMap = new Map<string, SystemPrompt>()
//     const roots: SystemPrompt[] = []
//
//     // 初始化节点映射并清空children
//     list.forEach(node => {
//         nodeMap.set(node.id, { ...node, children: [] })
//     })
//
//     // 建立父子关系
//     list.forEach(node => {
//         const currentNode = nodeMap.get(node.id)
//         if (!currentNode) return
//
//         const parentNode = nodeMap.get(node.parent)
//         if (parentNode) {
//             parentNode.children.push(currentNode)
//         } else {
//             roots.push(currentNode)
//         }
//     })
//
//     // 排序所有层级的子节点
//     function sortChildren(node: SystemPrompt) {
//         node.children.sort((a, b) => a.order - b.order)
//         node.children.forEach(child => sortChildren(child))
//     }
//
//     roots.sort((a, b) => a.order - b.order)
//     roots.forEach(root => sortChildren(root))
//
//     return roots
// }
//
// /**
//  * 广度优先遍历SystemPrompt树形结构
//  * @param tree 树形结构的根节点数组
//  * @param callback 遍历回调函数，接收当前节点和层级作为参数
//  */
// function traverseBFS(tree: SystemPrompt[], callback: (node: SystemPrompt, level: number) => void): void {
//     if (!tree.length) return
//
//     // 使用队列存储待遍历节点，格式为 [节点, 层级]
//     const queue: [SystemPrompt, number][] = []
//
//     // 初始化队列（根节点层级为0）
//     tree.forEach(root => queue.push([root, 0]))
//
//     // 执行广度遍历
//     while (queue.length > 0) {
//         // 出队（取队列头部元素）
//         const [currentNode, level] = queue.shift()!
//
//         // 执行回调
//         callback(currentNode, level)
//
//         // 子节点入队（层级+1）
//         currentNode.children.forEach(child => {
//             queue.push([child, level + 1])
//         })
//     }
// }
//
// /**
//  * 深度优先遍历（递归实现）
//  * @param tree 树形结构的根节点数组
//  * @param callback 遍历回调函数，接收当前节点和层级作为参数
//  */
// function traverseDFSRecursive(tree: SystemPrompt[], callback: (node: SystemPrompt, level: number) => void): void {
//     // 递归辅助函数
//     function dfs(node: SystemPrompt, level: number) {
//         // 处理当前节点
//         callback(node, level)
//         // 递归处理子节点（已按order排序，保证顺序）
//         node.children.forEach(child => dfs(child, level + 1))
//     }
//
//     // 遍历所有根节点
//     tree.forEach(root => dfs(root, 0))
// }
//
// export { buildSystemPromptTree, traverseBFS, traverseDFSRecursive }
