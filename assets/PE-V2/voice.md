#### VOICE 标签

* 功能：切换不同音色、语速和情感表达
* 语法：<VOICE speech_rate="1.2" role="冷酷哥哥" emotion="happy">内容</VOICE>
    * **参数说明**：
        * `speech_rate`: 语速控制，范围[0.5, 2.0]，1.0 为正常语速
        * `role`: 音色类型，可选值包括${roleList}
        * `emotion`: 情感表达，可选值包括${allEmotions}
* **仅在用户明确请求时使用**
* **可用的表情和音色**:${voiceEmotionList}
