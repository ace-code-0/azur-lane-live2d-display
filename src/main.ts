import './style.css';

import { createApplication, updateStageHitArea } from './live2d/app';
import { fitModel, loadModel } from './live2d/model';
import { loadModelSettings } from './live2d/modelSettings';
import { createMotionController } from './live2d/motionController';
import { installParamHitInteractions } from './live2d/paramHitInteractions';
import { createTouchActions } from './live2d/touchActions';
import { installTouchDragInteractions } from './live2d/touchDragInteractions';
import { installTouchInteractions } from './live2d/touchInteractions';
import { createModelDialog } from './ui/modelDialog';

const MODEL_URL = '/model/model0.json';
const DEBUG_TOUCH = true;

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');

  if (!root) {
    throw new Error('#app not found');
  }

  const app = await createApplication(root);
  const modelDialog = createModelDialog(document.body);
  const modelSettings = await loadModelSettings(MODEL_URL);
  const model = await loadModel(app, MODEL_URL, modelSettings);
  const touchActions = createTouchActions(modelSettings);
  const motionController = createMotionController(
    model,
    modelSettings,
    modelDialog,
    DEBUG_TOUCH,
  );

  app.stage.addChild(model);
  fitModel(app, model, modelSettings.Options);
  const paramHitInteraction = await installParamHitInteractions(
    app,
    model,
    MODEL_URL,
    modelSettings,
    motionController,
    DEBUG_TOUCH,
  );
  const touchDragInteraction = installTouchDragInteractions(
    app,
    model,
    touchActions,
    motionController,
    DEBUG_TOUCH,
  );
  installTouchInteractions(
    app,
    model,
    touchActions,
    motionController,
    DEBUG_TOUCH,
    {
      shouldIgnoreTap: (event) =>
        paramHitInteraction.shouldIgnoreTap(event) ||
        touchDragInteraction.shouldIgnoreTap(event),
    },
  );

  Object.assign(window, { app: app, model: model });

  app.stage.on('pointerdown', () => {
    motionController.notifyUserActivity();
  });

  if (modelSettings.Controllers.KeyTrigger.Enabled) {
    window.addEventListener('keydown', (event) => {
      motionController.notifyUserActivity();

      for (const item of modelSettings.Controllers.KeyTrigger.Items) {
        if (event.keyCode === item.Input) {
          motionController.startReferencedMotion(item.DownMtn);
        }
      }
    });
  }

  window.addEventListener('resize', () => {
    updateStageHitArea(app);
    fitModel(app, model, modelSettings.Options);
  });
  motionController.startDefaultMotionCycle();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
