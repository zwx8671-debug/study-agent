# CoCo Cloud TypeScript 🚀

> 基于 Fastify 框架构建的云端智能代理服务

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.5.0-green.svg)](https://www.fastify.io/)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📖 项目简介

CoCo Cloud TypeScript 是为 CoCo 项目构建的高性能云端后端服务，提供：

- 🔌 **实时通信**: WebSocket + Socket.IO 双重支持
- 🤖 **AI 对话**: 多模型统一接口，支持流式响应
- 🎙️ **语音合成**: 集成字节跳动 TTS 服务
- 🗄️ **双 ORM**: Sequelize + TypeORM 灵活数据访问
- 🌐 **国际化**: 中英文多语言支持
- ⚡ **高性能**: 基于 Fastify 高性能框架

## 🏗️ 技术架构

```
[客户端] ↔ [WebSocket/HTTP] ↔ [Fastify] ↔ [控制器] ↔ [服务层] ↔ [数据层]
                                    ↓
                            [Redis/PostgreSQL/AI服务]
```

**核心技术栈:**
- **框架**: Fastify 5.5.0 + TypeScript 5.9.2
- **数据库**: PostgreSQL + pgvector, Redis
- **ORM**: Sequelize + TypeORM 双引擎
- **实时通信**: WebSocket + Socket.IO
- **AI 集成**: UniAI 统一接口
- **语音服务**: 字节跳动语音合成

## 🚀 快速开始

### 前置要求

- **Node.js** >= 18.0
- **PostgreSQL** >= 12 (含 pgvector 扩展)
- **Redis** >= 6.0
- **Bun** (推荐) 或 npm

### 1️⃣ 安装依赖

```bash
# 克隆项目
git clone ssh://git@192.168.10.214:222/ai_software/coco-cloud-ts.git
cd coco-cloud-ts

# 安装依赖 (处理版本冲突)
yarn install
```

### 2️⃣ 环境配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
notepad .env  # Windows
# vim .env    # Linux/Mac
```

**必需配置项:**
```env
# 数据库 (必需)
DB_HOST=localhost
DB_USER=postgres
DB_PASS=your_password
DB_NAME=coco_cloud_db

# Redis (必需)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASS=

# 语音服务 (必需)
VOICE_API=wss://openspeech.bytedance.com
VOICE_APP_ID=your_app_id
VOICE_ACCESS_TOKEN=your_token
```

### 3️⃣ 数据库设置

```sql
-- 创建数据库
CREATE DATABASE coco_cloud_db;

-- 安装向量扩展
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4️⃣ 启动服务

```bash
# 开发模式 (推荐)
yarn run tsx     # 使用 tsx (稳定)（打断点更方便）
yarn run dev     # 使用 Bun (更快)(生产使用)

# 生产模式
yarn run build   # 构建
yarn run dev       # 启动
```

**启动成功标志:**
```
✅ Database connection established
✅ Redis connected successfully  
🚀 Server listening at http://0.0.0.0:3000
🔌 Socket.IO routes configured
```

## 📡 API 接口

### Socket.IO 实时通信

**连接端点:** `ws://localhost:4000/agent`

**事件列表:**

| 事件 | 方向 | 描述 | 数据格式 |
|------|------|------|----------|
| `connect` | ← | 连接建立 | - |
| `join` | → | 加入设备房间 | `{device: string}` |
| `chat` | → | 发送聊天消息 | `{id, device, text, end}` |
| `chat:response` | ← | 接收响应 | `{code, data, msg}` |
| `interrupt` | → | 中断对话 | `{device: string}` |


## 🧪 测试指南

### 功能测试
bun运行测试脚本可以直接使用fastify环境下运行

### 健康检查

```bash
# HTTP 服务检查
curl http://localhost:4000/

# Redis 连接检查  
redis-cli ping

# 数据库连接检查
psql -h localhost -U postgres -d coco_cloud_db -c "SELECT 1;"
```

## 📂 项目结构

```
src/
├── app.ts              # 应用入口
├── config/             # 配置文件
│   ├── env.ts         # 环境变量
│   ├── db.config.ts   # 数据库配置
│   └── cors.config.ts # CORS 配置
├── controllers/        # 控制器层
│   ├── AgentSocket.ts  # Agent 控制器
│   └── UserController.ts   # 用户控制器
├── services/          # 业务逻辑层
│   ├── AgentService.ts     # Agent 服务
│   ├── speech/              # 语音服务
│   └── xml/                 # XML 解析服务
├── models/            # 数据模型
│   ├── sequelize/     # Sequelize 模型
│   └── typeorm/       # TypeORM 模型
├── plugins/           # Fastify 插件
├── routes/            # 路由定义
├── utils/             # 工具类
└── interfaces/        # TypeScript 接口
```

## 🔧 开发指南

### 代码规范

安装 eslint 插件，并配置 eslintrc 文件

### 路径别名

项目配置了路径别名，简化导入：

```typescript
import AgentService from '@service/agent.service'
import { Logger } from '@utils/Logger'
import UserModel from '@model/sequelize/User'
```

### 装饰器支持

使用装饰器简化开发：

```typescript
@Controller('/agent')
@SocketNamespace('/agent')
export class AgentSocket {
    @SocketEvent('chat')
    async handleChat(socket: Socket, data: ChatRequest) {
        // 处理聊天逻辑
    }
}
```

## 🔍 故障排除

### 常见问题

1. **依赖安装失败**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **数据库连接失败**
   - 检查 PostgreSQL 服务状态
   - 验证 `.env` 中的数据库配置
   - 确认用户权限和数据库存在

3. **Redis 连接失败** 
   - 启动 Redis 服务
   - 检查防火墙设置
   - 验证连接信息

4. **端口被占用**
   ```bash
   # 查看占用进程
   netstat -ano | findstr :3000
   # 修改 .env 中的 PORT 配置
   ```

## 📈 性能优化

### Bun vs Node.js

| 特性 | Bun | Node.js |
|------|-----|---------|
| 启动速度 | ⚡ 2-3x 更快 | 🐌 标准速度 |
| 内存占用 | 📉 更低 | 📈 标准 |
| 包管理 | 🚀 原生快速 | 📦 npm/yarn |
| 生态兼容 | ⚠️ 95% 兼容 | ✅ 100% 兼容 |


### 性能监控

```bash
# 进程监控
top -p $(pgrep node)

# 内存使用
ps aux | grep node

# 连接数监控
netstat -an | grep :3000 | wc -l
```

### 开发部署
1、同步环境最新修改
```env
NODE_ENV=production
LOG_LEVEL=warn
PORT=3000
```

2、部署
```shell
cd /app/git/coco-cloud-ts
# 可选
git pull
# 可选
yarn install
# 先build
./serverctl.sh build
# 重启服务
./serverctl.sh restart-prod
./serverctl.sh restart-dev
```
