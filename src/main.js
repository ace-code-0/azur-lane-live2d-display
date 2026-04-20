import * as PIXI from 'pixi.js';
import { Live2DModel } from '@jannchie/pixi-live2d-display/cubism4';

const MODEL_URL = '/model/model0.json';

function writeStatus(message) {
  let status = document.getElementById('status');

  if (!status) {
    status = document.createElement('pre');
    status.id = 'status';
    status.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:12px',
      'z-index:10',
      'margin:0',
      'padding:8px 10px',
      'max-width:calc(100vw - 24px)',
      'color:#d7f5ff',
      'background:rgba(0,0,0,.72)',
      'font:12px/1.45 Consolas,monospace',
      'white-space:pre-wrap',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(status);
  }

  status.textContent = message;
}

function fitModel(app, model) {
  const bounds = model.getLocalBounds();
  const width = bounds.width || model.internalModel?.width || 1;
  const height = bounds.height || model.internalModel?.height || 1;
  const scale = Math.min(app.screen.width / width, app.screen.height / height) * 0.92;

  model.scale.set(scale);
  model.position.set(
    (app.screen.width - width * scale) / 2 - bounds.x * scale,
    (app.screen.height - height * scale) / 2 - bounds.y * scale,
  );
}

function addReferenceLayer(app) {
  const layer = new PIXI.Graphics();

  function draw() {
    layer.clear();
    layer.rect(0, 0, app.screen.width, app.screen.height).fill(0x151719);
    layer.rect(0, 0, app.screen.width, app.screen.height).stroke({
      width: 2,
      color: 0x4cc9f0,
      alpha: 0.8,
    });
    layer.circle(app.screen.width / 2, app.screen.height / 2, 6).fill(0xff3864);
  }

  draw();
  app.stage.addChild(layer);
  return draw;
}

async function bootstrap() {
  const appRoot = document.getElementById('app');

  if (!appRoot) {
    throw new Error('#app not found');
  }

  window.PIXI = PIXI;
  Live2DModel.registerTicker(PIXI.Ticker);
  writeStatus('initializing pixi...');

  const app = new PIXI.Application();

  await app.init({
    preference: 'webgl',
    resizeTo: window,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    backgroundAlpha: 1,
    backgroundColor: 0x151719,
    antialias: true,
  });

  window.app = app;
  app.canvas.style.display = 'block';
  appRoot.replaceChildren(app.canvas);

  const redrawReferenceLayer = addReferenceLayer(app);

  writeStatus('loading live2d model...');

  const model = await Live2DModel.from(MODEL_URL, {
    ticker: app.ticker,
    autoInteract: true,
    motionPreload: 'NONE',
  });

  model.alpha = 1;
  model.visible = true;
  model.zIndex = 1;
  app.stage.sortableChildren = true;
  app.stage.addChild(model);

  fitModel(app, model);
  model.update(0);

  window.addEventListener('resize', () => {
    redrawReferenceLayer();
    fitModel(app, model);
  });

  model.motion('Idle', 0);

  const bounds = model.getLocalBounds();
  const rendererName = app.renderer.name || app.renderer.constructor.name;
  const textureInfo = model.textures
    .map((texture, index) => `${index}: ${texture.width}x${texture.height}`)
    .join('\n');

  writeStatus([
    `renderer: ${rendererName}`,
    `screen: ${app.screen.width}x${app.screen.height}`,
    `bounds: ${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
    `scale: ${model.scale.x.toFixed(4)}`,
    `textures:\n${textureInfo}`,
  ].join('\n'));

  console.log('pixi renderer:', app.renderer);
  console.log('live2d model:', model);
  console.log('local bounds:', bounds);
}

bootstrap().catch((error) => {
  console.error(error);
  writeStatus(error.stack || String(error));
});
