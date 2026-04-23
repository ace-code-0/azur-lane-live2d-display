import {
  getModelMotions,
  isEnabledModelMotion,
  isExecutableModelMotion,
} from './live2dEngineBridge';
import {
  createMotionReference,
  parseMotionReference,
} from './motionReference';
import type { MotionItem, Settings } from './modelSettings';
import type { MotionVariableStore } from './motionVariables';

export type SelectedMotion = {
  reference: string;
  motion: MotionItem;
  presetPrefix?: string;
};

export function createMotionSelector(
  modelSettings: Settings,
  motionVariables: MotionVariableStore,
) {
  function hasGroup(group: string): boolean {
    return Object.prototype.hasOwnProperty.call(
      modelSettings.FileReferences.Motions,
      group,
    );
  }

  function getMotion(group: string, motionIndex: number): MotionItem {
    const motion = getModelMotions(modelSettings, group)[motionIndex];

    if (!motion) {
      throw new Error(`Motion index not found in ${group}: ${motionIndex}`);
    }

    return motion;
  }

  function getPresetGroups(groupPrefix: string): string[] {
    return Object.keys(modelSettings.FileReferences.Motions).filter((group) =>
      isPresetMotionGroup(group, groupPrefix),
    );
  }

  function getGroupsByPattern(pattern: RegExp): string[] {
    return Object.keys(modelSettings.FileReferences.Motions).filter((group) =>
      pattern.test(group),
    );
  }

  function selectPresetQueue(groupPrefix: string): SelectedMotion[] {
    return selectAllGroups(getPresetGroups(groupPrefix), groupPrefix);
  }

  function selectGroups(groups: string[]): SelectedMotion | undefined {
    const candidates = groups.flatMap((group) => {
      const motions = getModelMotions(modelSettings, group);

      return motions.flatMap((motion, index) =>
        isSelectable(motion) ? [createSelectedMotion(group, index, motion)] : [],
      );
    });
    const pickedIndex = pickWeightedMotionIndex(
      candidates.map(({ motion }) => motion),
    );

    if (pickedIndex === undefined) {
      return undefined;
    }

    return candidates[pickedIndex];
  }

  function selectEachGroup(groups: string[], presetPrefix?: string): SelectedMotion[] {
    return groups.flatMap((group) => {
      const selected = selectGroup(group, presetPrefix);

      return selected ? [selected] : [];
    });
  }

  function selectAllGroups(
    groups: string[],
    presetPrefix?: string,
  ): SelectedMotion[] {
    return groups.flatMap((group) => {
      const motions = getModelMotions(modelSettings, group);

      return motions.flatMap((motion, index) =>
        isSelectable(motion)
          ? [createSelectedMotion(group, index, motion, presetPrefix)]
          : [],
      );
    });
  }

  function selectGroup(
    group: string,
    presetPrefix?: string,
  ): SelectedMotion | undefined {
    const motions = getModelMotions(modelSettings, group);
    const indexes = motions.flatMap((motion, index) =>
      isSelectable(motion) ? [index] : [],
    );
    const pickedIndex = pickWeightedMotionIndex(
      indexes.map((index) => motions[index]),
    );

    if (pickedIndex === undefined) {
      return undefined;
    }

    const index = indexes[pickedIndex];

    return createSelectedMotion(group, index, motions[index], presetPrefix);
  }

  function selectReference(reference: string): SelectedMotion | undefined {
    const { group, motionName } = parseMotionReference(reference);

    if (!hasGroup(group)) {
      return undefined;
    }

    if (motionName === undefined) {
      return selectGroup(group);
    }

    const index = getModelMotions(modelSettings, group).findIndex(
      ({ Name }) => Name === motionName,
    );

    if (index < 0) {
      throw new Error(`Motion not found in ${group}: ${motionName}`);
    }

    const motion = getMotion(group, index);

    return isEnabledModelMotion(motion) && motionVariables.matches(motion)
      ? createSelectedMotion(group, index, motion)
      : undefined;
  }

  function isSelectable(motion: MotionItem): boolean {
    return isExecutableModelMotion(motion) && motionVariables.matches(motion);
  }

  return {
    getGroupsByPattern,
    getMotion,
    getPresetGroups,
    selectAllGroups,
    selectEachGroup,
    selectGroup,
    selectGroups,
    selectPresetQueue,
    selectReference,
  };
}

export function parseSelectedMotionReference(reference: string): {
  group: string;
  motionName?: string;
} {
  return parseMotionReference(reference);
}

function createSelectedMotion(
  group: string,
  index: number,
  motion: MotionItem,
  presetPrefix?: string,
): SelectedMotion {
  const motionName = motion.Name || String(index);

  return {
    reference: createMotionReference(group, motionName),
    motion,
    presetPrefix,
  };
}

function isPresetMotionGroup(group: string, prefix: string): boolean {
  return new RegExp(`^${escapeRegExp(prefix)}(?:$|[^A-Za-z])`).test(group);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickWeightedMotionIndex(motions: MotionItem[]): number | undefined {
  if (motions.length === 0) {
    return undefined;
  }

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
