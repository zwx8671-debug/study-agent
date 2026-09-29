#!/bin/bash

# 启用BuildKit加速构建
export DOCKER_BUILDKIT=1


# 设置变量
IMAGE_NAME="coco-cloud-ts"
VERSION=$(date +"%Y%m%d%H%M")
DOCKER_REGISTRY="yuewa-repo-cn-guangzhou.cr.volces.com/coco"  # 替换为您的Docker仓库地址

# 显示构建信息
echo "开始构建 $IMAGE_NAME:$VERSION"

# 构建Docker镜像 - 添加优化选项
docker build \
  -f ../Dockerfile \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg NODE_MIRROR=https://registry.npmmirror.com \
  --build-arg ALPINE_MIRROR=https://mirrors.aliyun.com/alpine \
  --progress=plain \
  --pull \
  -t $DOCKER_REGISTRY/$IMAGE_NAME:$VERSION \
  -t $DOCKER_REGISTRY/$IMAGE_NAME:latest ..

echo "Docker镜像构建完成: $DOCKER_REGISTRY/$IMAGE_NAME:$VERSION"
echo "Docker镜像构建完成: $DOCKER_REGISTRY/$IMAGE_NAME:latest"

# 将版本号写入文件，供push脚本使用
echo $VERSION > .version