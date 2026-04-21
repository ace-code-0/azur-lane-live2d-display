import { MotionPriority } from '@jannchie/pixi-live2d-display/cubism4';

import type { Cubism4Model } from './model';
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

export function createMotionController(
  model: Cubism4Model,
  debugTouch: boolean,
): {
  playTouchMotion(action: TouchAction): void;
} {
  const internalModel = model.internalModel;
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  internalModel.motionManager.on('motionFinish', () => {
    if (touchMotionState.status !== 'playing') {
      if (debugTouch) {
        console.log('[live2d-motion] manager finish ignored', {
          touchMotionState,
        });
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
  });

  return {
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

      const requestId = nextRequestId++;
      touchMotionState = { status: 'loading', requestId, action };

      if (debugTouch) {
        console.log('[live2d-touch] request start', { requestId, action });
      }

      void model
        .motion(action.group, action.motionIndex, MotionPriority.NORMAL)
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
              });
            }

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
                touchMotionState,
              });
            }

            return;
          }

          touchMotionState = { status: 'playing', requestId, action };

          if (debugTouch) {
            console.log('[live2d-touch] request playing', {
              requestId,
              action,
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
        });
    },
  };
}
