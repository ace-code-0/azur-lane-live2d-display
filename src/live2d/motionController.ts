import { MotionPriority } from '@jannchie/pixi-live2d-display/cubism4';

import type { Cubism4Model } from './model';
import type { ModelMotion, ModelSettings } from './modelSettings';
import type { TouchAction } from './touchActions';

type TouchMotionState =
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
      requestId: number;
      action: TouchAction;
    }
  | {
      status: 'playing';
      requestId: number;
      action: TouchAction;
    };

type MotionManagerState = {
  currentGroup?: string;
  currentIndex?: number;
};

export function createMotionController(
  model: Cubism4Model,
  modelSettings: ModelSettings,
  debugTouch: boolean,
): {
  playTouchMotion(action: TouchAction): void;
  startIdleMotion(): void;
} {
  const internalModel = model.internalModel;
  const motionVariables = new Map<string, number>([['idle', 0]]);
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  const motionManager = internalModel.motionManager;

  motionManager.on('motionFinish', () => {
    const finishedMotion = getCurrentMotion();

    if (touchMotionState.status !== 'playing') {
      if (debugTouch) {
        console.log('[live2d-motion] manager finish ignored', {
          finishedMotion,
          touchMotionState,
        });
      }

      if (finishedMotion.group !== 'Idle') {
        requestIdleMotion();
      }

      return;
    }

    const finishedState = touchMotionState;
    touchMotionState = { status: 'idle' };

    if (debugTouch) {
      console.log('[live2d-touch] request finish', {
        requestId: finishedState.requestId,
        action: finishedState.action,
      });
    }

    requestIdleMotion();
  });

  function getCurrentMotion(): { group?: string; index?: number } {
    const state = motionManager.state as MotionManagerState;

    return {
      group: state.currentGroup,
      index: state.currentIndex,
    };
  }

  function requestIdleMotion(): void {
    window.setTimeout(() => {
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
    const motions = modelSettings.FileReferences.Motions?.[group] ?? [];
    const candidates = motions.flatMap((motion, index) =>
      motion.File && isMotionConditionMatched(motion) ? [index] : [],
    );

    return pickWeightedMotionIndex(motions, candidates);
  }

  function pickWeightedMotionIndex(
    motions: ModelMotion[],
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

  function isMotionConditionMatched(motion: ModelMotion): boolean {
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

  function applyMotionAssignments(motion: ModelMotion): void {
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

  return {
    startIdleMotion(): void {
      void startIdleMotion();
    },

    playTouchMotion(action: TouchAction): void {
      if (action.kind === 'script') {
        if (debugTouch) {
          console.log('[live2d-touch] script action skipped', action);
        }

        return;
      }

      if (touchMotionState.status !== 'idle') {
        if (debugTouch) {
          console.log('[live2d-touch] request ignored', {
            action,
            touchMotionState,
          });
        }

        return;
      }

      const motionIndex =
        action.motionIndex ?? selectMotionIndex(action.group);
      const motion =
        motionIndex === undefined
          ? undefined
          : modelSettings.FileReferences.Motions?.[action.group]?.[
              motionIndex
            ];

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
      touchMotionState = { status: 'loading', requestId, action };

      if (debugTouch) {
        console.log('[live2d-touch] request start', { requestId, action });
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

          touchMotionState = { status: 'playing', requestId, action };
          applyMotionAssignments(motion);

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
    },
  };
}
