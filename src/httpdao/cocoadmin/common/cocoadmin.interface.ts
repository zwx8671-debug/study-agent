/** @format */

/**
 * 通用响应结构（COCOADMIN接口）
 */
export interface CommonResult<T> {
    code: number
    msg: string
    data?: T
}

/**
 * 简单Routine信息（用于tree接口）
 */
export interface SimpleRoutineVO {
    id: number
    name: string
    abstractText: string
    source: string
    rank: number
    loadType: number
}

/**
 * 完整Routine信息（用于query和dynamic接口）
 */
export interface RoutineInnerRespVO {
    id: number
    lang: string
    abstractText: string
    source: string
    moduleNodeId: number
    moduleNodeKey: string
    moduleNodeName: string
    moduleNodeRank: number
    moduleNodeDescription: string
    productId: number
    description: string
    provider: string
    routineType: string
    name: string
    rank: number
    loadType: number
    hidden: boolean
}

/**
 * AgentRoutine树结构响应
 */
export interface AgentRoutineTreeRespVO {
    structure: {
        [key: string]: string[]
    }
    structurePe: {
        [key: string]: string
    }
    structureRoutines: {
        [key: string]: SimpleRoutineVO[]
    }
}

/**
 * 设备绑定/创建请求
 */
export interface DeviceInnerCreateReqVO {
    name: string
    seriesNum: string
    userId: number
    code: string
}

/**
 * 设备响应信息
 */
export interface DeviceRespVO {
    name: string
    seriesNum: string
    version: string
    productId: number
}

/**
 * 代理响应信息
 */
export interface AgentRespVO {
    id: string
    name: string
    description: string
    prompt: string
    sessionId: string
    createTime: string
}

/**
 * 设备绑定/创建完整响应
 */
export interface DeviceInnerCreateRespVO {
    device: DeviceRespVO
    agent: AgentRespVO
    deviceSessionId: string
}

/**
 * 设备绑定关系检查请求
 */
export interface CheckBindRequest {
    // 设备SN
    deviceSN: string
    // 时间戳
    timestamp: string
    // 密钥签名
    signature: string
}

/**
 * 设备绑定关系检查响应
 */
export interface CheckBindResponse {
    // 设备SN
    deviceSN: string
    // userId
    userId: number
    // 绑定标记
    bindFlag: boolean
    // 绑定时间
    bindTime: string | null
}

/**
 * 设备详情响应
 */
export interface DeviceDetailVO {
    id: string
    seriesNum: string
    name: string
    userId: number
    productId: number
    pubKey: string
    bindFlag: boolean
    bindTime: string
    createdAt: string
    updatedAt: string
}

/**
 * 设备绑定请求
 */
export interface DeviceBindRequest {
    // 设备名
    name: string
    // 设备序列号
    deviceSN: string
    // web页面的code
    code: string
    // 用户ID
    userId: number
}

/**
 * SystemPrompt 响应
 */
export interface SystemPromptInnerRespVO {
    id: number
    titleCn: string
    titleEn: string
    contentCn: string
    contentEn: string
    parentId: number
    productId: number
    rank: number
    key: string
    children?: SystemPromptInnerRespVO[]
}

/**
 * 触发器创建请求
 */
export interface AgentTriggerSaveReqVO {
    id?: string
    name: string
    agentId: string
    xml: string
    description: string
}

// ==================== ConversationDialog 相关接口 ====================

/**
 * 对话消息响应
 */
export interface ConversationMessageVO {
    id: string
    dialogId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    provider: string
    model: string
    tokenCount: number
    sessionId: string
    index: number
    groupId: string | null
    historySummary: string | null
    requestId: string | null
    // lamp_search_memory routine 写入的原样 JSON 字符串
    video?: string
    createdAt: string
    updatedAt: string
}

/**
 * 对话详情响应（含消息列表）
 */
export interface ConversationDialogRespVO {
    id: string
    agentId: string
    title: string
    createdAt: string
    updatedAt: string
    messages: ConversationMessageVO[]
}

/**
 * 更新对话标题请求
 */
export interface UpdateDialogTitleReqVO {
    title: string
}

// ==================== ConversationMessage 相关接口 ====================

/**
 * 创建消息请求
 */
export interface CreateMessageReqVO {
    dialogId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    provider: string
    model: string
    sessionId: string
    messageId?: string // 可选，用户消息传入，assistant消息后端生成
    requestId?: string
    index?: number // 消息执行到idx
    tokenCount?: number
    video?: string // lamp_search_memory routine 写入的原样 JSON 字符串
}

/**
 * 创建Trigger消息请求
 */
export interface CreateTriggerMessageReqVO {
    role: 'user' | 'assistant'
    content: string
    provider: string
    model: string
    messageId?: string // 可选，用户消息传入，assistant消息后端生成
    requestId?: string
    tokenCount?: number
}

/**
 * 摘要检查结果响应
 */
export interface SummaryCheckResultVO {
    needsSummary: boolean // 是否需要生成摘要（>=20轮）
    lastSummary?: string // 上次摘要内容
    conversationTurns?: ConversationMessageVO[] // 需要摘要时返回消息列表
}

/**
 * 更新历史摘要请求
 */
export interface UpdateHistorySummaryReqVO {
    historySummary: string
}

/**
 * 批量更新索引请求
 */
export interface BatchUpdateIndexReqVO {
    updates: {
        messageId: string
        index: number
        groupId: string
    }[]
}

// ==================== DeviceFace 相关接口 ====================

/**
 * 设备人脸响应
 */
export interface DeviceFaceVO {
    id: string
    name: string
    threeId?: string
    faceBase?: string
    deviceSn: string
    createdAt: string
    updatedAt: string
}

/**
 * 创建设备人脸请求
 */
export interface CreateDeviceFaceReqVO {
    id?: string // 可选，不传则后端生成UUID
    name: string
    threeId?: string
    faceBase?: string // Base64编码的人脸图片
    deviceSn: string
}

/**
 * 更新设备人脸请求
 */
export interface UpdateDeviceFaceReqVO {
    name?: string
    threeId?: string
    faceBase?: string
}

// ==================== DeviceProduct 相关接口 ====================

/**
 * 设备产品响应
 */
export interface DeviceProductVO {
    id: number
    name: string
    version: string
    description: string
    type: string
    prompt: string
    code: string
    createdAt: string
    updatedAt: string
}

// ==================== PomAgent 相关接口 ====================

/**
 * 设备信息
 */
export interface DeviceVO {
    id: string
    seriesNum: string
    name: string
    productId?: number
}

/**
 * 设备会话信息
 */
export interface DeviceSessionVO {
    id: string
    deviceId: string
    device?: DeviceVO
}

/**
 * PomAgent 响应
 */
export interface PomAgentVO {
    id: string
    name: string
    description: string
    prompt: string
    sessionId: string
    deviceSession?: DeviceSessionVO
    createdAt: string
    updatedAt: string
}

/**
 * PomAgent 带对话列表的响应（用于 getAgentAndLatestDialogMessages 返回）
 */
export interface PomAgentWithDialogsVO extends PomAgentVO {
    dialogs: ConversationDialogRespVO[]
}

// ==================== QuickChatResponse 相关接口 ====================

/**
 * 向量搜索请求
 */
export interface VectorSearchReqVO {
    embedding: number[] // 查询向量
    productId: number // 产品ID
    limit?: number // 返回数量限制，默认5
}

/**
 * 快捷回复响应
 */
export interface QuickChatResponseVO {
    xml: string // XML内容
    similarity: number // 相似度分数 (-1 到 1)
}

// ==================== DeviceAgentRunner 相关接口 ====================

/**
 * 保存技能请求
 */
export interface SaveSkillReqVO {
    name: string
    description: string
    xml: string // routineCombo
    agentId: string
}

/**
 * 技能响应（简化版，只返回name和description）
 */
export interface DeviceAgentRunnerVO {
    name: string
    description: string
}

// ==================== PomTrigger 相关接口 ====================

/**
 * 触发器响应
 */
export interface PomTriggerVO {
    id: string
    name: string
    agentId: string
    xml: string
    description: string
    createdAt: string
    updatedAt: string
}

// ==================== 设备家庭空间 相关接口 ====================

/**
 * 设备家庭空间响应
 */
export interface DeviceFamilyInnerRespVO {
    name: string // 家庭名称
    spaceId: string // 空间ID
    aesKey: string // AES密钥
    userId: number // 创建者用户ID
}

// ==================== 人脸对比 相关接口 ====================

/**
 * 设备人脸数据
 */
export interface DeviceFaces {
    deviceSn: string // 设备SN
    faceIds?: string[] // 设备本地已有的faceId列表
}

/**
 * 人脸对比请求
 */
export interface FaceDiffReqVO {
    devices: DeviceFaces[] // 设备列表
}

/**
 * 人脸对比响应
 */
export interface FaceDiffRespVO {
    deviceSn: string // 设备SN
    missingFaceIds: string[] // 缺少的faceId列表
}

// ==================== 设备人脸内部接口 相关接口 ====================

/**
 * 设备人脸内部响应（用于内部接口）
 */
export interface DeviceFaceInnerRespVO {
    id: string // 主键ID
    name: string // 人脸识别的名称
    threeId: string // 设备人脸ID
    faceBase: string // 人脸图片基础数据
    deviceSn: string // 设备SN
    facePicUrl: string // 人脸图片 URL
    faceNpyUrl: string // 人脸特征 URL
    createdAt: string // 创建时间
    updatedAt: string // 更新时间
}

// ==================== 设备声纹内部接口 相关接口 ====================

/**
 * 设备声纹内部响应（用于内部接口）
 */
export interface DeviceVoiceInnerRespVO {
    id: string // 主键ID
    name: string // 声纹识别的名称
    threeId: string // 设备声纹ID
    deviceSn: string // 设备SN
    voiceUrl: string // 声纹文件 URL
    createdAt: string // 创建时间
    updatedAt: string // 更新时间
}

// ==================== 设备宠物内部接口 相关接口 ====================

/**
 * 设备宠物内部响应（用于内部接口）
 */
export interface DevicePetInnerRespVO {
    id: string // 主键ID
    name: string // 宠物识别名称
    deviceSn: string // 设备SN
    petUrl: string // 宠物图片 URL
    petnpyUrl: string // 宠物特征 URL
    createdAt: string // 创建时间
    updatedAt: string // 更新时间
}
