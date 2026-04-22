import {
  getModelMotions,
  isExecutableModelMotion,
} from './live2dEngineBridge';

import type { ModelMotion, ModelSettings } from './modelSettings';

export type TouchAction = {
  hitArea: string;
  kind: 'motion' | 'script';
  group: string;
  motionIndex?: number;
};

export function createTouchActions(settings: ModelSettings): TouchAction[] {
  const actionsByHitArea = new Map<string, TouchAction>();

  for (const hitArea of settings.HitAreas) {
    if (hitArea.Motion) {
      actionsByHitArea.set(
        hitArea.Name,
        createTouchAction(hitArea.Name, hitArea.Motion, settings),
      );
    }
  }

  for (const item of settings.Controllers.ParamHit.Items) {
    if (!actionsByHitArea.has(item.HitArea)) {
      actionsByHitArea.set(
        item.HitArea,
        createTouchAction(item.HitArea, item.MaxMtn, settings),
      );
    }
  }

  return Array.from(actionsByHitArea.values());
}

function createTouchAction(
  hitArea: string,
  motion: string,
  settings: ModelSettings,
): TouchAction {
  const [group, motionName] = motion.split(':', 2);
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
  motions: ModelMotion[],
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
