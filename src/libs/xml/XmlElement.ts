/**
 * XML元素相关类型定义和工具类
 *
 * 本模块定义了XML解析器所需的基础数据结构，包括XML元素、错误类型和事件监听器
 * 支持开放标签、关闭标签、自闭合标签和文本节点的表示
 *
 * @format
 */

/**
 * XML元素类
 *
 * 表示一个XML元素，包含元素类型、标签名、文本内容和属性
 * 支持开放标签、关闭标签、自闭合标签和纯文本节点
 */
export class XmlElement {
    /** 元素类型 */
    type: XmlElementType
    /** 标签名称 */
    name: string
    /** 文本内容 */
    text: string
    /** 属性键值对 */
    attr: Record<string, string>
    /** 临时属性键值对，最后保存到数据库需要删除的键值对（xml toString保证） */
    tempAttr: Record<string, string>

    /**
     * 构造函数
     * @param init - 初始化参数，可以是XmlElement的部分属性
     */
    constructor(init: Partial<XmlElement> = {}) {
        this.type = init.type!
        this.name = init.name ?? ''
        this.text = init.text ?? ''
        this.attr = init.attr ?? {}
        // 在xml toString的时候不会携带
        this.tempAttr = init.tempAttr ?? {}
    }

    /**
     * 将XML元素转换为字符串表示
     * @returns XML字符串格式
     */
    toString(): string {
        const attrStr =
            this.attr && Object.keys(this.attr).length > 0
                ? ' ' +
                  Object.entries(this.attr)
                      .map(([k, v]) => `${k}="${v}"`)
                      .join(' ')
                : ''
        switch (this.type) {
            case XmlElementType.SelfClose:
                return `<${this.name}${attrStr}/>`
            case XmlElementType.Open:
                return `<${this.name}${attrStr}>`
            case XmlElementType.Close:
                return `</${this.name}>`
            default:
                return this.text
        }
    }
}

/**
 * XML元素类型枚举
 *
 * 定义了XML解析器支持的所有元素类型
 */
export enum XmlElementType {
    /** 开放标签，如 <tag> */
    Open = 'open',
    /** 文本内容 */
    Text = 'text',
    /** 闭合标签，如 </tag> */
    Close = 'close',
    /** 自闭合标签，如 <tag/> */
    SelfClose = 'self-close'
}

/**
 * XML事件监听器接口
 *
 * 定义了各种XML解析事件的回调函数签名
 */
export type XmlEventListener = {
    /** 解析开始事件 */
    start: () => void
    /** 解析结束事件 */
    close: () => void
    /** 数据解析事件，每解析出一个元素时触发 */
    data: (element: XmlElement) => void
    /** 错误事件，解析出错时触发 */
    error: (error: Error) => void
}
