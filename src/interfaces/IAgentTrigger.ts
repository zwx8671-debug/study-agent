/** @format */
import { FuncToken } from '@interface/IAgent'
import { Trace } from '@interface/ICommon'

export enum TriggerRequestEvent {
    CHAT_TRIGGER = 'chat:trigger',
    // Trigger 所有提示词，Trigger列表、动态状态、Trigger提示词
    TRIGGER_PROMPT_UPDATE = 'trigger:prompt:update',
    TRIGGER_LIST = 'trigger:list:update',
    TRIGGER_SYNC = 'trigger:sync',
    // 一键执行
    CHAT_ONCE = 'chat:once:request'
}

export enum TriggerResponseEvent {
    // 连接响应事件
    CONNECT = 'connect:response',
    // 加入房间响应事件
    JOIN = 'join:response',
    // 触发器有变化响应事件
    TRIGGER_CHANGE = 'trigger:change:response',
    TRIGGER_AUDIO = 'trigger:audio:response',
    // 一键执行
    CHAT_ONCE = 'chat:once:response'
}
// XML 格式聊天请求接口
export interface TriggerXmlRequest extends Trace {
    // 设备标识
    deviceSN: string
    // XML 格式内容
    text: string
}

export enum TriggerPromptName {
    // 系统提示词，更新频率低
    sys_prompt = 'sys_prompt',
    // trigger提示词，更新频率高
    res_prompt = 'res_prompt',
    // trigger列表
    list_prompt = 'list_prompt'
}

export interface TriggerPromptReq extends Trace {
    name: TriggerPromptName
    prompt: string
    version: string
}

export interface ChatTriggerReq extends Trace {
    input: string
}

/**
 * 同步数据请求
 */
export interface TriggerSyncRequest extends Trace {
    type: SyncEnum
    name: string
    desc: string
    data: string
}

export interface TriggerListRequest extends Trace {
    triggers: { name: string; category: string; description: string; enable: boolean }[]
}

export enum SyncEnum {
    del = 'del',
    add = 'add',
    update = 'update',
    disable = 'disable',
    enable = 'enable'
}

/**
 * 一键执行响应接口
 */
export interface TriggerXmlResponse {
    id: string
    /**
     * 函数调用信息
     */
    funcTokens: FuncToken[]
    /**
     * routine false
     * debug true
     */
    interrupt?: boolean
}

/**
 * 同步数据响应
 */
export interface TriggerSyncResponse {
    id: string
    type: SyncEnum
    name: string
    funcTokens: FuncToken[]
}
