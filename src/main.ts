import * as PIXI from 'pixi.js';
import {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from '@jannchie/pixi-live2d-display/cubism4';

const MODEL_URL = '/model/model0.json';
const MODEL_SCALE = 0.1;
const TAP_COOLDOWN_MS = 250;
const DEBUG_TOUCH = true;

type PixiApplication = PIXI.Application<PIXI.Renderer>;
type Cubism4Model = Live2DModel;
type TouchAction = {
  hitArea: string;
  group: string;
  index?: number;
};

const TOUCH_ACTIONS: TouchAction[] = [
  { hitArea: 'TouchIdle5_救生员黄鸡_进入场景4', group: 'TouchIdle5', index: 0 },
  { hitArea: 'TouchIdle4_退出场景3', group: 'TouchIdle4', index: 0 },
  { hitArea: 'TouchIdle3_左胸_进入场景3', group: 'TouchIdle3', index: 0 },
  { hitArea: 'TouchIdle2_退出场景2', group: 'TouchIdle2', index: 0 },
  { hitArea: 'TouchIdle1_胖次系带_进入场景2', group: 'TouchIdle1', index: 0 },
  { hitArea: 'TouchDrag5_打球下失败', group: 'TouchDrag5', index: 0 },
  { hitArea: 'TouchDrag4_打球上成功', group: 'TouchDrag4', index: 0 },
  { hitArea: 'TouchDrag3_打球下失败', group: 'TouchDrag3', index: 0 },
  { hitArea: 'TouchDrag2_打球下成功', group: 'TouchDrag2', index: 0 },
  { hitArea: 'TouchSpecial', group: '特殊触摸', index: 0 },
  { hitArea: 'TouchHead', group: '触摸', index: 0 },
  { hitArea: 'TouchBody', group: 'Tap身体' },
];

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
  app.stage.eventMode = 'static';
  updateStageHitArea(app);
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

function updateStageHitArea(app: PixiApplication): void {
  app.stage.hitArea = new PIXI.Rectangle(
    0,
    0,
    app.screen.width,
    app.screen.height,
  );
}

function playTouchMotion(
  model: Cubism4Model,
  group: string,
  index?: number,
): void {
  const motionPromise =
    index === undefined
      ? model.motion(group, undefined, MotionPriority.FORCE)
      : model.motion(group, index, MotionPriority.FORCE);

  void motionPromise
    .then((started) => {
      if (DEBUG_TOUCH) {
        console.log('[live2d-touch] motion', { group, index, started });
      }
    })
    .catch((error: unknown) => {
      console.error('[live2d-touch] motion failed', { group, index, error });
    });
}

function installTouchInteractions(
  app: PixiApplication,
  model: Cubism4Model,
): void {
  let lastTapTime = 0;

  if (DEBUG_TOUCH) {
    console.log('[live2d-touch] installed', JSON.stringify(TOUCH_ACTIONS));
  }

  app.stage.on('pointertap', (event: PIXI.FederatedPointerEvent) => {
    const now = performance.now();
    if (now - lastTapTime < TAP_COOLDOWN_MS) {
      if (DEBUG_TOUCH) {
        console.log('[live2d-touch] ignored cooldown');
      }
      return;
    }

    lastTapTime = now;
    const hitAreas = model.hitTest(event.global.x, event.global.y);

    if (DEBUG_TOUCH) {
      console.log('[live2d-touch] tap', {
        x: Math.round(event.global.x),
        y: Math.round(event.global.y),
        hitAreas,
      });
    }

    const action = TOUCH_ACTIONS.find(({ hitArea }) =>
      hitAreas.includes(hitArea),
    );

    if (action) {
      playTouchMotion(model, action.group, action.index);
    } else {
      playTouchMotion(model, 'Tap背景');
    }
  });
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
  installTouchInteractions(app, model);
  Object.assign(window, { pixiApp: app, live2dModel: model });

  window.addEventListener('resize', () => {
    updateStageHitArea(app);
    fitModel(app, model);
  });
  await model.motion('Idle', 0, MotionPriority.IDLE);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
