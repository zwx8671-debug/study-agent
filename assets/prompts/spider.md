# Spider Body

<!--
苍蝇搓手
@param speed 速度 取值范围 [0, 100]
@param amplitude 幅度 取值范围 [0, 100]
@param times 执行次数
-->
<fly_rub_hands speed(number)="60" amplitude(number)="60" times(number)="3"/>

<!--
前腿敲击
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<arm_knock speed(number)="50" times(number)="3"/>

<!--
划水移动
@param direction 移动方向
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<arm_pull direction("forward" | "backward")="forward" speed(number)="50" times(number)="3"/>

<!--
身体倾斜，左右耸肩
@param direction 倾斜方向，'left' 向左倾斜, 'right' 向右倾斜
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<body_lean direction("left" | "right")="right" duration(number)="1.0"/>

<!--
扩胸运动
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<chest_expansion_exercise speed(number)="50" times(number)="3"/>

<!--
匍匐移动
@param direction 移动方向
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<creep direction("left" | "right" | "forward" | "backward")="forward" speed(number)="50" times(number)="3"/>

<!--
用四肢进行：单手扣/敲击/刨地板的动作，可用于例如招手，挥手，点地，单手画圈圈等
@param leg 1-4 代表四肢编号，1=右前，2=左前，3=左后，4=右后，只支持单个肢体
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<excavate_floor leg(1 | 2 | 3 | 4)="1" speed(number)="80" times(number)="3"/>

<!--
晕眩，原地扭动/螺旋晃动身体
@param speed 速度 取值范围 [0, 100]
@param amplitude 晃动幅度 取值范围 [0, 100]
@param times 执行次数
-->
<giddy speed(number)="50" amplitude(number)="50" times(number)="3"/>

<!--
闲置模式
@param enable true 进入闲置模式，false 退出闲置模式
-->
<idle enable(boolean)="false"/>

<!--
前后移动
@param speed 速度 取值范围 [-100, 100]，向前是正数，向后是负数
@param duration 持续时间，单位: 秒，取值范围 [0, 100]，-1表示无限循环
-->
<run speed(number)="50" duration(number)="3.0"/>

<!--
潜行向前走
@param speed 速度 取值范围 [0, 100]
@param amplitude 步伐大小 取值范围 [0, 100]
@param distance 移动距离，单位: 厘米
@param height 高度百分比 取值范围 [0, 100] 为0表示贴地
-->
<move_covertly speed(number)="60" amplitude(number)="50" distance(number)="5" height(number)="50"/>

<!--
平移移动
@param direction 移动方向
@param stride_size 步伐大小，'big' 大步, 'small' 小步
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<move_strides direction("left" | "right" | "forward" | "backward")="forward" stride_size("big" | "small")="big" speed(number)="50" times(number)="3"/>

<!--
做俯卧撑
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<push_up duration(number)="3.0"/>

<!-- 停止所有身体动作，复位 -->
<reset />

<!--
身体旋转
@param rotate_speed 旋转速度 取值范围 [-360, 360]，向左是正数，向右是负数
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<rotate rotate_speed(number)="50" duration(number)="1.0"/>

<!--
向某个方向原地转动身体一定角度
@param angle 旋转角度，单位: 度，正数向左，负数向右, 如向左20度:angle=20 向右20度:angle=-20
-->
<rotate angle(number)="0.0"/>

<!--
前后移动多少厘米
@param speed 速度 取值范围 [0, 100]
@param amplitude 幅度 取值范围 [0, 100]
@param distance 移动距离，单位: 厘米，正数向前，负数向后
-->
<run_distance speed(number)="0" amplitude(number)="50" distance(number)="0.0"/>

<!--
扭屁股
@param speed 速度 取值范围 [0, 100]
@param amplitude 晃动幅度 取值范围 [0, 100]
@param times 执行次数
-->
<shake_ass speed(number)="60" amplitude(number)="50" times(number)="3"/>

<!--
学狗一样蹦迪
@param speed 速度 取值范围 [0, 100]
@param amplitude 晃动幅度 取值范围 [0, 100]
@param times 执行次数
-->
<shake_like_dog speed(number)="60" amplitude(number)="50" times(number)="3"/>

<!--
单腿敲击
@param leg 1-4 代表四肢编号，1=右前，2=左前，3=左后，4=右后，只支持单个肢体
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<single_leg_knock leg(1 | 2 | 3 | 4)="1" speed(number)="60" times(number)="3"/>

<!--
坐下
@param style 坐姿风格，'dog' 小狗坐, 'T' 丁字坐, 'normal' 正常坐
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<sit style("dog" | "T" | "normal")="dog" duration(number)="1.0"/>

<!--
丁字坐抖动
@param speed 速度 取值范围 [0, 100]
@param amplitude 幅度 取值范围 [0, 100]
@param times 执行次数
-->
<sit_and_shake speed(number)="60" amplitude(number)="50" times(number)="3"/>

<!--
站立姿态
@param posture 站立姿态，'forerake' 前倾站立, 'hypsokinesis' 后仰站立, 'normal' 正常站立
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<stand posture("normal" | "forerake" | "hypsokinesis")="normal" duration(number)="1.0"/>

<!--
身体前倾，或后仰，并左右摇动身体
@param posture 姿态，'forerake' 前倾, 'hypsokinesis' 后仰
@param speed 速度 取值范围 [0, 100]
@param times 执行次数
-->
<swing_side_to_side posture("forerake" | "hypsokinesis")="forerake" speed(number)="50" times(number)="3"/>

<!--
向后仰摔倒
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<trumble_down duration(number)="1.0"/>

<!--
身体波浪般左右起伏（原地）
@param speed 速度 取值范围 [0, 100]
@param amplitude 幅度 取值范围 [0, 100]
@param times 执行次数
-->
<wave speed(number)="60" amplitude(number)="50" times(number)="3"/>

<!--
蠕动前行
@param duration 持续时间，单位: 秒，取值范围 [0, 100]
-->
<wriggle duration(number)="3.0"/>