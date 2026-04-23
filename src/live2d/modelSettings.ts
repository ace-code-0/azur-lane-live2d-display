export type Variable = {
  Name: string;
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
  VarFloats?: Variable[];
  Weight?: number;
  Speed?: number;
  MotionDuration?: number;
  TextDuration?: number;
  Choices?: Choice[];
};

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

export type EyeBlinkItem = {
  Id: string;
  Min: number;
  Max: number;
  BlendMode: 2;
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
  BlendMode: 1;
  Axis?: 1;
  Input: number;
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
  AnisoLevel: number;
  PositionY: number;
  TexFixed: boolean;
  TexType: number;
};

export type Settings = {
  Version: 3;
  Type: 0;
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
