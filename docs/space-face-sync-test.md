# 家庭人脸同步功能测试文档

## 功能概述

该功能实现了 Redis 订阅 `space:face_sync` 频道，根据不同的触发事件通知家庭内的设备进行人脸同步操作。

## 架构说明

### 1. 数据流

```
外部系统 → Redis (space:face_sync) → SpaceFaceSyncRedisService → Socket.IO (/agent-data) → 设备端
```

### 2. 核心文件

- `src/interfaces/ICommon.ts` - 定义接口和事件类型
- `src/socketio/AgentDataSocket.ts` - `/agent-data` namespace（专门用于加密数据同步）
- `src/services/redis/SpaceFaceSyncRedisService.ts` - Redis 订阅服务
- `src/httpdao/cocoadmin/SpaceHttpdao.ts` - HTTP DAO（查询家庭数据）
- `src/app.ts` - 启动订阅服务

### 3. 重要说明

**设备连接要求**: 设备需要连接到 `/agent-data` namespace 才能接收人脸同步通知。这是一个独立的 namespace，专门用于处理加密数据同步。

连接示例：
```typescript
const socket = io('http://localhost:3000/agent-data', {
    auth: { token: 'your-device-token' }
});
```

## 触发事件类型

### 1. member_join (成员加入家庭)

**行为**:
- 通知家庭内所有设备拉取 AES 密钥
- 通知家庭内所有设备拉取人脸列表

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "member_join",
    "user_id": 123,
    "devices": []
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:pull_aes_key` 事件
- 家庭内所有客户端设备收到 `space:pull_face_list` 事件

---

### 2. device_bind (设备绑定到家庭)

**行为**:
- 通知家庭内所有设备拉取 AES 密钥
- 通知家庭内所有设备拉取人脸列表

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "device_bind",
    "user_id": 123,
    "devices": [{
        "device_id": "device-uuid-001",
        "face_ids": []
    }]
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:pull_aes_key` 事件
- 家庭内所有客户端设备收到 `space:pull_face_list` 事件

---

### 3. face_add (人脸新增)

**行为**:
- 通知家庭内所有设备拉取人脸列表

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "face_add",
    "user_id": 123,
    "devices": [{
        "device_id": "device-uuid-001",
        "face_ids": [1, 2, 3]
    }]
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:pull_face_list` 事件

---

### 4. face_delete (删除人脸)

**行为**:
- 通知家庭内所有设备删除指定人脸

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "face_delete",
    "user_id": 123,
    "devices": [{
        "device_id": null,
        "face_ids": [1, 2, 3]
    }]
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:delete_faces` 事件
- 事件数据包含要删除的人脸 ID 列表: `[1, 2, 3]`

---

### 5. member_leave (成员离开家庭)

**行为**:
- 通知家庭内设备拉取最新人脸列表（删除离开成员的人脸）
- 让离开用户的设备退出家庭房间（设备端删除非自己创建的人脸）

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "member_leave",
    "user_id": 123,
    "devices": [{
        "device_id": "device-uuid-001",
        "face_ids": []
    }]
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:pull_face_list` 事件
- 指定设备收到 `space:leave_space` 事件并离开家庭房间

---

### 6. device_unbind (设备从家庭解绑)

**行为**:
- 通知家庭内设备拉取最新人脸列表（删除解绑设备的人脸）
- 让解绑的设备退出家庭房间（设备端删除非自己创建的人脸）

**测试消息**:
```json
{
    "space_id": "test-space-001",
    "trigger": "device_unbind",
    "user_id": 123,
    "devices": [{
        "device_id": "device-uuid-001",
        "face_ids": []
    }]
}
```

**预期结果**:
- 家庭内所有客户端设备收到 `space:pull_face_list` 事件
- 指定设备收到 `space:leave_space` 事件并离开家庭房间

---

## 手动测试步骤

### 前置条件

1. 启动应用服务
2. 至少有一个设备连接到 Socket.IO 并加入家庭房间
3. 确保 Redis 服务可用

### 使用 Redis CLI 测试

**注意**：当前使用 **Redis Streams + Consumer Group** 架构，请使用以下命令：

```bash
# 连接到 Redis
redis-cli

# 发布测试消息到 Stream - 成员加入（使用 XADD）
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"member_join","user_id":123,"devices":[{"device_id":"device-001","face_ids":[]}]}'
XADD space:user_info_sync * data '{"space_id":"019d057d-e1f9-706f-ac3d-a0e619a02cd0","trigger":"member_join"}'

# 发布测试消息到 Stream - 设备绑定
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"device_bind","user_id":123,"devices":[{"device_id":"device-uuid-001","face_ids":[]}]}'
XADD space:face_sync * data '{ "space_id": "019d057d-e1f9-706f-ac3d-a0e619a02cd0", "trigger": "device_bind", "user_id": null, "devices": [ { "device_sn": "ZWX001", "face_ids": [] } ] }'

# 发布测试消息到 Stream - 人脸新增
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"face_add","user_id":123,"devices":[{"device_id":"device-uuid-001","face_ids":[1,2,3]}]}'

# 发布测试消息到 Stream - 删除人脸
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"face_delete","user_id":123,"devices":[{"device_id":null,"face_ids":[1,2,3]}]}'

# 发布测试消息到 Stream - 成员离开
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"member_leave","user_id":123,"devices":[{"device_id":"device-uuid-001","face_ids":[]}]}'

# 发布测试消息到 Stream - 设备解绑
XADD space:face_sync * data '{"space_id":"test-space-001","trigger":"device_unbind","user_id":123,"devices":[{"device_id":"device-uuid-001","face_ids":[]}]}'

# 查看 Stream 长度
XLEN space:face_sync:stream

# 查看 Stream 信息
XINFO STREAM space:face_sync

# 查看消费者组信息
XINFO GROUPS space:face_sync

# 查看 Pending 消息
XPENDING space:face_sync face-sync-group

# 读取最新消息（不消费，仅查看）
XREAD COUNT 10 STREAMS space:face_sync 0
```

### 使用 Node.js 脚本测试

创建测试脚本 `test-redis-stream.js`:

```javascript
const Redis = require('ioredis');

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    // password: 'your_password',
});

const STREAM_KEY = 'space:face_sync:stream';

async function pushMessage(trigger, data) {
    const message = JSON.stringify({
        space_id: 'test-space-001',
        trigger,
        user_id: 123,
        ...data
    });
    
    // 使用 XADD 推入 Stream
    const messageId = await redis.xadd(
        STREAM_KEY,
        'MAXLEN', '~', '10000',  // 保留最新 10000 条
        '*',  // 自动生成 ID
        'message', message
    );
    console.log(`✅ Pushed ${trigger} to stream`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Message: ${message}`);
}

async function test() {
    console.log('🚀 Starting stream test...\n');
    
    // 测试成员加入
    await pushMessage('member_join', { 
        devices: [{ device_id: 'device-001', face_ids: [] }] 
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试人脸新增
    await pushMessage('face_add', {
        devices: [{
            device_id: 'device-uuid-001',
            face_ids: [1, 2, 3]
        }]
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试删除人脸
    await pushMessage('face_delete', {
        devices: [{
            device_id: null,
            face_ids: [1, 2, 3]
        }]
    });
    
    // 查看 Stream 长度
    const length = await redis.xlen(STREAM_KEY);
    console.log(`\n📊 Current stream length: ${length}`);
    
    // 查看消费者组信息
    try {
        const groups = await redis.xinfo('GROUPS', STREAM_KEY);
        console.log('\n📊 Consumer groups:', groups);
    } catch (error) {
        console.log('\n⚠️  No consumer groups yet');
    }
    
    redis.disconnect();
    console.log('\n✅ Test completed!');
}

test().catch(console.error);
```

### 使用 SpaceFaceSyncPublisher 服务发布消息

在应用代码中使用发布器：

```typescript
import { getInstanceByToken } from 'fastify-decorators'
import { SpaceFaceSyncPublisher } from '@service/redis/SpaceFaceSyncPublisher'
import { SpaceFaceSyncTrigger } from '@interface/ICommon'

// 获取发布器实例
const publisher = getInstanceByToken<SpaceFaceSyncPublisher>(SpaceFaceSyncPublisher)

// 发布消息
await publisher.publish({
    space_id: 'space-001',
    trigger: SpaceFaceSyncTrigger.FACE_ADD,
    user_id: 123,
    devices: [{
        device_id: 'device-001',
        face_ids: [1, 2, 3]
    }]
})

// 批量发布
await publisher.publishBatch([
    { space_id: 'space-001', trigger: SpaceFaceSyncTrigger.MEMBER_JOIN, user_id: 123, devices: [] },
    { space_id: 'space-002', trigger: SpaceFaceSyncTrigger.FACE_ADD, user_id: 456, devices: [] }
])

// 查询队列长度
const queueLength = await publisher.getQueueLength()
console.log(`Queue length: ${queueLength}`)
```

## 设备端监听事件

设备端需要监听以下 Socket.IO 事件：

```typescript
// 1. 拉取 AES 密钥
socket.on('space:pull_aes_key', (data) => {
    console.log('Received AES key:', data);
    // data: { space_id: string, aes_key?: string }
});

// 2. 拉取人脸列表
socket.on('space:pull_face_list', (data) => {
    console.log('Received face list:', data);
    // data: { space_id: string, face_list?: Array<FaceInfo> }
});

// 3. 删除人脸
socket.on('space:delete_faces', (data) => {
    console.log('Delete faces:', data);
    // data: { space_id: string, face_ids: number[] }
});

// 4. 退出家庭房间
socket.on('space:leave_space', (data) => {
    console.log('Leave space:', data);
    // data: { space_id: string, reason: string }
    // 设备端应删除非自己创建的人脸
});
```

## 日志观察

查看服务日志，应该能看到类似以下内容：

```
[SpaceFaceSyncRedisService] Successfully subscribed to Redis channel: space:face_sync
[SpaceFaceSyncRedisService] Received message from space:face_sync: {"space_id":"test-space-001",...}
[SpaceFaceSyncRedisService] Handling member_join: space_id=test-space-001, user_id=123
[SpaceFaceSyncRedisService] Notified devices to pull AES key for space: test-space-001
[SpaceFaceSyncRedisService] Broadcasted space:pull_aes_key to 2 devices in space: test-space-001
```

## TODO 项

在 API 准备完成后，需要更新以下部分：

1. `SpaceHttpdao.ts` 中的 API 端点 URL
2. `SpacePullFaceListNotify` 接口中的人脸列表数据结构
3. 移除相关 TODO 注释

## 故障排查

### 订阅未启动
- 检查日志是否有 "Successfully subscribed to Redis channel" 消息
- 检查 Redis 连接配置是否正确

### 设备未收到通知
- 检查设备是否已加入家庭房间（`socket.data.spacesId`）
- 检查设备认证类型是否为 `AuthType.client`
- 检查日志中的 "Broadcasted to X devices" 数量

### 消息格式错误
- 检查 Redis 发布的消息是否符合 `SpaceFaceSyncMessage` 接口定义
- 检查 `space_id` 和 `trigger` 字段是否存在

## 性能考虑

- Redis 订阅使用独立的连接，不会影响主连接
- 消息处理是异步的，不会阻塞其他操作
- Socket.IO 广播仅发送给客户端设备，过滤掉 web 端连接
