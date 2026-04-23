export type VarFloats = {
  // 变量名
  Name: string;
  // Type 1 条件；Type 2 操作
  Type: 1 | 2;
  Code: string;
};

export type Choice = {
  Text: string;
  NextMtn: string;
};

export type Motion = {
  Name: string;
  Sound?: string;
  File?: string;
  FileLoop?: boolean;
  Text?: string;
  Command?: string;
  PostCommand?: string;
  VarFloats?: VarFloats[];
  Weight?: number;
  Speed?: number;
  MotionDuration?: number;
  TextDuration?: number;
  Choices?: Choice[];
};

// Motion group 名称来自模型配置，不在类型层硬编码。
// 常见约定：Idle 空闲循环，Start 启动动作，Tap/TapArea 点击触发，
// Shake 设备晃动，Tick 定时触发，Leave 长时间无操作触发。
// 当前代码只特殊处理 Idle；点击由 HitAreas.Motion 和背景 Tap背景 触发，
// 其他分组需要通过配置引用、KeyTrigger、ParamHit 或 start_mtn 命令触发。
export type MotionGroups = Record<string, Motion[]>;

export type HitArea = {
  Name: string;
  Id?: string;
  Motion?: string;
};

export type PhysicsV2 = {
  File: string;
  MaxWeight: number;
};

export type FileReferences = {
  Moc: string;
  Textures: string[];
  Physics: string;
  PhysicsV2: PhysicsV2;
  Motions: MotionGroups;
};

export type ParamHitItem = {
  Name: string;
  Id: string;
  HitArea: string;
  Axis: 0 | 1;
  Factor: number;
  ReleaseType: 0;
  MaxMtn: string;
};

export type KeyTriggerItem = {
  Input: number;
  DownMtn: string;
};

// 覆盖 0，叠加 1，乘算 2
export type BlendMode = 0 | 1 | 2;

// 0 X 水平，1 Y 垂直
export type Axis = 0 | 1;

export type EyeBlinkItem = {
  Id: string;
  Min: number;
  Max: number;
  BlendMode: BlendMode;
  Input: 0;
};

export type LipSyncItem = {
  Id: string;
  Min: number;
  Max: number;
  Input: 0;
};

export type MouseTrackingItem = {
  Id: string;
  Min: number;
  Max: number;
  DefaultValue: number;
  BlendMode: BlendMode;
  Axis?: Axis;
  Input: 1 | 2;
};

export type PartOpacityItem = {
  Name: string;
  Ids: string[];
  Value: number;
};

export type EmptyController = Record<string, never>;

export type ParamHitController = {
  Items: ParamHitItem[];
  Enabled: boolean;
};

export type KeyTriggerController = {
  Items: KeyTriggerItem[];
  Enabled: boolean;
};

export type EyeBlinkController = {
  MinInterval: number;
  MaxInterval: number;
  Items: EyeBlinkItem[];
};

export type LipSyncController = {
  Gain: number;
  Items: LipSyncItem[];
};

export type MouseTrackingController = {
  SmoothTime: number;
  Items: MouseTrackingItem[];
  Enabled: boolean;
};

export type PartOpacityController = {
  Items: PartOpacityItem[];
  Enabled: boolean;
};

export type ArtmeshCullingController = {
  DefaultMode: 0;
};

export type IntimacySystemController = {
  MaxValue: number;
  BonusActive: number;
};

export type Controllers = {
  ParamHit: ParamHitController;
  ParamLoop: EmptyController;
  KeyTrigger: KeyTriggerController;
  ParamTrigger: EmptyController;
  AreaTrigger: EmptyController;
  HandTrigger: EmptyController;
  EyeBlink: EyeBlinkController;
  LipSync: LipSyncController;
  MouseTracking: MouseTrackingController;
  AutoBreath: EmptyController;
  ExtraMotion: EmptyController;
  Accelerometer: EmptyController;
  Microphone: EmptyController;
  Transform: EmptyController;
  FaceTracking: EmptyController;
  HandTracking: EmptyController;
  ParamValue: EmptyController;
  PartOpacity: PartOpacityController;
  ArtmeshOpacity: EmptyController;
  ArtmeshColor: EmptyController;
  ArtmeshCulling: ArtmeshCullingController;
  IntimacySystem: IntimacySystemController;
};

export type Options = {
  ScaleFactor: number;
  AnisoLevel: 0 | 2 | 4 | 8 | 16;
  PositionX: number;
  PositionY: number;
  // UI: 边缘填充
  TexFixed: boolean;
  // 蒙版纹理过滤模式：0 = 双线性过滤（平滑），1 = 点过滤（最近邻）
  TexType: 0 | 1;
};

export type Settings = {
  Version: number;
  Type: number;
  FileReferences: FileReferences;
  HitAreas: HitArea[];
  Controllers: Controllers;
  Options: Options;
};

export async function loadModelSettings(modelUrl: string): Promise<Settings> {
  const response = await fetch(modelUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model settings: ${response.status}`);
  }

  return (await response.json()) as Settings;
}
