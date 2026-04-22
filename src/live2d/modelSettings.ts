export type ModelVariableConditionType = 1;
export type ModelVariableAssignmentType = 2;
export type ModelVariableType =
  | ModelVariableConditionType
  | ModelVariableAssignmentType;

export type ModelVariable = {
  Name: string;
  Type: ModelVariableType;
  Code: string;
};

export type ModelChoice = {
  Text: string;
  NextMtn: string;
};

export type ModelMotion = {
  Name: string;
  Sound?: string;
  File?: string;
  FileLoop?: boolean;
  Text?: string;
  Command?: string;
  PostCommand?: string;
  VarFloats?: ModelVariable[];
  Weight?: number;
  Speed?: number;
  MotionDuration?: number;
  TextDuration?: number;
  Choices?: ModelChoice[];
};

export type ModelMotionGroups = {
  Idle: ModelMotion[];
  'Idle#1': ModelMotion[];
  Start: ModelMotion[];
  触摸: ModelMotion[];
  特殊触摸: ModelMotion[];
  Tap身体: ModelMotion[];
  Tap背景: ModelMotion[];
  Leave30_30_30: ModelMotion[];
  选项: ModelMotion[];
  台词鉴赏_选项: ModelMotion[];
  台词鉴赏: ModelMotion[];
  TouchDrag1: ModelMotion[];
  TouchDrag2: ModelMotion[];
  TouchDrag3: ModelMotion[];
  TouchDrag4: ModelMotion[];
  TouchDrag5: ModelMotion[];
  TouchIdle1: ModelMotion[];
  TouchIdle2: ModelMotion[];
  TouchIdle3: ModelMotion[];
  TouchIdle4: ModelMotion[];
  TouchIdle5: ModelMotion[];
  Shake: ModelMotion[];
  'start后置#2': ModelMotion[];
  '打球后置#3': ModelMotion[];
};

export type ModelHitArea = {
  Name: string;
  Id?: string;
  Motion?: string;
};

export type ModelPhysicsV2 = {
  File: string;
  MaxWeight: number;
};

export type ModelFileReferences = {
  Moc: string;
  Textures: string[];
  Physics: string;
  PhysicsV2: ModelPhysicsV2;
  Motions: ModelMotionGroups;
};

export type ModelParamHitItem = {
  Name: string;
  Id: string;
  HitArea: string;
  Axis: 0;
  Factor: number;
  ReleaseType: 0;
  MaxMtn: string;
};

export type ModelKeyTriggerItem = {
  Input: number;
  DownMtn: string;
};

export type ModelEyeBlinkItem = {
  Id: string;
  Min: number;
  Max: number;
  BlendMode: 2;
  Input: 0;
};

export type ModelLipSyncItem = {
  Id: string;
  Min: number;
  Max: number;
  Input: 0;
};

export type ModelMouseTrackingItem = {
  Id: string;
  Min: number;
  Max: number;
  DefaultValue: number;
  BlendMode: 1;
  Axis?: 1;
  Input: number;
};

export type ModelPartOpacityItem = {
  Name: string;
  Ids: string[];
  Value: number;
};

export type ModelEmptyController = Record<string, never>;

export type ModelParamHitController = {
  Items: ModelParamHitItem[];
  Enabled: boolean;
};

export type ModelKeyTriggerController = {
  Items: ModelKeyTriggerItem[];
  Enabled: boolean;
};

export type ModelEyeBlinkController = {
  MinInterval: number;
  MaxInterval: number;
  Items: ModelEyeBlinkItem[];
};

export type ModelLipSyncController = {
  Gain: number;
  Items: ModelLipSyncItem[];
};

export type ModelMouseTrackingController = {
  SmoothTime: number;
  Items: ModelMouseTrackingItem[];
  Enabled: boolean;
};

export type ModelPartOpacityController = {
  Items: ModelPartOpacityItem[];
  Enabled: boolean;
};

export type ModelArtmeshCullingController = {
  DefaultMode: 0;
};

export type ModelIntimacySystemController = {
  MaxValue: number;
  BonusActive: number;
};

export type ModelControllers = {
  ParamHit: ModelParamHitController;
  ParamLoop: ModelEmptyController;
  KeyTrigger: ModelKeyTriggerController;
  ParamTrigger: ModelEmptyController;
  AreaTrigger: ModelEmptyController;
  HandTrigger: ModelEmptyController;
  EyeBlink: ModelEyeBlinkController;
  LipSync: ModelLipSyncController;
  MouseTracking: ModelMouseTrackingController;
  AutoBreath: ModelEmptyController;
  ExtraMotion: ModelEmptyController;
  Accelerometer: ModelEmptyController;
  Microphone: ModelEmptyController;
  Transform: ModelEmptyController;
  FaceTracking: ModelEmptyController;
  HandTracking: ModelEmptyController;
  ParamValue: ModelEmptyController;
  PartOpacity: ModelPartOpacityController;
  ArtmeshOpacity: ModelEmptyController;
  ArtmeshColor: ModelEmptyController;
  ArtmeshCulling: ModelArtmeshCullingController;
  IntimacySystem: ModelIntimacySystemController;
};

export type ModelOptions = {
  ScaleFactor: number;
  AnisoLevel: number;
  PositionY: number;
  TexFixed: boolean;
  TexType: number;
};

export type ModelSettings = {
  Version: 3;
  Type: 0;
  FileReferences: ModelFileReferences;
  HitAreas: ModelHitArea[];
  Controllers: ModelControllers;
  Options: ModelOptions;
};

export async function loadModelSettings(
  modelUrl: string,
): Promise<ModelSettings> {
  const response = await fetch(modelUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model settings: ${response.status}`);
  }

  return (await response.json()) as ModelSettings;
}
