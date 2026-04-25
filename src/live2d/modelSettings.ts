import { sanitizeModelSettingsAssetPaths } from './modelAssetPath';

export const MODEL_TYPE = {
  Live2D: 0,
} as const;

export type ModelType = (typeof MODEL_TYPE)[keyof typeof MODEL_TYPE];

export const VARIABLE_RULE_TYPE = {
  Condition: 1,
  Assignment: 2,
} as const;

export type VariableRuleType =
  (typeof VARIABLE_RULE_TYPE)[keyof typeof VARIABLE_RULE_TYPE];

export const PARAMETER_BLEND_MODE = {
  Override: 0,
  Additive: 1,
  Multiply: 2,
} as const;

export type ParameterBlendMode =
  (typeof PARAMETER_BLEND_MODE)[keyof typeof PARAMETER_BLEND_MODE];

export const POINTER_AXIS = {
  X: 0,
  Y: 1,
} as const;

export type PointerAxis = (typeof POINTER_AXIS)[keyof typeof POINTER_AXIS];

export const PARAMETER_RELEASE_TYPE = {
  ResetToDefault: 0,
} as const;

export type ParameterReleaseType =
  (typeof PARAMETER_RELEASE_TYPE)[keyof typeof PARAMETER_RELEASE_TYPE];

export const CONTROLLER_INPUT_SOURCE = {
  Static: 0,
  MouseX: 1,
  MouseY: 2,
} as const;

export type ControllerInputSource =
  (typeof CONTROLLER_INPUT_SOURCE)[keyof typeof CONTROLLER_INPUT_SOURCE];

export const MASK_TEXTURE_FILTER_MODE = {
  Bilinear: 0,
  Nearest: 1,
} as const;

export type MaskTextureFilterMode =
  (typeof MASK_TEXTURE_FILTER_MODE)[keyof typeof MASK_TEXTURE_FILTER_MODE];

export type AnisotropicFilteringLevel = 0 | 2 | 4 | 8 | 16;

export const ARTMESH_CULLING_MODE = {
  Default: 0,
} as const;

export type ArtmeshCullingMode =
  (typeof ARTMESH_CULLING_MODE)[keyof typeof ARTMESH_CULLING_MODE];

export type VarFloats = {
  // 浮点变量名；变量可用于动作条件判断，也可在动作触发后被写入。
  Name: string;
  // 变量规则类型：Condition 表示执行前检查，Assignment 表示触发后写入。
  Type: VariableRuleType;
  // 条件或操作表达式，例如 `equal 0`、`assign 1`。
  Code: string;
};

export type Choice = {
  // 文本框中展示的选项文案。
  Text: string;
  // 选择后执行的动作引用，格式为 `MotionGroup` 或 `MotionGroup:MotionName`。
  NextMtn: string;
};

export type MotionItem = {
  // 动作事件名；其他动作引用该事件时需要填写。
  Name: string;
  // 动作播放时的音频文件。
  Sound?: string;
  // motion3.json 动作文件。
  File?: string;
  // 动作到达末尾后是否从头继续播放。
  FileLoop?: boolean;
  // 动作执行时显示的文本。
  Text?: string;
  // 文本自定义显示时长；未设置时由 UI 自动估算。
  TextDuration?: number;
  // 动作开始前执行的命令；多个命令用分号分隔。
  Command?: string;
  // 动作结束后执行的命令；循环动作不会触发结束事件。
  PostCommand?: string;
  // 浮点变量条件或写入规则。
  VarFloats?: VarFloats[];
  // 触发权重，范围 1-999；值越大，随机选中概率越高。
  Weight?: number;
  // 动作播放速度；默认 1。
  Speed?: number;
  // 动作事件自定义持续时间；设置后不再依赖动作或音频长度。
  MotionDuration?: number;
  // 在文本框中显示可选项，并在选择后执行对应的 NextMtn。
  Choices?: Choice[];
  // 是否允许该动作事件执行；false 时禁用。
  Enabled?: boolean;
};

// 动作组集合。预定义组包括 Idle、Tap、TapAreaName、Start、Shake、
// Tick/TickX/tick_x、LeaveX_Y_Z/leave_x_y_z；自定义组可用 `Group#Layer`
// 指定动作层。
export type Motions = Record<string, MotionItem[]>;

export type HitArea = {
  // 触发区域名称；TapAreaName 中的 AreaName 也使用该名称。
  Name: string;
  // 模型 ArtMesh ID。
  Id?: string;
  // 点击区域时触发的动作引用。
  Motion?: string;
};

export type PhysicsV2 = {
  // physic3.json 物理文件。
  File: string;
  // 物理对模型的影响权重；值越大影响越强。
  MaxWeight: number;
};

export type FileReferences = {
  // moc3 模型文件。
  Moc: string;
  // 纹理文件，顺序必须和模型一致。
  Textures: string[];
  // 物理文件引用；兼容旧配置字段。
  Physics: string;
  // EX Studio 使用的物理配置。
  PhysicsV2: PhysicsV2;
  // 动作组定义。
  Motions: Motions;
};

export type ParamHitItem = {
  // 参数拖拽项名称。
  Name: string;
  // 被控制的模型参数 ID。
  Id: string;
  // 触发拖拽的 HitArea 名称。
  HitArea: string;
  // 鼠标移动使用的轴。
  Axis: PointerAxis;
  // 每移动 1 像素带来的参数变化量。
  Factor: number;
  // 松开鼠标后的回弹方式。
  ReleaseType: ParameterReleaseType;
  // 参数达到最大值时触发的动作引用。
  MaxMtn: string;
};

export type KeyTriggerItem = {
  // KeyboardEvent.keyCode。
  Input: number;
  // 按下按键时触发的动作引用。
  DownMtn: string;
};

export type EyeBlinkItem = {
  // 被眨眼控制器写入的参数 ID。
  Id: string;
  // 参数最小值。
  Min: number;
  // 参数最大值。
  Max: number;
  // 与动作参数混合时的模式。
  BlendMode: ParameterBlendMode;
  // 固定输入源；眨眼由控制器内部驱动。
  Input: typeof CONTROLLER_INPUT_SOURCE.Static;
};

export type LipSyncItem = {
  // 被口型同步控制器写入的参数 ID。
  Id: string;
  // 参数最小值。
  Min: number;
  // 参数最大值。
  Max: number;
  // 固定输入源；口型由音频音量驱动。
  Input: typeof CONTROLLER_INPUT_SOURCE.Static;
};

export type MouseTrackingItem = {
  // 被鼠标追踪控制器写入的参数 ID。
  Id: string;
  // 参数最小值。
  Min: number;
  // 参数最大值。
  Max: number;
  // 鼠标输入居中时的默认参数值。
  DefaultValue: number;
  // 与动作参数混合时的模式。
  BlendMode: ParameterBlendMode;
  // 鼠标轴；部分配置使用 Input 表达同一语义。
  Axis?: PointerAxis;
  // 鼠标输入源。
  Input:
    | typeof CONTROLLER_INPUT_SOURCE.MouseX
    | typeof CONTROLLER_INPUT_SOURCE.MouseY;
};

export type PartOpacityItem = {
  // 部件透明度项名称。
  Name: string;
  // 被设置透明度的 Part ID 列表。
  Ids: string[];
  // 目标透明度。
  Value: number;
};

export type EmptyController = Record<string, never>;

export type ParamHitController = {
  // 鼠标拖拽参数项。
  Items: ParamHitItem[];
  // 是否启用参数拖拽控制器。
  Enabled: boolean;
};

export type KeyTriggerController = {
  // 按键触发项。
  Items: KeyTriggerItem[];
  // 是否启用按键触发控制器。
  Enabled: boolean;
};

export type EyeBlinkController = {
  // 两次眨眼之间的最小间隔。
  MinInterval: number;
  // 两次眨眼之间的最大间隔。
  MaxInterval: number;
  // 被眨眼控制器影响的参数项。
  Items: EyeBlinkItem[];
};

export type LipSyncController = {
  // 音频音量到嘴部开合的增益；值越大越敏感。
  Gain: number;
  // 被口型同步控制器影响的参数项。
  Items: LipSyncItem[];
};

export type MouseTrackingController = {
  // 平滑时间；值越大，模型跟随鼠标越慢也越平滑。
  SmoothTime: number;
  // 被鼠标追踪控制器影响的参数项。
  Items: MouseTrackingItem[];
  // 是否启用鼠标追踪。
  Enabled: boolean;
};

export type PartOpacityController = {
  // 预设部件透明度项。
  Items: PartOpacityItem[];
  // 是否启用部件透明度控制器。
  Enabled: boolean;
};

export type ArtmeshCullingController = {
  // 默认 ArtMesh 剔除模式。
  DefaultMode: ArtmeshCullingMode;
};

export type IntimacySystemController = {
  // 好感度上限。
  MaxValue: number;
  // 模型处于活动状态时每分钟增加的好感度。
  BonusActive: number;
};

export type Controllers = {
  // 鼠标拖拽控制模型参数。
  ParamHit: ParamHitController;
  // 周期性修改参数；当前运行时未实现。
  ParamLoop: EmptyController;
  // 按键触发动作。
  KeyTrigger: KeyTriggerController;
  // 参数条件触发动作；当前运行时未实现。
  ParamTrigger: EmptyController;
  // 区域进入/离开触发动作；当前运行时未实现。
  AreaTrigger: EmptyController;
  // 手势触发动作；当前运行时未实现。
  HandTrigger: EmptyController;
  // 自动眨眼。
  EyeBlink: EyeBlinkController;
  // 音频驱动口型同步。
  LipSync: LipSyncController;
  // 鼠标追踪。
  MouseTracking: MouseTrackingController;
  // 自动呼吸；当前运行时未实现。
  AutoBreath: EmptyController;
  // 小动作；当前运行时未实现。
  ExtraMotion: EmptyController;
  // 重力感应；当前运行时未实现。
  Accelerometer: EmptyController;
  // 麦克风输入；当前运行时未实现。
  Microphone: EmptyController;
  // 模型变换；当前运行时未实现。
  Transform: EmptyController;
  // 面捕；当前运行时未实现。
  FaceTracking: EmptyController;
  // 手部追踪；当前运行时未实现。
  HandTracking: EmptyController;
  // 用户可控的预设参数值；当前运行时未实现。
  ParamValue: EmptyController;
  // 预设部件透明度。
  PartOpacity: PartOpacityController;
  // 预设 ArtMesh 透明度；当前运行时未实现。
  ArtmeshOpacity: EmptyController;
  // 预设 ArtMesh 颜色；当前运行时未实现。
  ArtmeshColor: EmptyController;
  // ArtMesh 剔除设置。
  ArtmeshCulling: ArtmeshCullingController;
  // 好感度系统。
  IntimacySystem: IntimacySystemController;
};

export type Options = {
  // 模型默认缩放。
  ScaleFactor: number;
  // 各向异性过滤等级；大于 1 时覆盖应用默认设置。
  AnisoLevel: AnisotropicFilteringLevel;
  // 模型默认水平位置。
  PositionX: number;
  // 模型默认垂直位置。
  PositionY: number;
  // 边缘填充，用于缓解模型黑边。
  TexFixed: boolean;
  // 蒙版纹理过滤模式。
  TexType: MaskTextureFilterMode;
};

export type Settings = {
  // 配置文件版本。
  Version: number;
  // 模型类型；当前运行时只处理 Live2D 配置。
  Type: ModelType;
  // 模型、纹理、物理和动作文件引用。
  FileReferences: FileReferences;
  // 模型触发区域。
  HitAreas: HitArea[];
  // 控制器配置。
  Controllers: Controllers;
  // 模型显示选项。
  Options: Options;
};

export async function loadModelSettings(modelUrl: string): Promise<Settings> {
  const response = await fetch(modelUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model settings: ${response.status}`);
  }

  return sanitizeModelSettingsAssetPaths((await response.json()) as Settings);
}
