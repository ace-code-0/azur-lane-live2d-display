import type { PixiApplication } from '@/live2d/app';
import type { Options, Settings } from '@/live2d/settings/modelSettings.types';
import {
  configureCubismSDK,
  Live2DModel,
  MotionPreloadStrategy,
} from 'untitled-pixi-live2d-engine/cubism';
import log from '@/utils/logger';

type EngineModelSettings = Settings & {
  url: string;
  Groups: EngineParameterGroup[];
};

type EngineParameterGroup = {
  Target: 'Parameter';
  Name: 'EyeBlink' | 'LipSync';
  Ids: string[];
};

function createEngineModelSettings(
  modelSettings: Settings,
  modelUrl: string,
): EngineModelSettings {
  return {
    ...modelSettings,
    url: modelUrl,
    Groups: [
      createParameterGroup('EyeBlink', modelSettings.Controllers.EyeBlink.Items),
      createParameterGroup('LipSync', modelSettings.Controllers.LipSync.Items),
    ],
  };
}

function createParameterGroup(
  name: 'EyeBlink' | 'LipSync',
  items: { Id: string }[],
): EngineParameterGroup {
  return {
    Target: 'Parameter',
    Name: name,
    Ids: items.map(({ Id }) => Id),
  };
}

export async function loadModel(
  app: PixiApplication,
  modelUrl: string,
  modelSettings: Settings,
): Promise<Live2DModel> {
  configureCubismSDK();

  const model = await Live2DModel.from(
    createEngineModelSettings(modelSettings, modelUrl),
    {
      ticker: app.ticker,
      autoFocus: modelSettings.Controllers.MouseTracking.Enabled,
      lipSyncGain: modelSettings.Controllers.LipSync.Gain,
      idleMotionGroup: '__DISABLED__',
      motionPreload: MotionPreloadStrategy.ALL,
    },
  );

  model.eventMode = 'dynamic';
  model.cursor = 'pointer';

  return model;
}

export function fitModel(
  app: PixiApplication,
  model: Live2DModel,
  options: Options,
): void {
  model.anchor.set(0.5, 0.8);
  model.position.set(
    app.screen.width / 2,
    app.screen.height / options.PositionY,
  );
  model.scale.set(options.ScaleFactor);

  log.debug('[live2d-model] fitted', {
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
