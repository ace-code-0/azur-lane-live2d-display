import * as PIXI from 'pixi.js';

import type { PixiApplication } from './app';
import type { Cubism4Model } from './model';
import type { TouchAction } from './touchActions';

type MotionController = {
  playTouchMotion(action: TouchAction): void;
  startIdleMotion(): void;
};

export function installTouchInteractions(
  app: PixiApplication,
  model: Cubism4Model,
  touchActions: TouchAction[],
  motionController: MotionController,
  debugTouch: boolean,
): void {
  if (debugTouch) {
    console.log('[live2d-touch] installed', JSON.stringify(touchActions));
  }

  app.stage.on('pointertap', (event: PIXI.FederatedPointerEvent) => {
    const hitAreas = model.hitTest(event.global.x, event.global.y);

    if (debugTouch) {
      console.log('[live2d-touch] tap', {
        x: Math.round(event.global.x),
        y: Math.round(event.global.y),
        hitAreas,
      });
    }

    const action =
      touchActions.find(({ hitArea }) => hitAreas.includes(hitArea)) ??
      getBackgroundTouchAction();

    motionController.playTouchMotion(action);
  });
}

function getBackgroundTouchAction(): TouchAction {
  return { hitArea: '背景', kind: 'motion', group: 'Tap背景' };
}
