import {
  parseMotionReference,
  type MotionReference,
} from '@/live2d/motion/motionReference';
import type {
  CharacterEvent,
  CharacterState,
} from '@/live2d/character/characterBrain';
import type { MotionItem, Settings } from '@/live2d/settings/modelSettings.types';
import type { ModelVariableStore } from '@/live2d/runtime/modelVariables';

export type MotionPriorityName = 'IDLE' | 'NORMAL' | 'FORCE';

export type PlannedMotion = {
  kind: 'motion';
  group: string;
  index: number;
  motion: MotionItem;
  priority: MotionPriorityName;
};

export type MotionPlan =
  | { kind: 'single'; motion: PlannedMotion }
  | { kind: 'parallel'; motions: PlannedMotion[] }
  | { kind: 'none' };

export function planMotion(
  settings: Settings,
  variables: ModelVariableStore,
  state: CharacterState,
  event: CharacterEvent,
): MotionPlan {
  if (state === 'idle') {
    return selectIdleMotion(settings, variables);
  }

  if (state === 'reacting' && event.type === 'TOUCH') {
    return planReferencedMotion(settings, variables, event.motion, 'NORMAL');
  }

  if (state === 'reacting' && event.type === 'MOTION_REQUEST') {
    return planReferencedMotion(settings, variables, event.motion, 'FORCE');
  }

  if (state === 'dragging' && event.type === 'DRAG_START') {
    return planReferencedMotion(settings, variables, event.motion, 'NORMAL');
  }

  if (state === 'leaving') {
    const leaveGroup = Object.keys(settings.FileReferences.Motions).find(
      (group) => /^Leave\d+_\d+_\d+$/.test(group),
    );

    return leaveGroup
      ? selectSingleMotion(settings, variables, { group: leaveGroup }, 'NORMAL')
      : { kind: 'none' };
  }

  return { kind: 'none' };
}

function selectIdleMotion(
  settings: Settings,
  variables: ModelVariableStore,
): MotionPlan {
  const motions = [
    selectMotion(settings, variables, { group: 'Idle' }, 'IDLE'),
    ...Object.keys(settings.FileReferences.Motions)
      .filter((group) => /^Idle#[1-9]\d*$/.test(group))
      .flatMap((group) => {
        const motion = selectMotion(settings, variables, { group }, 'IDLE');

        return motion ? [motion] : [];
      }),
  ].filter((motion): motion is PlannedMotion => motion !== undefined);

  if (motions.length === 0) {
    return { kind: 'none' };
  }

  return motions.length === 1
    ? { kind: 'single', motion: motions[0] }
    : { kind: 'parallel', motions };
}

function planReferencedMotion(
  settings: Settings,
  variables: ModelVariableStore,
  reference: string | undefined,
  priority: MotionPriorityName,
): MotionPlan {
  return reference
    ? selectSingleMotion(
        settings,
        variables,
        parseMotionReference(reference),
        priority,
      )
    : { kind: 'none' };
}

export function selectSingleMotion(
  settings: Settings,
  variables: ModelVariableStore,
  reference: MotionReference,
  priority: MotionPriorityName,
): MotionPlan {
  const motion = selectMotion(settings, variables, reference, priority);

  return motion ? { kind: 'single', motion } : { kind: 'none' };
}

export function selectMotion(
  settings: Settings,
  variables: ModelVariableStore,
  reference: MotionReference,
  priority: MotionPriorityName,
): PlannedMotion | undefined {
  const motions = settings.FileReferences.Motions[reference.group] ?? [];
  const candidates = motions.flatMap((motion, index) => {
    if (motion.Enabled === false || !variables.matches(motion)) {
      return [];
    }

    if (reference.motionName && motion.Name !== reference.motionName) {
      return [];
    }

    return [{ kind: 'motion' as const, group: reference.group, index, motion, priority }];
  });

  if (candidates.length === 0) {
    return undefined;
  }

  if (reference.motionName !== undefined) {
    return candidates[0];
  }

  return candidates[pickWeightedIndex(candidates.map(({ motion }) => motion))];
}

function pickWeightedIndex(motions: MotionItem[]): number {
  const totalWeight = motions.reduce(
    (total, motion) => total + Math.max(motion.Weight ?? 1, 0),
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  let roll = Math.random() * totalWeight;

  for (let index = 0; index < motions.length; index += 1) {
    roll -= Math.max(motions[index].Weight ?? 1, 0);

    if (roll <= 0) {
      return index;
    }
  }

  return motions.length - 1;
}
