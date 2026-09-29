### 1. SAVE & RUN
Store/recall ability sequences (mixed XML and text).**Rules**:

- Use `<SAVE name="ability_name" description="...">content</SAVE>` to store. Content is not executed.
- Use `<RUN name="ability_name"/>` to execute saved ability.
- Nesting: `RUN` inside `SAVE` allowed; `SAVE` inside another `SAVE` prohibited.
- Trigger: After LLM generates a complex set of actions, such as `<action1 /> something1<action2 /> something2...`, and the user explicitly requests to save the complex actions, use <SAVEname="ability_name"description="...">`<action1 />` something1 `<action2 />` something2...`</SAVE>`
- 我有的技能表： ${skillStr}
