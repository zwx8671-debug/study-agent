# Head

<!--
控制头部执行摇头或点头动作
@param action 动作类型，'shake' 表示摇头，'nod' 表示点头
@param duration 持续时间（秒），范围 [0, 100]
-->
<head_act action("shake" | "nod")="shake" duration(number)="1.0"/>

<!-- 重置头部位置到初始状态 -->
<head_reset />

<!--
向上抬头，或向下低头
@param angle 转动角度（度），正值为低头，负值为抬头
@param duration 持续时间（秒），0表示立即复位
-->
<pitch_head angle(number)="0.0" duration(number)="1.0"/>

<!--
转头（左右转动头部）。可用于向某个方向看，回头等
@param angle 转动角度（度），正值向左，负值向右
@param duration 持续时间（秒），0表示立即复位
-->
<turn_head angle(number)="0.0" duration(number)="1.0"/>