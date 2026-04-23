import * as PIXI from 'pixi.js';

import { setModelParameter } from './live2dEngineBridge';
import { getMotion3ParameterTargetValue } from './motion3File';

import type { PixiApplication } from './app';
import type { Cubism4Model } from './model';
import type { ModelParamHitItem, ModelSettings } from './modelSettings';

const DRAG_DISTANCE_THRESHOLD = 8;
const TAP_SUPPRESSION_MS = 250;

type MotionController = {
  startMotion(reference: string): void;
};

type ParamHitTarget = {
  item: ModelParamHitItem;
  targetValue: number;
};

type ParamHitState = {
  pointerId: number;
  startX: number;
  startY: number;
  startValue: number;
  target: ParamHitTarget;
  dragging: boolean;
};

export type ParamHitInteraction = {
  shouldIgnoreTap(event: PIXI.FederatedPointerEvent): boolean;
};

export async function installParamHitInteractions(
  app: PixiApplication,
  model: Cubism4Model,
  modelUrl: string,
  settings: ModelSettings,
  motionController: MotionController,
  debugTouch: boolean,
): Promise<ParamHitInteraction> {
  let paramHitState: ParamHitState | undefined;
  let suppressedTap:
    | {
        x: number;
        y: number;
        until: number;
      }
    | undefined;

  const targets = await createParamHitTargets(modelUrl, settings);

  if (debugTouch) {
    console.log('[live2d-param-hit] installed', JSON.stringify(targets));
  }

  app.stage.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
    const target = getTouchedTarget(
      model,
      targets,
      event.global.x,
      event.global.y,
    );

    if (!target) {
      paramHitState = undefined;
      return;
    }

    paramHitState = {
      pointerId: event.pointerId,
      startX: event.global.x,
      startY: event.global.y,
      startValue: 0,
      target,
      dragging: false,
    };

    setModelParameter(model, target.item.Id, 0);

    if (debugTouch) {
      console.log('[live2d-param-hit] start', {
        x: Math.round(event.global.x),
        y: Math.round(event.global.y),
        item: target.item,
      });
    }
  });

  app.stage.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
    if (!paramHitState || paramHitState.pointerId !== event.pointerId) {
      return;
    }

    const value = getDragValue(event, paramHitState);

    setModelParameter(model, paramHitState.target.item.Id, value);

    if (
      !paramHitState.dragging &&
      getPointerDistance(event, paramHitState) >= DRAG_DISTANCE_THRESHOLD
    ) {
      paramHitState.dragging = true;
    }
  });

  app.stage.on('pointerup', finishParamHit);
  app.stage.on('pointerupoutside', finishParamHit);
  app.stage.on('pointercancel', cancelParamHit);

  function finishParamHit(event: PIXI.FederatedPointerEvent): void {
    if (!paramHitState || paramHitState.pointerId !== event.pointerId) {
      return;
    }

    const state = paramHitState;
    const value = getDragValue(event, state);
    const completed = hasReachedTarget(value, state.target.targetValue);

    paramHitState = undefined;

    if (state.dragging) {
      suppressedTap = {
        x: event.global.x,
        y: event.global.y,
        until: performance.now() + TAP_SUPPRESSION_MS,
      };
    }

    if (!completed) {
      releaseParameter(model, state.target.item);
      return;
    }

    setModelParameter(model, state.target.item.Id, state.target.targetValue);
    motionController.startMotion(state.target.item.MaxMtn);

    if (debugTouch) {
      console.log('[live2d-param-hit] complete', {
        item: state.target.item,
        value,
      });
    }
  }

  function cancelParamHit(event: PIXI.FederatedPointerEvent): void {
    if (!paramHitState || paramHitState.pointerId !== event.pointerId) {
      return;
    }

    releaseParameter(model, paramHitState.target.item);
    paramHitState = undefined;
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

async function createParamHitTargets(
  modelUrl: string,
  settings: ModelSettings,
): Promise<ParamHitTarget[]> {
  if (!settings.Controllers.ParamHit.Enabled) {
    return [];
  }

  const targets = await Promise.all(
    settings.Controllers.ParamHit.Items.map(async (item) => {
      const targetValue = await getMotion3ParameterTargetValue(
        modelUrl,
        settings,
        item.MaxMtn,
        item.Id,
      );

      return targetValue === undefined ? undefined : { item, targetValue };
    }),
  );

  return targets.filter(
    (target): target is ParamHitTarget => target !== undefined,
  );
}

function getTouchedTarget(
  model: Cubism4Model,
  targets: ParamHitTarget[],
  x: number,
  y: number,
): ParamHitTarget | undefined {
  const hitAreas = model.hitTest(x, y);

  return targets.find(({ item }) => hitAreas.includes(item.HitArea));
}

function getDragValue(
  event: PIXI.FederatedPointerEvent,
  state: ParamHitState,
): number {
  const delta =
    state.target.item.Axis === 0
      ? event.global.x - state.startX
      : event.global.y - state.startY;
  const value = state.startValue + delta * state.target.item.Factor;

  return clampToTarget(value, state.target.targetValue);
}

function clampToTarget(value: number, targetValue: number): number {
  return Math.min(
    Math.max(value, Math.min(0, targetValue)),
    Math.max(0, targetValue),
  );
}

function hasReachedTarget(value: number, targetValue: number): boolean {
  return targetValue >= 0 ? value >= targetValue : value <= targetValue;
}

function releaseParameter(model: Cubism4Model, item: ModelParamHitItem): void {
  if (item.ReleaseType === 0) {
    setModelParameter(model, item.Id, 0);
  }
}

function getPointerDistance(
  event: PIXI.FederatedPointerEvent,
  state: ParamHitState,
): number {
  return getDistance(event.global.x, event.global.y, state.startX, state.startY);
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}
