import { MotionPriority } from '@jannchie/pixi-live2d-display/cubism4';

import type { Cubism4Model } from './model';
import type { TouchAction } from './touchActions';

export function createMotionController(
  model: Cubism4Model,
  debugTouch: boolean,
): {
  playTouchMotion(action: TouchAction): void;
} {
  const internalModel = model.internalModel;
  let isTouchMotionPlaying = false;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  internalModel.motionManager.on('motionFinish', () => {
    isTouchMotionPlaying = false;

    if (debugTouch) {
      console.log('[live2d-touch] motion finish');
    }
  });

  return {
    playTouchMotion(action: TouchAction): void {
      if (isTouchMotionPlaying) {
        if (debugTouch) {
          console.log('[live2d-touch] ignored while motion is playing', action);
        }

        return;
      }

      isTouchMotionPlaying = true;

      void model
        .motion(action.group, action.motionIndex, MotionPriority.NORMAL)
        .then((started) => {
          if (!started) {
            isTouchMotionPlaying = false;
          }

          if (debugTouch) {
            console.log('[live2d-touch] motion', { ...action, started });
          }
        })
        .catch((error: unknown) => {
          isTouchMotionPlaying = false;
          console.error('[live2d-touch] motion failed', { ...action, error });
        });
    },
  };
}
