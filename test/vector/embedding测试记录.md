## 100条并发执行

文本长度：2

耗时中位数：1450ms

耗时区间：[1160-1700] 线性增长

总体耗时：2s
```shell
async function testEmbeddingStats() {
    // 发送到embedding API转向量
    const model: string = 'qwen3-embedding:0.6b'
    const provider: EmbedModelProvider = EmbedModelProvider.Other
    for (let i = 0; i < 100; i++) {
        embeddingService.getEmbedding('测试', model, provider)
    }
}
```

## 100条串行发执行

文本长度：2，

耗时中位数：80 ms

耗时区间：[60-140]

总体耗时：8s
```shell
async function testEmbeddingStats() {
    // 发送到embedding API转向量
    const model: string = 'qwen3-embedding:0.6b'
    const provider: EmbedModelProvider = EmbedModelProvider.Other
    for (let i = 0; i < 100; i++) {
       await embeddingService.getEmbedding('测试', model, provider)
    }
}
```
