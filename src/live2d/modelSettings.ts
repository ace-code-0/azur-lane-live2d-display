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
  File?: string;
  Name?: string;
  Sound?: string;
  Text?: string;
  Command?: string;
  PostCommand?: string;
  FileLoop?: boolean;
  VarFloats?: ModelVariable[];
  Weight?: number;
  Speed?: number;
  MotionDuration?: number;
  TextDuration?: number;
  Choices?: ModelChoice[];
};

export type ModelHitArea = {
  Name: string;
  Id?: string;
  Motion?: string;
};

export type ModelPhysicsV2 = {
  File: string;
  MaxWeight?: number;
};

export type ModelFileReferences = {
  Moc: string;
  Textures: string[];
  Physics?: string;
  PhysicsV2?: ModelPhysicsV2;
  Motions?: Record<string, ModelMotion[]>;
};

export type ModelControllerItem = {
  Name?: string;
  Id: string;
  Min?: number;
  Max?: number;
  Value?: number;
  DefaultValue?: number;
  BlendMode?: number;
  Input?: number;
  Axis?: number;
  Factor?: number;
  HitArea?: string;
  ReleaseType?: number;
  MaxMtn?: string;
  Ids?: string[];
};

export type ModelKeyTriggerItem = {
  Input: number;
  DownMtn?: string;
  UpMtn?: string;
};

export type ModelController = {
  Enabled?: boolean;
  Items?: ModelControllerItem[];
};

export type ModelIntervalController = ModelController & {
  MinInterval?: number;
  MaxInterval?: number;
};

export type ModelLipSyncController = ModelController & {
  Gain?: number;
};

export type ModelKeyTriggerController = {
  Enabled?: boolean;
  Items?: ModelKeyTriggerItem[];
};

export type ModelArtmeshCullingController = {
  DefaultMode?: number;
};

export type ModelIntimacySystemController = {
  MaxValue?: number;
  BonusActive?: number;
};

export type ModelControllers = {
  ParamHit?: ModelController;
  ParamLoop?: ModelController;
  KeyTrigger?: ModelKeyTriggerController;
  ParamTrigger?: ModelController;
  AreaTrigger?: ModelController;
  HandTrigger?: ModelController;
  EyeBlink?: ModelIntervalController;
  LipSync?: ModelLipSyncController;
  MouseTracking?: ModelController & {
    SmoothTime?: number;
  };
  AutoBreath?: ModelController;
  ExtraMotion?: ModelController;
  Accelerometer?: ModelController;
  Microphone?: ModelController;
  Transform?: ModelController;
  FaceTracking?: ModelController;
  HandTracking?: ModelController;
  ParamValue?: ModelController;
  PartOpacity?: ModelController;
  ArtmeshOpacity?: ModelController;
  ArtmeshColor?: ModelController;
  ArtmeshCulling?: ModelArtmeshCullingController;
  IntimacySystem?: ModelIntimacySystemController;
};

export type ModelOptions = {
  ScaleFactor?: number;
  AnisoLevel?: number;
  PositionY?: number;
  TexFixed?: boolean;
  TexType?: number;
};

export type ModelSettings = {
  Version: number;
  Type?: number;
  FileReferences: ModelFileReferences;
  HitAreas?: ModelHitArea[];
  Controllers?: ModelControllers;
  Options?: ModelOptions;
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
