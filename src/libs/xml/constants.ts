/**
 * XML处理器常量和枚举定义
 * @format
 */

/**
 * 保留的XML属性枚举
 */
export enum ReservedXMLAttr {
    DURATION = 'duration'
}

/**
 * Duration属性特殊值
 */
export enum DurationAttr {
    OPEN = -1, // 对应XML开标签
    CLOSE = 0 // 对应XML闭标签
}

/**
 * 保留XML标签数据类
 */
export interface ReservedXMLTag {
    name: string
    attrs: string[]
    doc: string
}

/**
 * 保留的XML标签枚举
 */
export enum ReservedXMLTags {
    SAVE = 'save',
    RUN = 'run',
    READ = 'read',
    NOVOICE = 'novoice',
    LOOP = 'loop',
    DEL_TRIGGER = 'del_trigger',
    NEW_TRIGGER = 'new_trigger',
    START_TRIGGER = 'start_trigger',
    STOP_TRIGGER = 'stop_trigger',
    UPDATE_TRIGGER = 'update_trigger',
    PROMPT = 'prompt',
    AGENT = 'agent',
    VOICE = 'voice'
}
