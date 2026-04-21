export type ModelMotion = {
  File?: string;
  Name?: string;
  VarFloats?: {
    Name: string;
    Type: number;
    Code: string;
  }[];
  Weight?: number;
};

export type ModelHitArea = {
  Name: string;
  Motion?: string;
};

export type ModelSettings = {
  FileReferences: {
    Motions?: Record<string, ModelMotion[]>;
  };
  HitAreas?: ModelHitArea[];
  Controllers?: {
    ParamHit?: {
      Items?: {
        HitArea?: string;
        MaxMtn?: string;
      }[];
    };
  };
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
