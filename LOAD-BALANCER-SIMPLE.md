# Socket.IO 负载均衡 - 极简方案（推荐）

## 方案概述

基于 **Nginx Hash一致性路由** 的极简负载均衡方案，无需Lua脚本，无需缓存，完全无状态。

## 架构图

```
┌─────────────┐
│ 机器人/网页   │
│ device-sn   │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────┐
│   OpenResty/Nginx           │
│                             │
│  hash $http_device_sn       │ ← Hash一致性算法
│  consistent;                │   (无状态，无缓存)
│                             │
│  - 自动负载均衡             │
│  - 粘性会话保证             │
│  - 并发限制（900）          │
└──────┬──────────────────────┘
       │
       ├──→ coco-cloud-ts-1:8002 (max_conns=300)
       ├──→ coco-cloud-ts-2:8002 (max_conns=300)
       └──→ coco-cloud-ts-3:8002 (max_conns=300)
```

## 核心特性

### ✅ 优势

1. **极简架构**
   - 配置仅20行
   - 无需Lua脚本
   - 无需Redis存储映射
   - 无需缓存管理

2. **完全无状态**
   - Hash算法保证粘性会话
   - 无需存储设备映射
   - 无需清理缓存
   - 无需应用层通知

3. **高性能**
   - 纯Nginx原生功能
   - 无额外网络开销
   - 路由决策在纳秒级

4. **自动负载均衡**
   - Hash算法天然负载均衡
   - 设备自动分散到各服务器
   - 分布均匀

5. **完全解耦**
   - 应用服务器不知道网关存在
   - 网关不需要通知应用服务器
   - 零耦合，易维护

### ⚠️ 注意事项

1. **服务器变更影响**
   - 增加/减少服务器时，部分设备的路由会改变
   - 使用 `consistent` 关键字可最小化影响

2. **无法预知路由**
   - 无法提前知道某个设备会路由到哪个服务器
   - 但相同设备总是路由到同一服务器

## 工作原理

### Hash一致性路由

```
1. 客户端连接时携带 device-sn 请求头
   ↓
2. Nginx计算 hash(device-sn)
   ↓
3. 根据hash值选择后端服务器
   ↓
4. 相同device-sn → 相同hash值 → 相同服务器
   ↓
5. 建立WebSocket连接
```

### 示例

```
设备 ABC123:
  hash("ABC123") % 3 = 1 → 路由到 coco-cloud-ts-2

网页连接 ABC123:
  hash("ABC123") % 3 = 1 → 路由到 coco-cloud-ts-2 ✅ (同一个)

设备 DEF456:
  hash("DEF456") % 3 = 0 → 路由到 coco-cloud-ts-1
```

## 配置说明

### 1. Nginx配置 (openresty/nginx-simple.conf)

```nginx
http {
    # 上游服务器组 - Hash一致性路由
    upstream socket_backend {
        # 根据device-sn做hash，相同device-sn总是路由到同一服务器
        hash $http_device_sn consistent;
        
        # 每个服务器最大300并发
        server coco-cloud-ts-1:8002 max_fails=3 fail_timeout=30s max_conns=300;
        server coco-cloud-ts-2:8002 max_fails=3 fail_timeout=30s max_conns=300;
        server coco-cloud-ts-3:8002 max_fails=3 fail_timeout=30s max_conns=300;
    }

    # 总并发限制（300）
    limit_conn_zone $server_name zone=total_conn_limit:10m;
    limit_conn_status 503;

    server {
        listen 80;
        
        # 限制总并发连接数为900
        limit_conn total_conn_limit 900;

        location /socket.io/ {
            # 直接代理，nginx自动根据hash选择后端
            proxy_pass http://socket_backend;
            proxy_http_version 1.1;
            
            # WebSocket升级
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            
            # 传递device-sn用于hash
            proxy_set_header device-sn $http_device_sn;
            proxy_set_header device-sign $http_device_sign;
        }
        
        # 503错误页面
        error_page 503 @503_json;
        location @503_json {
            return 503 '{"error":"Max connections reached","code":503}';
        }
    }
}
```

### 2. Docker Compose配置

```yaml
services:
  # 三个应用实例
  coco-cloud-ts-1:
    build: .
    container_name: coco-cloud-ts-1
    environment:
      - PORT=8002

  coco-cloud-ts-2:
    build: .
    container_name: coco-cloud-ts-2
    environment:
      - PORT=8002

  coco-cloud-ts-3:
    build: .
    container_name: coco-cloud-ts-3
    environment:
      - PORT=8002

  # OpenResty负载均衡
  openresty:
    image: openresty/openresty:alpine
    container_name: coco-openresty
    ports:
      - "80:80"
    volumes:
      - ./openresty/nginx-simple.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro
```

## 使用说明

### 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f openresty

# 查看应用服务器日志
docker-compose logs -f coco-cloud-ts-1
```
