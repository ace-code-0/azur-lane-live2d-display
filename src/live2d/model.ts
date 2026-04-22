import {
  Live2DModel,
  MotionPreloadStrategy,
} from './live2dEngineBridge';

import type { PixiApplication } from './app';
import type { ModelOptions, ModelSettings } from './modelSettings';

export type Cubism4Model = Live2DModel;

export async function loadModel(
  app: PixiApplication,
  modelUrl: string,
  modelSettings: ModelSettings,
): Promise<Cubism4Model> {
  const model = await Live2DModel.from(modelUrl, {
    ticker: app.ticker,
    autoFocus: modelSettings.Controllers.MouseTracking.Enabled,
    autoHitTest: true,
    lipSyncGain: modelSettings.Controllers.LipSync.Gain,
    idleMotionGroup: '__disabled_idle__',
    motionPreload: MotionPreloadStrategy.NONE,
  });
  // xy偏移
  // model.position.set(10, -100);
  // 左上起点
  // model.pivot.set(100, 1);

  // 显式启用交互
  model.eventMode = 'dynamic';
  model.cursor = 'pointer';
  return model;
}

export function fitModel(
  app: PixiApplication,
  model: Cubism4Model,
  options: ModelOptions,
): void {
  const bounds = model.getLocalBounds();
  model.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  model.position.set(app.screen.width / 2, app.screen.height / options.PositionY);
  model.scale.set(options.ScaleFactor);
}
