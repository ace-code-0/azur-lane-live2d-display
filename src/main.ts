import './style.css';

import { createApplication, updateStageHitArea } from '@/live2d/app';
import { fitModel, loadModel } from '@/live2d/model';
import {
  reduceCharacterState,
  type CharacterEvent,
  type CharacterState,
} from '@/live2d/character/characterBrain';
import { planMotion } from '@/live2d/motion/motionPlanner';
import { MotionRuntime } from '@/live2d/motion/motionRuntime';
import { loadModelSettings } from '@/live2d/settings/modelSettings';
import { createModelVariableStore } from '@/live2d/runtime/modelVariables';

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
  modelVariables.initialize(0);
  const model = await loadModel(app, MODEL_URL, modelSettings);

  let state: CharacterState = 'starting';
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

  let pointerStart:
    | {
        x: number;
        y: number;
        hitArea?: ResolvedHitArea;
        dragging: boolean;
      }
    | undefined;

  model.on('pointerdown', (event) => {
    const x = event.global.x;
    const y = event.global.y;
    pointerStart = {
      x,
      y,
      hitArea: resolveHitArea(x, y),
      dragging: false,
    };
    resetLeaveTimer();
  });

  model.on('pointermove', (event) => {
    if (!pointerStart || pointerStart.dragging) {
      return;
    }

    const dx = event.global.x - pointerStart.x;
    const dy = event.global.y - pointerStart.y;

    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }

    pointerStart.dragging = true;

    if (pointerStart.hitArea?.motion) {
      dispatch({
        type: 'DRAG_START',
        area: pointerStart.hitArea.name,
        motion: pointerStart.hitArea.motion,
      });
    }
  });

  model.on('pointerup', () => {
    if (!pointerStart) {
      return;
    }

    const hitArea = pointerStart.hitArea;
    const wasDragging = pointerStart.dragging;
    pointerStart = undefined;
    resetLeaveTimer();

    if (wasDragging) {
      return;
    }

    if (hitArea?.motion) {
      dispatch({
        type: 'TOUCH',
        area: hitArea.name,
        motion: hitArea.motion,
      });
    }
  });

  model.on('pointerupoutside', () => {
    pointerStart = undefined;
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

  dispatch({ type: 'BOOT' });
  resetLeaveTimer();

  function dispatch(event: CharacterEvent): void {
    state = reduceCharacterState(state, event);
    const plan = planMotion(modelSettings, modelVariables, state, event);

    if (plan.kind === 'none' && isTransientState(state)) {
      state = reduceCharacterState(state, { type: 'MOTION_DONE' });
      void motionRuntime.play(
        planMotion(modelSettings, modelVariables, state, {
          type: 'MOTION_DONE',
        }),
      );
      return;
    }

    void motionRuntime.play(plan);
  }

  function isTransientState(nextState: CharacterState): boolean {
    return (
      nextState === 'starting' ||
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

  function resolveHitArea(x: number, y: number): ResolvedHitArea | undefined {
    const hitNames = model.hitTest(x, y);

    for (const name of hitNames) {
      const hitArea = modelSettings.HitAreas.find(
        (area) => area.Name === name || area.Id === name,
      );

      if (hitArea) {
        return {
          name: hitArea.Name,
          motion: hitArea.Motion,
        };
      }
    }

    const background = modelSettings.HitAreas.find(
      (area) => area.Name === '背景',
    );

    return background
      ? {
          name: background.Name,
          motion: background.Motion,
        }
      : undefined;
  }
}

type ResolvedHitArea = {
  name: string;
  motion?: string;
};

bootstrap().catch((error: unknown) => {
  console.error(error);
});
