#!/bin/bash

# 设置变量
IMAGE_NAME="coco-cloud-ts"
DOCKER_REGISTRY="yuewa-repo-cn-guangzhou.cr.volces.com/coco"  # 替换为您的Docker仓库地址

# 检查.version文件是否存在
if [ ! -f .version ]; then
    echo "错误: 未找到.version文件，请先运行build-docker.sh脚本"
    exit 1
fi

# 读取版本号
VERSION=$(cat .version)

# 显示推送信息
echo "开始推送 $DOCKER_REGISTRY/$IMAGE_NAME:$VERSION 到仓库"
echo "开始推送 $DOCKER_REGISTRY/$IMAGE_NAME:latest 到仓库"

# 推送Docker镜像到仓库
docker push $DOCKER_REGISTRY/$IMAGE_NAME:$VERSION
docker push $DOCKER_REGISTRY/$IMAGE_NAME:latest

echo "Docker镜像推送完成: $DOCKER_REGISTRY/$IMAGE_NAME:$VERSION"
echo "Docker镜像推送完成: $DOCKER_REGISTRY/$IMAGE_NAME:latest"