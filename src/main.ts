import * as PIXI from 'pixi.js';
import {
  Live2DModel,
  MotionPreloadStrategy,
} from '@jannchie/pixi-live2d-display/cubism4';

const MODEL_URL = '/model/model0.json';
const MODEL_SCALE = 0.1;

type PixiApplication = PIXI.Application<PIXI.Renderer>;
type Cubism4Model = Live2DModel;

async function createApplication(root: HTMLElement): Promise<PixiApplication> {
  const app = new PIXI.Application<PIXI.Renderer>();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    autoDensity: false,
    resolution: 1,
    backgroundAlpha: 0,
    antialias: true,
  });
  root.replaceChildren(app.canvas);
  return app;
}

async function loadModel(app: PixiApplication): Promise<Cubism4Model> {
  const model = await Live2DModel.from(MODEL_URL, {
    ticker: app.ticker,
    autoFocus: true,
    autoHitTest: true,
    motionPreload: MotionPreloadStrategy.NONE,
  });
  // xy偏移
  // model.position.set(10, -100);
  // 左上起点
  // model.pivot.set(100, 1);

  // 显式启用交互
  model.eventMode = 'dynamic';
  model.cursor = 'pointer';
  model.setRenderer(app.renderer);

  return model;
}

function fitModel(app: PixiApplication, model: Cubism4Model): void {
  const bounds = model.getLocalBounds();
  model.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  model.position.set(app.screen.width / 2, app.screen.height / 2);
  model.scale.set(MODEL_SCALE);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');

  if (!root) {
    throw new Error('#app not found');
  }

  const app = await createApplication(root);
  const model = await loadModel(app);

  app.stage.addChild(model);
  fitModel(app, model);
  Object.assign(window, { pixiApp: app, live2dModel: model });

  window.addEventListener('resize', () => fitModel(app, model));
  await model.motion('Idle', 0);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
