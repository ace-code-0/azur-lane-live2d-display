import {
  getModelMotions,
  isExecutableModelMotion,
} from './live2dEngineBridge';
import { parseMotionReference } from './motionReference';

import type { MotionItem, Settings } from './modelSettings';

export type TouchAction = {
  hitArea: string;
  kind: 'motion' | 'script';
  group: string;
  motionIndex?: number;
};

export function createTouchActions(settings: Settings): TouchAction[] {
  const actionsByHitArea = new Map<string, TouchAction>();

  for (const hitArea of settings.HitAreas) {
    if (hitArea.Motion) {
      actionsByHitArea.set(
        hitArea.Name,
        createTouchAction(hitArea.Name, hitArea.Motion, settings),
      );
    }
  }

  return Array.from(actionsByHitArea.values());
}

function createTouchAction(
  hitArea: string,
  motion: string,
  settings: Settings,
): TouchAction {
  const { group, motionName } = parseMotionReference(motion);
  const motions = getModelMotions(settings, group);
  const motionIndex = getPlayableMotionIndex(motions, motionName);

  return {
    hitArea,
    kind: motionIndex === null ? 'script' : 'motion',
    group,
    motionIndex: motionIndex ?? undefined,
  };
}

function getPlayableMotionIndex(
  motions: MotionItem[],
  motionName?: string,
): number | null | undefined {
  if (motionName !== undefined) {
    const namedMotionIndex = motions.findIndex(
      ({ Name }) => Name === motionName,
    );

    if (namedMotionIndex < 0) {
      return null;
    }

    return isExecutableModelMotion(motions[namedMotionIndex])
      ? namedMotionIndex
      : null;
  }

  const playableMotionIndexes = motions.flatMap((motion, index) =>
    isExecutableModelMotion(motion) ? [index] : [],
  );

  if (playableMotionIndexes.length === 0) {
    return null;
  }

  return playableMotionIndexes.length === motions.length
    ? undefined
    : playableMotionIndexes[0];
}
