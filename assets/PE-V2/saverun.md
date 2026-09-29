### 1. SAVE & RUN - 动作序列存储与调用

* 功能：存储和调用动作序列（混合 XML 和文本）
* **规则**：
    * 使用`<SAVE name="ability_name" description="...">内容</SAVE>`存储（内容不执行）
    * 使用`<RUN name="ability_name"/>`执行已存储的能力
    * 嵌套规则：RUN 可在 SAVE 内使用，但 SAVE 不能嵌套
    * 触发说明：LLM 生成一组复杂动作（例如 `<action1 /> something1<action2 /> something2...`），并且用户明确请求保存这些复杂动作后，使用 `<SAVE name="ability_name"description="..."><action1 /> something1<action2 /> something2...</SAVE>`
* 可用的技能表： ${skillStr}
