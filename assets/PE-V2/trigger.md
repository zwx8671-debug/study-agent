### 3. TRIGGER - 条件触发器

条件触发器允许你标识在满足特定条件时自动执行的动作序列，实现智能化的自主行为。

#### 语法结构

    <TRIGGER name="触发器名称" description="功能描述">
      <!-- 条件定义 -->
      <condition_logic_structure>
        ...
      </condition_logic_structure>
      <!-- 动作定义 -->
      <then>
        ...
      </then>
    </TRIGGER>

#### 参数说明

* **name** (必需): 触发器的唯一标识符，用于区分不同触发器
* **description** (必需): 触发器功能的可读描述，便于理解和维护

#### 条件规则

* 单一条件：允许使用单一条件
* 多个条件逻辑组合
    * **AND 逻辑**: `<and>条件1条件2</and>` - 所有条件都必须满足
    * **OR 逻辑**: `<or>条件1条件2</or>` - 任一条件满足即可
    * **NOT 逻辑**: `<not>条件</not>` - 条件不满足时触发
* 嵌套逻辑：支持复杂的条件组合，可创建多层级的逻辑判断

#### 支持的条件类型

1. Timer - 时间条件基于时间的触发条件

* **语法**: `<timer hour="小时" minute="分钟" />`
* **示例**: `<timer hour="9" minute="30" />` (每天上午 9:30 触发)

2. Face Detection - 人脸识别条件基于人脸识别的触发条件

* **语法**: `<face_detect name="人物名称" />`
* **示例**: `<face_detect name="主人" />` (检测到主人时触发)

3. Power - 电量条件基于电池电量的触发条件

* **语法**: `<power value="电量百分比" />`
* **示例**: `<power value="20" />` (电池电量低于 20%时触发)

#### 使用示例

**示例 1: 低电量提醒**

    <TRIGGER name="low_battery_reminder" description="电量低时提醒充电">
      <power value="20"/>
      <then>
        电量不足20%，请尽快充电！<frustrated/>
      </then>
    </TRIGGER>

**示例 2: 早晨问候**

    <TRIGGER name="morning_greeting" description="每天早晨向主人问好">
      <and>
        <timer hour="8" minute="0" />
        <face_detect name="主人" />
      </and>
      <then>
        早上好！<wave/> 祝你今天愉快！<happy/>
      </then>
    </TRIGGER>

**示例 3: 复杂条件触发**

    <TRIGGER name="smart_greeting" description="识别熟悉面孔且电量充足时问候">
      <and>
        <or>
          <face_detect name="Alice"/>
          <face_detect name="Bob"/>
        </or>
        <not>
          <power value="20"/>
        </not>
      </and>
      <then>
        你好！<wave/> 很高兴见到你！
      </then>
    </TRIGGER>

#### 使用规则

1. **延迟激活**：定义的触发器不会立即执行，而是在后续交互中条件满足时激活
2. **并发执行**：多个触发器可以同时处于激活状态
3. **持久性**：触发器会持续存在，直到被显式移除或替换
4. **条件明确性**：使用清晰具体的条件描述确保触发器正确激活
