/** @format */
/**
 * 对话数据提供者模块
 * 负责从 chat-list.json 读取和管理对话数据
 */

import * as fs from 'fs'

export interface ChatItem {
    id: number
    text: string
}

export interface ChatListData {
    chatList: ChatItem[]
}

export enum Mode {
    sequential = '顺序',
    random = '随机'
}

export interface ChatDataProviderConfig {
    chatListPath: string
    mode?: Mode // 顺序或随机模式
}

/**
 * 对话数据提供者类
 */
export class ChatDataProvider {
    private chatListPath: string
    private chatList: ChatItem[] = []
    private currentIndex = 0
    private mode: Mode

    constructor(config: ChatDataProviderConfig) {
        this.chatListPath = config.chatListPath
        this.mode = config.mode || Mode.sequential
    }

    /**
     * 加载对话列表
     */
    async loadChatList(): Promise<void> {
        try {
            const content = await fs.promises.readFile(this.chatListPath, 'utf-8')
            const data: ChatListData = JSON.parse(content)

            if (!data.chatList || !Array.isArray(data.chatList)) {
                throw new Error('Invalid chat list format')
            }

            this.chatList = data.chatList
            console.log(`✓ 成功加载 ${this.chatList.length} 条对话数据`)
        } catch (error) {
            console.error('加载对话列表失败:', error)
            throw error
        }
    }

    /**
     * 获取下一条对话
     */
    getNextChat(): ChatItem | null {
        if (this.chatList.length === 0) {
            return null
        }

        let chat: ChatItem

        if (this.mode === Mode.random) {
            // 随机模式
            const randomIndex = Math.floor(Math.random() * this.chatList.length)
            chat = this.chatList[randomIndex]
        } else {
            // 顺序模式
            chat = this.chatList[this.currentIndex % this.chatList.length]
            this.currentIndex++
        }

        return chat
    }

    /**
     * 根据索引获取对话
     */
    getChatByIndex(index: number): ChatItem | null {
        if (index < 0 || index >= this.chatList.length) {
            return null
        }
        return this.chatList[index]
    }

    /**
     * 根据 ID 获取对话
     */
    getChatById(id: number): ChatItem | null {
        return this.chatList.find(chat => chat.id === id) || null
    }

    /**
     * 获取对话列表长度
     */
    getLength(): number {
        return this.chatList.length
    }

    /**
     * 重置索引
     */
    reset() {
        this.currentIndex = 0
    }

    /**
     * 获取所有对话
     */
    getAllChats(): ChatItem[] {
        return [...this.chatList]
    }

    /**
     * 设置模式
     */
    setMode(mode: Mode) {
        this.mode = mode
    }
}
