# 使用 Node 作为构建基础镜像（多阶段构建）
FROM node:22-bookworm AS builder

# 接收构建参数（国内镜像源）
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 云端环境无需本地音频设备，跳过原生模块编译依赖安装

# 配置npm和yarn镜像源
RUN npm config set registry ${NPM_REGISTRY} \
    && yarn config set registry ${NPM_REGISTRY}

# 复制 package.json 和 yarn.lock
COPY package.json yarn.lock ./

# 安装全部依赖（包括开发依赖），并跳过编译脚本
RUN yarn install --ignore-scripts

# 复制全部源代码
COPY .. .

# 使用 yarn 构建项目（TypeScript 编译、路径别名修正、复制静态资源）
RUN yarn tsc && yarn tsc-alias && yarn copy-assets

# 生产环境镜像 - 使用 Node Debian 12 版本 (glibc 2.36)
FROM node:22-bookworm

# 设置工作目录
WORKDIR /app

# 安装 curl 用于健康检查
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# 云端环境无需 ALSA 运行库，移除相关安装

# 从构建阶段复制编译后的代码和依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 不复制 .env 文件，完全使用 ECS 环境变量
# COPY .env.prod /app/.env

# 设置环境变量
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LOG_TARGET=stdout

# 暴露端口
EXPOSE 3000

# 直接前台启动应用，日志输出到 stdout
CMD ["node", "--enable-source-maps", "dist/src/app.js"]