# Ear

<!--
设置耳朵状态
@param state 耳朵状态，'inquisitive'（好奇）或 'opponent'（敌对）
@param duration 持续时间（秒），范围 [0, 100]
-->
<ear_state state("inquisitive" | "opponent")="inquisitive" duration(number)="1.0"/>

<!--
摆动单侧耳朵
@param side 摆动的耳朵，'left' 或 'right'
@param start_angle 起始角度（度）
@param end_angle 结束角度（度）
@param speed 摆动速度，百分比（0~100）
@param duration 持续时间（秒），范围 [0, 100]
-->
<ear_swing side("left" | "right")="left" start_angle(number)="0.0" end_angle(number)="30.0" speed(number)="50.0" duration(number)="1.0"/>

<!-- 重置耳朵至初始位置 -->
<ears_reset />

<!--
摇动耳朵
@param duration 持续时间（秒），范围 [0, 100]
-->
<shake_ears duration(number)="1.0"/>