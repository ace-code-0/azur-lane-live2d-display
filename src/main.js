import * as PIXI from 'pixi.js';
import { Live2DModel } from '@jannchie/pixi-live2d-display/cubism4';

const MODEL_URL = '/model/model0.json';
const VIEWPORT_FILL_RATIO = 0.22;

async function createApplication(root) {
  const app = new PIXI.Application();

  await app.init({
    preference: 'webgl',
    resizeTo: window,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    backgroundAlpha: 0,
    antialias: true,
  });

  app.canvas.style.display = 'block';
  root.replaceChildren(app.canvas);

  return app;
}

async function loadModel(app) {
  const model = await Live2DModel.from(MODEL_URL, {
    ticker: app.ticker,
    autoFocus: true,
    autoHitTest: true,
    motionPreload: 'NONE',
  });

  model.setRenderer(app.renderer);

  return model;
}

function fitModel(app, model) {
  const bounds = model.getLocalBounds();
  const width = bounds.width || model.internalModel?.width || 1;
  const height = bounds.height || model.internalModel?.height || 1;
  const scale =
    Math.min(app.screen.width / width, app.screen.height / height) *
    VIEWPORT_FILL_RATIO;

  model.scale.set(scale);
  model.position.set(
    (app.screen.width - width * scale) / 2 - bounds.x * scale,
    (app.screen.height - height * scale) / 2 - bounds.y * scale,
  );
}

async function bootstrap() {
  const root = document.getElementById('app');

  if (!root) {
    throw new Error('#app not found');
  }

  const app = await createApplication(root);
  const model = await loadModel(app);

  app.stage.addChild(model);
  fitModel(app, model);

  window.addEventListener('resize', () => fitModel(app, model));
  await model.motion('Idle', 0);
}

bootstrap().catch((error) => {
  console.error(error);
});
