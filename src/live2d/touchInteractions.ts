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

    const action = touchActions.find(({ hitArea }) =>
      hitAreas.includes(hitArea),
    );

    if (action) {
      motionController.playTouchMotion(action);
      return;
    }

    if (isInsideModelBounds(model, event.global.x, event.global.y)) {
      motionController.playTouchMotion(getBackgroundTouchAction());
    }
  });
}

function getBackgroundTouchAction(): TouchAction {
  return { hitArea: '背景', kind: 'motion', group: 'Tap背景' };
}

function isInsideModelBounds(
  model: Cubism4Model,
  x: number,
  y: number,
): boolean {
  const bounds = model.getBounds() as unknown as {
    rectangle?: PIXI.Rectangle;
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };

  if (bounds.rectangle) {
    return bounds.rectangle.contains(x, y);
  }

  if (
    bounds.minX !== undefined &&
    bounds.minY !== undefined &&
    bounds.maxX !== undefined &&
    bounds.maxY !== undefined
  ) {
    return (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      y >= bounds.minY &&
      y <= bounds.maxY
    );
  }

  return (
    bounds.x !== undefined &&
    bounds.y !== undefined &&
    bounds.width !== undefined &&
    bounds.height !== undefined &&
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}
