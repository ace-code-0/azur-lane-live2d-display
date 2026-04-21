export type ModelMotion = {
  Name?: string;
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
