import './style.css';

import { createApplication, updateStageHitArea } from '@/live2d/app';
import { fitModel, loadModel } from '@/live2d/model';
import {
  transitionCharacterState,
  type CharacterEvent,
  type CharacterState,
} from '@/live2d/character/characterBrain';
import {
  planMotion,
  selectSingleMotion,
} from '@/live2d/motion/motionPlanner';
import { MotionRuntime } from '@/live2d/motion/motionRuntime';
import { loadModelSettings } from '@/live2d/settings/modelSettings';
import { createModelVariableStore } from '@/live2d/runtime/modelVariables';
import { bindWindowPointerInteractions } from '@/live2d/interaction/pointerInteractions';

const MODEL_URL = '/model/model0.json';
const DRAG_THRESHOLD = 8;

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('#app not found');
  }
  const app = await createApplication(root);
  const modelSettings = await loadModelSettings(MODEL_URL);
  const modelVariables = createModelVariableStore(modelSettings);
  const model = await loadModel(app, MODEL_URL, modelSettings);
  let state: CharacterState = 'start';
  let leaveTimer: number | undefined;
  const motionRuntime = new MotionRuntime(
    model,
    modelSettings,
    modelVariables,
    {
      onForegroundDone: () => dispatch({ type: 'MOTION_DONE' }),
    },
  );

  app.stage.addChild(model);
  fitModel(app, model, modelSettings.Options);
  app.ticker.add(() => motionRuntime.applyLockedParameters());

  Object.assign(window, { app: app, model: model });

  bindWindowPointerInteractions({
    app,
    model,
    modelSettings,
    dragThreshold: DRAG_THRESHOLD,
    dispatch,
    onPointerActivity: resetLeaveTimer,
  });

  if (modelSettings.Controllers.KeyTrigger.Enabled) {
    window.addEventListener('keydown', (event) => {
      resetLeaveTimer();

      for (const item of modelSettings.Controllers.KeyTrigger.Items) {
        if (event.keyCode === item.Input) {
          dispatch({ type: 'MOTION_REQUEST', motion: item.DownMtn });
        }
      }
    });
  }

  window.addEventListener('resize', () => {
    updateStageHitArea(app);
    fitModel(app, model, modelSettings.Options);
  });

  playStartMotion();
  resetLeaveTimer();

  function dispatch(event: CharacterEvent): void {
    const previousState = state;
    state = transitionCharacterState(state, event);
    const plan = planMotion(modelSettings, modelVariables, state, event);

    if (
      plan.kind === 'none' &&
      state !== previousState &&
      isTransientState(state)
    ) {
      state = transitionCharacterState(state, { type: 'MOTION_DONE' });
      void motionRuntime.play(
        planMotion(modelSettings, modelVariables, state, {
          type: 'MOTION_DONE',
        }),
      );
      return;
    }

    void motionRuntime.play(plan);
  }

  function playStartMotion(): void {
    const plan = selectSingleMotion(
      modelSettings,
      modelVariables,
      { group: 'Start' },
      'FORCE',
    );

    if (plan.kind === 'none') {
      dispatch({ type: 'MOTION_DONE' });
      return;
    }

    void motionRuntime.play(plan);
  }

  function isTransientState(nextState: CharacterState): boolean {
    return (
      nextState === 'start' ||
      nextState === 'reacting' ||
      nextState === 'dragging' ||
      nextState === 'leaving'
    );
  }

  function resetLeaveTimer(): void {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
    }

    leaveTimer = window.setTimeout(
      () => dispatch({ type: 'IDLE_TIMEOUT' }),
      getLeaveTimeoutMs(),
    );
  }

  function getLeaveTimeoutMs(): number {
    const group = Object.keys(modelSettings.FileReferences.Motions).find(
      (name) => /^Leave\d+_\d+_\d+$/.test(name),
    );
    const seconds = Number(group?.match(/^Leave(\d+)_/)?.[1]);

    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 30000;
  }

}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
