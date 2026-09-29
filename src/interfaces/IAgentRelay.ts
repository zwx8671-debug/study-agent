/** @format */

export enum AgentRelayResponseEvent {
    CONNECT = 'connect:response', // 连接响应事件
    RELAY_CONFIG_UPDATE = 'relay:config:update',
    JOIN = 'join:response' // 加入房间响应事件
}

export interface MCPConfigRelayResponse {
    reqId: string
    timestamp: number
    config: MCPConfigPayload
    flag: number
}

export interface MCPConfigPayload {
    name: string // MCP名称
    key: string // MCP ModuleNode key
    url: string // 要下发的配置数据的URL
    apiKey: string // API密钥

    agentId: string // 目标Agent标识
    moduleNodeId: string // 目标模块节点标识
}

export interface RelayReq<T = any> {
    /** 目标设备标识 */
    deviceSN: string

    /** 数据类型 */
    dataType: 'mcp_config' | 'python' | 'script' | string

    /** 要转发的具体数据 */
    payload: T

    /** 请求ID，用于追踪 */
    reqId?: string
}
