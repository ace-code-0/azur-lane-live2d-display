import type { ModelSettings } from './modelSettings';

export type TouchAction = {
  hitArea: string;
  kind: 'motion' | 'script';
  group: string;
  motionIndex?: number;
};

export function createTouchActions(settings: ModelSettings): TouchAction[] {
  const actionsByHitArea = new Map<string, TouchAction>();

  for (const hitArea of settings.HitAreas ?? []) {
    if (hitArea.Motion) {
      actionsByHitArea.set(
        hitArea.Name,
        createTouchAction(hitArea.Name, hitArea.Motion, settings),
      );
    }
  }

  for (const item of settings.Controllers?.ParamHit?.Items ?? []) {
    if (item.HitArea && item.MaxMtn && !actionsByHitArea.has(item.HitArea)) {
      actionsByHitArea.set(
        item.HitArea,
        createTouchAction(item.HitArea, item.MaxMtn, settings),
      );
    }
  }

  return Array.from(actionsByHitArea.values()).sort(compareTouchActions);
}

function createTouchAction(
  hitArea: string,
  motion: string,
  settings: ModelSettings,
): TouchAction {
  const [group, motionName] = motion.split(':', 2);
  const motions = settings.FileReferences.Motions?.[group] ?? [];
  const motionIndex = getPlayableMotionIndex(motions, motionName);

  return {
    hitArea,
    kind: motionIndex === null ? 'script' : 'motion',
    group,
    motionIndex: motionIndex ?? undefined,
  };
}

function getPlayableMotionIndex(
  motions: NonNullable<ModelSettings['FileReferences']['Motions']>[string],
  motionName?: string,
): number | null | undefined {
  if (motionName !== undefined) {
    const namedMotionIndex = motions.findIndex(
      ({ Name }) => Name === motionName,
    );

    if (namedMotionIndex < 0) {
      return null;
    }

    return motions[namedMotionIndex]?.File ? namedMotionIndex : null;
  }

  const playableMotionIndexes = motions.flatMap((motion, index) =>
    motion.File ? [index] : [],
  );

  if (playableMotionIndexes.length === 0) {
    return null;
  }

  return playableMotionIndexes.length === motions.length
    ? undefined
    : playableMotionIndexes[0];
}

function compareTouchActions(left: TouchAction, right: TouchAction): number {
  return (
    getTouchActionPriority(left.hitArea) -
    getTouchActionPriority(right.hitArea)
  );
}

function getTouchActionPriority(hitArea: string): number {
  if (hitArea.startsWith('TouchIdle')) {
    return 0;
  }

  if (hitArea.startsWith('TouchDrag')) {
    return 1;
  }

  if (hitArea === 'TouchSpecial') {
    return 2;
  }

  if (hitArea === 'TouchHead') {
    return 3;
  }

  if (hitArea === 'TouchBody') {
    return 4;
  }

  if (hitArea === '背景') {
    return 6;
  }

  return 5;
}
