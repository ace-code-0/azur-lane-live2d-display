import * as PIXI from 'pixi.js';

import type { PixiApplication } from '@/live2d/app';
import type { Cubism4Model } from '@/live2d/model';
import type { TouchAction } from './touchActions';

const DRAG_DISTANCE_THRESHOLD = 12;
const TAP_SUPPRESSION_MS = 250;

type MotionController = {
  playTouchMotion(action: TouchAction): void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  action: TouchAction;
  dragging: boolean;
};

export type TouchDragInteraction = {
  shouldIgnoreTap(event: PIXI.FederatedPointerEvent): boolean;
};

export function installTouchDragInteractions(
  app: PixiApplication,
  model: Cubism4Model,
  touchActions: TouchAction[],
  motionController: MotionController,
  debugTouch: boolean,
): TouchDragInteraction {
  let dragState: DragState | undefined;
  let suppressedTap:
    | {
        x: number;
        y: number;
        until: number;
      }
    | undefined;

  const dragActions = touchActions.filter(isTouchDragAction);

  if (debugTouch) {
    console.log('[live2d-drag] installed', JSON.stringify(dragActions));
  }

  app.stage.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
    const action = getTouchedDragAction(
      model,
      dragActions,
      event.global.x,
      event.global.y,
    );

    if (!action) {
      dragState = undefined;
      return;
    }

    dragState = {
      pointerId: event.pointerId,
      startX: event.global.x,
      startY: event.global.y,
      action,
      dragging: false,
    };

    if (debugTouch) {
      console.log('[live2d-drag] start', {
        x: Math.round(event.global.x),
        y: Math.round(event.global.y),
        action,
      });
    }
  });

  app.stage.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (!dragState.dragging && getDragDistance(event, dragState) >= DRAG_DISTANCE_THRESHOLD) {
      dragState.dragging = true;

      if (debugTouch) {
        console.log('[live2d-drag] threshold', {
          action: dragState.action,
          distance: Math.round(getDragDistance(event, dragState)),
        });
      }
    }
  });

  app.stage.on('pointerup', finishDrag);
  app.stage.on('pointerupoutside', finishDrag);
  app.stage.on('pointercancel', cancelDrag);

  function finishDrag(event: PIXI.FederatedPointerEvent): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const state = dragState;

    dragState = undefined;

    if (!state.dragging) {
      return;
    }

    suppressedTap = {
      x: event.global.x,
      y: event.global.y,
      until: performance.now() + TAP_SUPPRESSION_MS,
    };

    if (debugTouch) {
      console.log('[live2d-drag] finish', {
        x: Math.round(event.global.x),
        y: Math.round(event.global.y),
        action: state.action,
      });
    }

    motionController.playTouchMotion(state.action);
  }

  function cancelDrag(event: PIXI.FederatedPointerEvent): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (debugTouch) {
      console.log('[live2d-drag] cancel', { action: dragState.action });
    }

    dragState = undefined;
  }

  return {
    shouldIgnoreTap(event: PIXI.FederatedPointerEvent): boolean {
      if (!suppressedTap || performance.now() > suppressedTap.until) {
        suppressedTap = undefined;
        return false;
      }

      return getDistance(
        event.global.x,
        event.global.y,
        suppressedTap.x,
        suppressedTap.y,
      ) <= DRAG_DISTANCE_THRESHOLD;
    },
  };
}

function isTouchDragAction(action: TouchAction): boolean {
  return /^TouchDrag\d+$/.test(action.group);
}

function getTouchedDragAction(
  model: Cubism4Model,
  dragActions: TouchAction[],
  x: number,
  y: number,
): TouchAction | undefined {
  const hitAreas = model.hitTest(x, y);

  return dragActions.find(({ hitArea }) => hitAreas.includes(hitArea));
}

function getDragDistance(
  event: PIXI.FederatedPointerEvent,
  state: DragState,
): number {
  return getDistance(event.global.x, event.global.y, state.startX, state.startY);
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}
