import {
  Live2DModel,
  MotionPreloadStrategy,
} from './live2dEngineBridge';

import type { PixiApplication } from './app';

export type Cubism4Model = Live2DModel;

export async function loadModel(
  app: PixiApplication,
  modelUrl: string,
): Promise<Cubism4Model> {
  const model = await Live2DModel.from(modelUrl, {
    ticker: app.ticker,
    autoFocus: true,
    autoHitTest: true,
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
  modelScale: number,
): void {
  const bounds = model.getLocalBounds();
  model.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  model.position.set(app.screen.width / 2, app.screen.height / 2);
  model.scale.set(modelScale);
}
