# 家庭人脸同步功能实现

## 📋 功能概述

实现了 Redis 订阅 `space:face_sync` 频道，根据不同的触发事件自动通知家庭内的设备进行人脸同步操作。

## 🏗️ 实现架构

```
外部系统 → Redis (space:face_sync) → SpaceFaceSyncRedisService → Socket.IO (/agent-data namespace) → 设备端
```

**重要**: 加密数据同步使用独立的 namespace `/agent-data`，设备需要连接到此 namespace 才能接收人脸同步通知。

## 📁 新增文件

### 1. 接口定义
**文件**: `src/interfaces/ICommon.ts`

新增内容：
- `CoCoNamespace.AgentData` - 新增 `/agent-data` namespace
- `SpaceFaceSyncTrigger` - 触发类型枚举
- `SpaceFaceSyncNotifyEvent` - 通知事件枚举
- `SpaceFaceSyncMessage` - Redis 消息接口
- `SpacePullAESKeyNotify` - AES 密钥通知接口
- `SpacePullFaceListNotify` - 人脸列表通知接口
- `SpaceDeleteFacesNotify` - 删除人脸通知接口
- `SpaceLeaveSpaceNotify` - 离开家庭通知接口

### 2. AgentData Socket 命名空间
**文件**: `src/socketio/AgentDataSocket.ts` (新建)

核心功能：
- 独立的 `/agent-data` namespace，专门用于加密数据同步
- 处理设备连接和断开
- 管理家庭房间（spacesId）的加入和离开

### 3. Redis 订阅服务
**文件**: `src/services/redis/SpaceFaceSyncRedisService.ts` (新建)

核心功能：
- 订阅 Redis `space:face_sync` 频道
- 解析并分发不同类型的触发事件
- 通过 Socket.IO `/agent-data` namespace 向家庭设备广播通知

### 4. HTTP DAO
**文件**: `src/httpdao/cocoadmin/SpaceHttpdao.ts` (新建)

提供的方法（TODO 标记，待 API 准备）：
- `getSpaceAESKey(spacesId)` - 查询家庭 AES 密钥
- `getSpaceFaceList(spacesId)` - 查询家庭人脸列表
- `getSpaceDevices(spacesId)` - 查询家庭设备列表

### 5. 测试文档
**文件**: `docs/space-face-sync-test.md` (新建)

包含：
- 详细的测试步骤
- 各种触发类型的测试用例
- 故障排查指南

## 🎯 支持的触发类型

| 触发类型 | 说明 | 行为 |
|---------|------|------|
| `member_join` | 成员加入家庭 | 通知拉取 AES 密钥 + 人脸列表 |
| `device_bind` | 设备绑定到家庭 | 通知拉取 AES 密钥 + 人脸列表 |
| `face_add` | 人脸新增 | 通知拉取人脸列表 |
| `face_delete` | 删除人脸 | 通知删除指定人脸 |
| `member_leave` | 成员离开家庭 | 通知拉取最新人脸列表 + 设备离开房间 |
| `device_unbind` | 设备解绑 | 通知拉取最新人脸列表 + 设备离开房间 |

## 📡 设备端需要监听的事件

```typescript
// 1. 拉取 AES 密钥
socket.on('space:pull_aes_key', (data) => {
    // data: { spaces_id: string, aes_key?: string }
});

// 2. 拉取人脸列表
socket.on('space:pull_face_list', (data) => {
    // data: { spaces_id: string, face_list?: Array<FaceInfo> }
});

// 3. 删除人脸
socket.on('space:delete_faces', (data) => {
    // data: { spaces_id: string, face_ids: number[] }
});

// 4. 退出家庭房间
socket.on('space:leave_space', (data) => {
    // data: { spaces_id: string, reason: string }
    // 设备应删除非自己创建的人脸
});
```

## 🔧 Redis 消息格式

```json
{
    "spaces_id": "xxx",
    "trigger": "member_join|member_leave|device_bind|device_unbind|face_delete|face_add",
    "user_id": 123,
    "devices": [{
        "device_id": "uuid-string",
        "face_ids": [1, 2, 3]
    }]
}
```

## 🚀 启动和测试

### 启动服务
服务会在应用启动时自动启动 Redis 订阅：

```typescript
// src/app.ts
const spaceFaceSyncService = getInstanceByToken<SpaceFaceSyncRedisService>(SpaceFaceSyncRedisService)
await spaceFaceSyncService.startSubscription()
```

### 使用 Redis CLI 测试

```bash
# 连接 Redis
redis-cli

# 发布测试消息
PUBLISH space:face_sync '{"spaces_id":"test-space-001","trigger":"face_add","user_id":123,"devices":[{"device_id":"device-uuid-001","face_ids":[1,2,3]}]}'
```

## ⚠️ TODO 事项

在后端 API 准备完成后，需要更新：

1. **SpaceHttpdao.ts**
   - 更新 API 端点 URL（目前使用占位符）
   - 验证接口返回的数据结构

2. **ICommon.ts**
   - 完善 `SpacePullFaceListNotify.face_list` 的数据结构定义

3. **移除 TODO 注释**
   - 在各文件中搜索 "TODO: 待后端 API 准备" 并更新

## 📊 业务逻辑说明

### 1. 设备、人员新增 (device_bind, member_join)
- ✅ 通知家庭内所有设备拉取 AES 家庭密钥
- ✅ 通知家庭内所有设备拉取人脸下载列表

### 2. 人员、设备、人脸新增 (face_add)
- ✅ 通知家庭内所有设备拉取人脸下载列表

### 3. 删除人脸 (face_delete)
- ✅ 通知家庭内所有设备删除人脸（端侧删除，云端通知）

### 4. 人员退出家庭、设备解绑 (member_leave, device_unbind)
- ✅ 家庭内的设备删除退出设备/人员的人脸（通过拉取最新列表实现）
- ✅ 退出的设备离开家庭房间（端侧删除非自己创建的人脸）

## 🔍 日志监控

启动成功后会看到：
```
✅ Space face sync Redis subscription started
Successfully subscribed to Redis channel: space:face_sync
```

处理消息时会看到：
```
Received message from space:face_sync: {...}
Handling face_add: spaces_id=xxx, devices=[...]
Broadcasted space:pull_face_list to 2 devices in space: xxx
```

## 🎓 技术要点

1. **Redis 订阅**: 使用独立的 Redis 连接进行订阅，不影响主连接
2. **Socket.IO 房间**: 利用现有的家庭房间机制 (`socket.data.spacesId`)
3. **设备过滤**: 广播时只发送给客户端设备 (`AuthType.client`)
4. **错误处理**: 完善的异常捕获和日志记录
5. **异步处理**: 所有操作都是异步非阻塞的

## 📝 相关文档

- [详细测试文档](./space-face-sync-test.md)
- Socket.IO 连接逻辑: `src/socketio/AgentSocket.ts`
- Redis 插件: `src/plugins/ioredis.ts`

## 👥 协作要点

### 前端/客户端开发者
- 需要在设备端监听 4 个新的 Socket.IO 事件
- 收到 `space:leave_space` 时，删除非自己创建的人脸

### 后端 API 开发者
- 提供三个查询接口（AES 密钥、人脸列表、设备列表）
- 在相关业务操作后，向 Redis 发布 `space:face_sync` 消息

### 测试人员
- 参考测试文档进行各种场景的测试
- 关注日志输出和设备端的响应

## ✨ 功能特点

- ✅ 实时通知，无延迟
- ✅ 自动重连机制
- ✅ 完善的日志和监控
- ✅ 灵活的触发类型
- ✅ 精确的设备定位
- ✅ 支持批量操作
