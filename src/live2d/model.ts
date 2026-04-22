import {
  createEngineModelSettings,
  Live2DModel,
  MotionPreloadStrategy,
} from './live2dEngineBridge';

import type { PixiApplication } from './app';
import type { ModelOptions, ModelSettings } from './modelSettings';

export type Cubism4Model = Live2DModel;

let hasLoggedModelFit = false;

export async function loadModel(
  app: PixiApplication,
  modelUrl: string,
  modelSettings: ModelSettings,
): Promise<Cubism4Model> {
  const model = await Live2DModel.from(
    createEngineModelSettings(modelSettings, modelUrl),
    {
      ticker: app.ticker,
      autoFocus: modelSettings.Controllers.MouseTracking.Enabled,
      autoHitTest: true,
      lipSyncGain: modelSettings.Controllers.LipSync.Gain,
      idleMotionGroup: '__disabled_idle__',
      motionPreload: MotionPreloadStrategy.NONE,
    },
  );
  // xy偏移
  // model.position.set(10, -100);
  // 左上起点
  // model.pivot.set(100, 1);

  // 显式启用交互
  model.eventMode = 'dynamic';
  model.cursor = 'pointer';
  model.visible = true;
  model.alpha = 1;
  return model;
}

export function fitModel(
  app: PixiApplication,
  model: Cubism4Model,
  options: ModelOptions,
): void {
  model.anchor.set(0.5, 0.8);
  model.position.set(
    app.screen.width / 2,
    app.screen.height / options.PositionY,
  );
  model.scale.set(options.ScaleFactor);

  if (!hasLoggedModelFit) {
    hasLoggedModelFit = true;
    console.info('[live2d-model] fitted', {
      screen: {
        width: app.screen.width,
        height: app.screen.height,
      },
      position: {
        x: Math.round(model.position.x),
        y: Math.round(model.position.y),
      },
      scale: options.ScaleFactor,
      bounds: model.getBounds(),
    });
  }
}
