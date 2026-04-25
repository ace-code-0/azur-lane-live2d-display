`README.md`

# azur-lane-live2d-display

## 学习目标

参考 Live2D 官方编辑器执行流程：

https://live2d.pavostudio.com/doc/zh-cn/exstudio/live2d-editor/#_1

原图：

https://live2d.pavostudio.com/doc/zh-cn/exstudio/images/le-3-01.png

## Live2D 执行流程（中文）

```mermaid
flowchart TD
  A([模型更新]) --> B[恢复已保存的参数 / 部件透明度]
  B --> C[播放 motion3.json]
  C --> D[控制器：区域触发]
  D --> E[执行命令：设置参数 / 设置部件]
  E --> F[保存参数 / 部件透明度]
  F --> G[应用 pose3.json]
  G --> H[控制器：眨眼 / 口型同步 / 鼠标跟随 / 额外动作 / 自动呼吸 / 加速度计 / 参数循环]
  H --> I[播放 exp3.json]
  I --> J[面部 / 手部追踪]
  J --> K[控制器：手势触发]
  K --> L[执行命令：参数锁定 / 部件锁定]
  L --> M[控制器：麦克风 / 参数命中（低优先级）]
  M --> N[应用 physics3.json]
  N --> O([模型渲染])
  O --> P[控制器：参数命中（高优先级）/ 部件透明度 / 参数值 / 参数触发]
  P --> Q([等待下一帧])
  Q -. 下一帧 .-> A
```

## Live2D Execution Flow (English)

```mermaid
flowchart TD
  A([Model Update]) --> B[Restore saved parameters / part opacities]
  B --> C[Play motion3.json]
  C --> D[Controller: Area Trigger]
  D --> E[Execute commands: parameter set / part set]
  E --> F[Save parameters / part opacities]
  F --> G[Apply pose3.json]
  G --> H[Controller: Eye Blink / Lip Sync / Mouse Tracking / Extra Motion / Auto Breath / Accelerometer / Param Loop]
  H --> I[Play exp3.json]
  I --> J[Face / Hand Tracking]
  J --> K[Controller: Hand Trigger]
  K --> L[Execute commands: parameter lock / part lock]
  L --> M[Controller: Microphone / Param Hit Low Priority]
  M --> N[Apply physics3.json]
  N --> O([Model Rendering])
  O --> P[Controller: Param Hit High Priority / Part Opacity / Param Value / Param Trigger]
  P --> Q([Wait for next frame])
  Q -. next frame .-> A
```
