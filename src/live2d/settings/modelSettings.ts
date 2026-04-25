import { sanitizeModelSettingsAssetPaths } from './modelAssetPath';
import type { Settings } from './modelSettings.types';

export async function loadModelSettings(modelUrl: string): Promise<Settings> {
  const response = await fetch(modelUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model settings: ${response.status}`);
  }

  return sanitizeModelSettingsAssetPaths((await response.json()) as Settings);
}
