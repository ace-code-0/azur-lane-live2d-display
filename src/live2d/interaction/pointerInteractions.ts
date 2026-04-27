import type { PixiApplication } from '@/live2d/app';
import type { CharacterEvent } from '@/live2d/character/characterBrain';
import type { Settings } from '@/live2d/settings/modelSettings.types';
import type { Live2DModel } from 'untitled-pixi-live2d-engine/cubism';

type ResolvedHitArea = {
  name: string;
  motion?: string;
};

type PointerStart = {
  pointerId: number;
  x: number;
  y: number;
  hitArea?: ResolvedHitArea;
  dragging: boolean;
};

export type WindowPointerInteractionOptions = {
  app: PixiApplication;
  model: Live2DModel;
  modelSettings: Settings;
  dragThreshold: number;
  dispatch: (event: CharacterEvent) => void;
  onPointerActivity: () => void;
};

export function bindWindowPointerInteractions({
  app,
  model,
  modelSettings,
  dragThreshold,
  dispatch,
  onPointerActivity,
}: WindowPointerInteractionOptions): () => void {
  let pointerStart: PointerStart | undefined;

  const handlePointerDown = (event: PointerEvent): void => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    const point = toPixiPoint(app, event);
    pointerStart = {
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
      hitArea: resolveHitArea(model, modelSettings, point.x, point.y),
      dragging: false,
    };
    onPointerActivity();
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
      return;
    }

    if (pointerStart.dragging) {
      return;
    }

    const point = toPixiPoint(app, event);
    const dx = point.x - pointerStart.x;
    const dy = point.y - pointerStart.y;

    if (Math.hypot(dx, dy) < dragThreshold) {
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
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
      return;
    }

    const hitArea = pointerStart.hitArea;
    const wasDragging = pointerStart.dragging;
    pointerStart = undefined;
    onPointerActivity();

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
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (pointerStart?.pointerId === event.pointerId) {
      pointerStart = undefined;
    }
  };

  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    window.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
  };
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.isPrimary || event.pointerType === 'mouse';
}

function toPixiPoint(
  app: PixiApplication,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
): { x: number; y: number } {
  const bounds = app.canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - bounds.left) * app.screen.width) / bounds.width,
    y: ((event.clientY - bounds.top) * app.screen.height) / bounds.height,
  };
}

function resolveHitArea(
  model: Live2DModel,
  settings: Settings,
  x: number,
  y: number,
): ResolvedHitArea | undefined {
  const hitNames = model.hitTest(x, y);

  for (const name of hitNames) {
    const hitArea = settings.HitAreas.find(
      (area) => area.Name === name || area.Id === name,
    );

    if (hitArea) {
      return {
        name: hitArea.Name,
        motion: hitArea.Motion,
      };
    }
  }

  const background = settings.HitAreas.find((area) => area.Name === '背景');

  return background
    ? {
        name: background.Name,
        motion: background.Motion,
      }
    : undefined;
}
