export {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from 'untitled-pixi-live2d-engine';

import type { ModelMotion, ModelSettings } from './modelSettings';

export function getModelMotions(
  settings: ModelSettings,
  group: string,
): ModelMotion[] {
  const motions = settings.FileReferences.Motions as Partial<
    Record<string, ModelMotion[]>
  >;

  return motions[group] ?? [];
}
