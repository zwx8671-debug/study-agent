/** @format */
import { TTSFactory } from '../src/libs/voice/TTSFactory'
import { XmlVoiceElementHandler } from '../src/libs/xml/handler/XmlVoiceElementHandler'

async function runTests() {
    const attr = XmlVoiceElementHandler.getDefaultVoiceAttr()
    const texts = [
        '你好，请介绍一下你自己',
        '今天天气怎么样？',
        '帮我讲个笑话',
        '给我推荐几本书',
        '如何学习编程？',
        '请告诉我一些有趣的事实',
        '你能做什么？',
        '帮我写一首诗',
        '推荐一些电影',
        '讲一个故事',
        '什么是人工智能？',
        '如何保持健康？',
        '推荐一些学习资源',
        '介绍一下最新的科技',
        '如何提高工作效率？'
    ]

    const promises = texts.map(text => TTSFactory.synthesizeSpeech(text, attr))
    await Promise.all(promises)
}

runTests().then(r => {
    console.log(r)
})
