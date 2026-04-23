import {
  createModelSettingsBridge,
  getModelMotions,
  isExecutableModelMotion,
  MotionPriority,
} from './live2dEngineBridge';

import type { Cubism4Model } from './model';
import type { ModelDialogElement } from '../ui/modelDialog';
import type { Motion, Settings } from './modelSettings';
import type { TouchAction } from './touchActions';

type TouchMotionState =
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
      requestId: number;
      action: TouchAction;
      motion: Motion;
    }
  | {
      status: 'playing';
      requestId: number;
      action: TouchAction;
      motion: Motion;
    };

type MotionManagerState = {
  currentGroup?: string;
  currentIndex?: number;
};

type MotionDebugState = {
  manager: MotionManagerState;
  motion?: Motion;
  motionVariables: Record<string, number>;
  touchMotionState: TouchMotionState;
};

type MotionDebugWindow = Window &
  typeof globalThis & {
    live2dDebug?: {
      getState(): MotionDebugState;
      startIdleMotion(): void;
      startMotion(reference: string): void;
    };
  };

export type MotionController = {
  playTouchMotion(action: TouchAction): void;
  startIdleMotion(): void;
  startMotion(reference: string): void;
};

export function createMotionController(
  model: Cubism4Model,
  modelSettings: Settings,
  modelDialog: ModelDialogElement,
  debugTouch: boolean,
): MotionController {
  const internalModel = model.internalModel;
  const motionVariables = new Map<string, number>([['idle', 0]]);
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  const motionManager = internalModel.motionManager;
  const modelSettingsBridge = createModelSettingsBridge(model, modelSettings, {
    startMotion(reference) {
      runReferencedMotion(reference);
    },
  });
  modelSettingsBridge.applyInitialSettings();

  if (debugTouch) {
    installMotionDebugControls();
  }

  motionManager.on('motionFinish', () => {
    if (touchMotionState.status !== 'playing') {
      requestIdleMotion();
      return;
    }

    finishTouchMotion(
      touchMotionState.requestId,
      touchMotionState.action,
      touchMotionState.motion,
    );
  });

  function getCurrentMotion(): { group?: string; index?: number } {
    const state = motionManager.state as MotionManagerState;

    return {
      group: state.currentGroup,
      index: state.currentIndex,
    };
  }

  function getMotionDebugState(): MotionDebugState {
    const currentMotion = getCurrentMotion();
    const motion =
      currentMotion.group !== undefined && currentMotion.index !== undefined
        ? getModelMotions(modelSettings, currentMotion.group)[
            currentMotion.index
          ]
        : undefined;

    return {
      manager: {
        currentGroup: currentMotion.group,
        currentIndex: currentMotion.index,
      },
      motion,
      motionVariables: Object.fromEntries(motionVariables),
      touchMotionState,
    };
  }

  function installMotionDebugControls(): void {
    (window as MotionDebugWindow).live2dDebug = {
      getState: getMotionDebugState,

      startIdleMotion(): void {
        void startIdleMotion();
      },

      startMotion(reference: string): void {
        runReferencedMotion(reference);
      },
    };
  }

  function requestIdleMotion(): void {
    window.setTimeout(() => {
      if (touchMotionState.status !== 'idle' || getCurrentMotion().group) {
        return;
      }

      void startIdleMotion();
    }, 0);
  }

  async function startIdleMotion(): Promise<void> {
    const motionIndex = selectMotionIndex('Idle');

    if (motionIndex === undefined) {
      if (debugTouch) {
        console.log('[live2d-motion] idle skipped', {
          variables: Object.fromEntries(motionVariables),
        });
      }

      return;
    }

    const started = await model.motion('Idle', motionIndex, MotionPriority.IDLE);

    if (started && debugTouch) {
      console.log('[live2d-motion] idle playing', {
        motionIndex,
        variables: Object.fromEntries(motionVariables),
      });
    }
  }

  function selectMotionIndex(group: string): number | undefined {
    const motions = getModelMotions(modelSettings, group);
    const candidates = motions.flatMap((motion, index) =>
      isExecutableModelMotion(motion) && isMotionConditionMatched(motion)
        ? [index]
        : [],
    );

    return pickWeightedMotionIndex(motions, candidates);
  }

  function pickWeightedMotionIndex(
    motions: Motion[],
    indexes: number[],
  ): number | undefined {
    if (indexes.length === 0) {
      return undefined;
    }

    const totalWeight = indexes.reduce(
      (total, index) => total + Math.max(motions[index].Weight ?? 1, 0),
      0,
    );

    if (totalWeight <= 0) {
      return indexes[0];
    }

    let roll = Math.random() * totalWeight;

    for (const index of indexes) {
      roll -= Math.max(motions[index].Weight ?? 1, 0);

      if (roll <= 0) {
        return index;
      }
    }

    return indexes[indexes.length - 1];
  }

  function isMotionConditionMatched(motion: Motion): boolean {
    return (
      motion.VarFloats?.every((variable) => {
        if (variable.Type !== 1) {
          return true;
        }

        const expectedValue = parseEqualCode(variable.Code);

        return (
          expectedValue === undefined ||
          (motionVariables.get(variable.Name) ?? 0) === expectedValue
        );
      }) ?? true
    );
  }

  function applyMotionAssignments(motion: Motion): void {
    for (const variable of motion.VarFloats ?? []) {
      if (variable.Type !== 2) {
        continue;
      }

      const value = parseAssignCode(variable.Code);

      if (value !== undefined) {
        motionVariables.set(variable.Name, value);
      }
    }
  }

  function parseEqualCode(code: string): number | undefined {
    return parseVariableCode(code, 'equal');
  }

  function parseAssignCode(code: string): number | undefined {
    return parseVariableCode(code, 'assign');
  }

  function parseVariableCode(
    code: string,
    operator: 'assign' | 'equal',
  ): number | undefined {
    const [actualOperator, value] = code.trim().split(/\s+/, 2);

    if (actualOperator !== operator || value === undefined) {
      return undefined;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  function parseMotionReference(reference: string): {
    group: string;
    motionName?: string;
  } {
    const [group, motionName] = reference.split(':', 2);

    return { group, motionName };
  }

  function findMotionIndex(
    group: string,
    motionName: string | undefined,
  ): number | undefined {
    if (motionName === undefined) {
      return selectMotionIndex(group);
    }

    const motionIndex = getModelMotions(modelSettings, group).findIndex(
      ({ Name }) => Name === motionName,
    );

    if (motionIndex < 0) {
      throw new Error(`Motion not found in ${group}: ${motionName}`);
    }

    return motionIndex;
  }

  function getMotion(group: string, motionIndex: number): Motion {
    const motion = getModelMotions(modelSettings, group)[motionIndex];

    if (!motion) {
      throw new Error(`Motion index not found in ${group}: ${motionIndex}`);
    }

    return motion;
  }

  function runReferencedMotion(reference: string): void {
    const { group, motionName } = parseMotionReference(reference);
    const motionIndex = findMotionIndex(group, motionName);

    if (motionIndex === undefined) {
      throw new Error(`No executable motion in group: ${group}`);
    }

    const motion = getMotion(group, motionIndex);

    if (!isMotionConditionMatched(motion)) {
      return;
    }

    modelSettingsBridge.applyMotionCommand(motion);
    applyMotionAssignments(motion);
    showMotionDialog(motion);

    if (motion.File) {
      void model
        .motion(group, motionIndex, MotionPriority.NORMAL)
        .then((started) => {
          if (started) {
            schedulePostCommand(motion);
          }
        });
      return;
    }

    schedulePostCommand(motion);
  }

  function schedulePostCommand(motion: Motion): void {
    if (motion.MotionDuration === undefined) {
      modelSettingsBridge.applyMotionPostCommand(motion);
      return;
    }

    window.setTimeout(() => {
      modelSettingsBridge.applyMotionPostCommand(motion);
    }, motion.MotionDuration);
  }

  function playTouchMotion(action: TouchAction): void {
    if (touchMotionState.status !== 'idle') {
      if (debugTouch) {
        console.log('[live2d-touch] request ignored', {
          action,
          touchMotionState,
        });
      }

      return;
    }

    const motionIndex = action.motionIndex ?? selectMotionIndex(action.group);
    const motion =
      motionIndex === undefined
        ? undefined
        : getMotion(action.group, motionIndex);

    if (
      motionIndex === undefined ||
      motion === undefined ||
      !isMotionConditionMatched(motion)
    ) {
      if (debugTouch) {
        console.log('[live2d-touch] no matched motion', {
          action,
          variables: Object.fromEntries(motionVariables),
        });
      }

      return;
    }

    const requestId = nextRequestId++;
    touchMotionState = {
      status: motion.File ? 'loading' : 'playing',
      requestId,
      action,
      motion,
    };

    if (debugTouch) {
      console.log('[live2d-touch] request start', { requestId, action });
    }

    modelSettingsBridge.applyMotionCommand(motion);
    showMotionDialog(motion);

    if (!motion.File) {
      applyMotionAssignments(motion);
      scheduleTouchMotionFinish(requestId, action, motion);
      return;
    }

    void model
      .motion(action.group, motionIndex, MotionPriority.NORMAL)
      .then((started) => {
        if (!started) {
          if (
            touchMotionState.status === 'loading' &&
            touchMotionState.requestId === requestId
          ) {
            touchMotionState = { status: 'idle' };
          }

          if (debugTouch) {
            console.log('[live2d-touch] request rejected', {
              requestId,
              action,
              motionIndex,
            });
          }

          requestIdleMotion();
          return;
        }

        if (
          touchMotionState.status !== 'loading' ||
          touchMotionState.requestId !== requestId
        ) {
          if (debugTouch) {
            console.log('[live2d-touch] stale request ignored', {
              requestId,
              action,
              motionIndex,
              touchMotionState,
            });
          }

          return;
        }

        touchMotionState = {
          status: 'playing',
          requestId,
          action,
          motion,
        };
        applyMotionAssignments(motion);
        scheduleTouchMotionFinish(requestId, action, motion);

        if (debugTouch) {
          console.log('[live2d-touch] request playing', {
            requestId,
            action,
            motionIndex,
            variables: Object.fromEntries(motionVariables),
          });
        }
      })
      .catch((error: unknown) => {
        if (
          touchMotionState.status === 'loading' &&
          touchMotionState.requestId === requestId
        ) {
          touchMotionState = { status: 'idle' };
        }

        console.error('[live2d-touch] motion failed', { ...action, error });
        requestIdleMotion();
      });
  }

  function scheduleTouchMotionFinish(
    requestId: number,
    action: TouchAction,
    motion: Motion,
  ): void {
    if (motion.MotionDuration === undefined) {
      if (!motion.File) {
        finishTouchMotion(requestId, action, motion);
      }

      return;
    }

    window.setTimeout(() => {
      finishTouchMotion(requestId, action, motion);
    }, motion.MotionDuration);
  }

  function finishTouchMotion(
    requestId: number,
    action: TouchAction,
    motion: Motion,
  ): void {
    if (
      touchMotionState.status !== 'playing' ||
      touchMotionState.requestId !== requestId
    ) {
      return;
    }

    touchMotionState = { status: 'idle' };
    modelSettingsBridge.applyMotionPostCommand(motion);

    if (debugTouch) {
      console.log('[live2d-touch] request finish', { requestId, action });
    }

    requestIdleMotion();
  }

  function showMotionDialog(motion: Motion): void {
    modelDialog.showMotion(motion, (choice) => {
      runReferencedMotion(choice.NextMtn);
    });
  }

  return {
    playTouchMotion,

    startIdleMotion(): void {
      void startIdleMotion();
    },

    startMotion(reference: string): void {
      runReferencedMotion(reference);
    },
  };
}
