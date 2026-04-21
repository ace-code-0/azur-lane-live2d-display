import { createApplication, updateStageHitArea } from './live2d/app';
import { fitModel, loadModel } from './live2d/model';
import { loadModelSettings } from './live2d/modelSettings';
import { createMotionController } from './live2d/motionController';
import { createTouchActions } from './live2d/touchActions';
import { installTouchInteractions } from './live2d/touchInteractions';

const MODEL_URL = '/model/model0.json';
const MODEL_SCALE = 0.1;
const DEBUG_TOUCH = true;

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');

  if (!root) {
    throw new Error('#app not found');
  }

  const app = await createApplication(root);
  const modelSettings = await loadModelSettings(MODEL_URL);
  const model = await loadModel(app, MODEL_URL);
  const touchActions = createTouchActions(modelSettings);
  const motionController = createMotionController(
    model,
    modelSettings,
    DEBUG_TOUCH,
  );

  app.stage.addChild(model);
  fitModel(app, model, MODEL_SCALE);
  installTouchInteractions(
    app,
    model,
    touchActions,
    motionController,
    DEBUG_TOUCH,
  );

  Object.assign(window, { pixiApp: app, live2dModel: model });

  window.addEventListener('resize', () => {
    updateStageHitArea(app);
    fitModel(app, model, MODEL_SCALE);
  });
  motionController.startIdleMotion();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
