# Coco STT Service Dockerfile
FROM node:20-slim

WORKDIR /app

# 安装 curl (用于 health check)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json、lockfile 和 pnpm 构建审批配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 构建项目
RUN pnpm build

# 清理开发依赖
RUN pnpm store prune && pnpm install --prod

# 暴露端口
EXPOSE 4001 4000

# 设置环境变量
ENV NODE_ENV=production

# 启动应用 - 禁用文件日志，仅输出到 stdout
CMD ["node", "dist/src/app.js"]
