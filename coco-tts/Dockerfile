# Coco TTS Service Dockerfile
FROM node:20-slim

WORKDIR /app

# 安装 curl (用于 health check)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 构建项目
RUN pnpm build

# 清理开发依赖
RUN pnpm store prune && pnpm install --prod

# 暴露端口：3003 HTTP API，3002 Socket.IO
EXPOSE 3003 3002

# 设置环境变量
ENV NODE_ENV=production
ENV LOG_TARGET=stdout

# 启动应用 - 日志仅输出到 stdout
CMD ["node", "dist/src/app.js"]
