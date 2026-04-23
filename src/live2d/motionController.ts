import {
  createModelSettingsBridge,
  getModelMotions,
  isExecutableModelMotion,
  MotionPriority,
} from './live2dEngineBridge';

import type { Cubism4Model } from './model';
import type { ModelDialogElement } from '../ui/modelDialog';
import type { Motion, Settings } from './modelSettings';
import type { TouchAction } from './touchActions';

const SHAKE_ACCELERATION_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 1000;
const TICK_INTERVAL_MS = 1000;

type TouchMotionState =
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
      requestId: number;
      action: TouchAction;
      motion: Motion;
    }
  | {
      status: 'playing';
      requestId: number;
      action: TouchAction;
      motion: Motion;
    };

type MotionManagerState = {
  currentGroup?: string;
  currentIndex?: number;
};

type MotionDebugState = {
  manager: MotionManagerState;
  motion?: Motion;
  motionVariables: Record<string, number>;
  touchMotionState: TouchMotionState;
};

type MotionDebugWindow = Window &
  typeof globalThis & {
    live2dDebug?: {
      getState(): MotionDebugState;
      notifyUserActivity(): void;
      startInitialMotion(): void;
      startIdleMotion(): void;
      startMotion(reference: string): void;
    };
  };

export type MotionController = {
  notifyUserActivity(): void;
  playPresetMotion(groupPrefix: string): boolean;
  playTouchMotion(action: TouchAction): void;
  startInitialMotion(): void;
  startIdleMotion(): void;
  startMotion(reference: string): void;
};

export function createMotionController(
  model: Cubism4Model,
  modelSettings: Settings,
  modelDialog: ModelDialogElement,
  debugTouch: boolean,
): MotionController {
  const internalModel = model.internalModel;
  const motionVariables = new Map<string, number>([['idle', 0]]);
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let leaveTimer: number | undefined;
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  const motionManager = internalModel.motionManager;
  const modelSettingsBridge = createModelSettingsBridge(model, modelSettings, {
    startMotion(reference) {
      runReferencedMotion(reference);
    },
  });
  modelSettingsBridge.applyInitialSettings();

  if (debugTouch) {
    installMotionDebugControls();
  }

  installShakeMotion();
  installTickMotion();

  motionManager.on('motionFinish', () => {
    if (touchMotionState.status !== 'playing') {
      requestIdleMotion();
      return;
    }

    finishTouchMotion(
      touchMotionState.requestId,
      touchMotionState.action,
      touchMotionState.motion,
    );
  });

  function getCurrentMotion(): { group?: string; index?: number } {
    const state = motionManager.state as MotionManagerState;

    return {
      group: state.currentGroup,
      index: state.currentIndex,
    };
  }

  function getMotionDebugState(): MotionDebugState {
    const currentMotion = getCurrentMotion();
    const motion =
      currentMotion.group !== undefined && currentMotion.index !== undefined
        ? getModelMotions(modelSettings, currentMotion.group)[
            currentMotion.index
          ]
        : undefined;

    return {
      manager: {
        currentGroup: currentMotion.group,
        currentIndex: currentMotion.index,
      },
      motion,
      motionVariables: Object.fromEntries(motionVariables),
      touchMotionState,
    };
  }

  function installMotionDebugControls(): void {
    (window as MotionDebugWindow).live2dDebug = {
      getState: getMotionDebugState,

      notifyUserActivity(): void {
        notifyUserActivity();
      },

      startInitialMotion(): void {
        startInitialMotion();
      },

      startIdleMotion(): void {
        void startIdleMotion();
      },

      startMotion(reference: string): void {
        runReferencedMotion(reference);
      },
    };
  }

  function startInitialMotion(): void {
    if (!tryRunPresetMotion('Start')) {
      void startIdleMotion();
    }

    resetLeaveTimer();
  }

  function notifyUserActivity(): void {
    resetLeaveTimer();
  }

  function resetLeaveTimer(): void {
    const leaveMotion = getLeaveMotion();

    if (!leaveMotion) {
      return;
    }

    if (leaveTimer !== undefined) {
      window.clearTimeout(leaveTimer);
    }

    leaveTimer = window.setTimeout(() => {
      leaveTimer = undefined;

      if (touchMotionState.status === 'idle') {
        tryRunMotionGroup(leaveMotion.group);
      }

      resetLeaveTimer();
    }, leaveMotion.timeoutMs);
  }

  function getLeaveMotion(): { group: string; timeoutMs: number } | undefined {
    const group = getPresetMotionGroups('Leave')[0];

    if (!group) {
      return undefined;
    }

    const timeoutSeconds = Number(group.match(/^Leave(\d+)/)?.[1]);

    return {
      group,
      timeoutMs: Number.isFinite(timeoutSeconds)
        ? timeoutSeconds * 1000
        : 30000,
    };
  }

  function hasMotionGroup(group: string): boolean {
    return Object.prototype.hasOwnProperty.call(
      modelSettings.FileReferences.Motions,
      group,
    );
  }

  function installShakeMotion(): void {
    if (getPresetMotionGroups('Shake').length === 0) {
      return;
    }

    let lastShakeTime = 0;

    window.addEventListener('devicemotion', (event) => {
      const acceleration = event.accelerationIncludingGravity;

      if (
        acceleration?.x === null ||
        acceleration?.x === undefined ||
        acceleration.y === null ||
        acceleration.y === undefined ||
        acceleration.z === null ||
        acceleration.z === undefined
      ) {
        return;
      }

      const now = performance.now();

      if (now - lastShakeTime < SHAKE_COOLDOWN_MS) {
        return;
      }

      const force = Math.hypot(acceleration.x, acceleration.y, acceleration.z);

      if (force < SHAKE_ACCELERATION_THRESHOLD) {
        return;
      }

      lastShakeTime = now;
      notifyUserActivity();
      tryRunPresetMotion('Shake');
    });
  }

  function installTickMotion(): void {
    if (getPresetMotionGroups('Tick').length === 0) {
      return;
    }

    window.setInterval(() => {
      if (touchMotionState.status !== 'idle') {
        return;
      }

      tryRunPresetMotion('Tick');
    }, TICK_INTERVAL_MS);
  }

  function requestIdleMotion(): void {
    window.setTimeout(() => {
      if (touchMotionState.status !== 'idle') {
        return;
      }

      void startIdleMotion();
    }, 0);
  }

  async function startIdleMotion(): Promise<void> {
    const idleMotion = selectIdleMotion();

    if (!idleMotion) {
      if (debugTouch) {
        console.log('[live2d-motion] idle skipped', {
          variables: Object.fromEntries(motionVariables),
        });
      }

      return;
    }

    const started = await model.motion(
      idleMotion.group,
      idleMotion.index,
      MotionPriority.IDLE,
    );

    if (started && debugTouch) {
      console.log('[live2d-motion] idle playing', {
        group: idleMotion.group,
        motionIndex: idleMotion.index,
        variables: Object.fromEntries(motionVariables),
      });
    }
  }

  function selectIdleMotion(): { group: string; index: number } | undefined {
    return selectPresetMotion('Idle');
  }

  function selectPresetMotion(
    groupPrefix: string,
  ): { group: string; index: number } | undefined {
    const candidates = getPresetMotionGroups(groupPrefix).flatMap((group) => {
      const motions = getModelMotions(modelSettings, group);

      return motions.flatMap((motion, index) =>
        isExecutableModelMotion(motion) && isMotionConditionMatched(motion)
          ? [{ group, index, motion }]
          : [],
      );
    });

    const candidateIndex = pickWeightedMotionIndex(
      candidates.map(({ motion }) => motion),
      candidates.map((_, index) => index),
    );

    if (candidateIndex === undefined) {
      return undefined;
    }

    const candidate = candidates[candidateIndex];

    return { group: candidate.group, index: candidate.index };
  }

  function getPresetMotionGroups(groupPrefix: string): string[] {
    return Object.keys(modelSettings.FileReferences.Motions).filter((group) =>
      group.startsWith(groupPrefix),
    );
  }

  function selectMotionIndex(group: string): number | undefined {
    const motions = getModelMotions(modelSettings, group);
    const candidates = motions.flatMap((motion, index) =>
      isExecutableModelMotion(motion) && isMotionConditionMatched(motion)
        ? [index]
        : [],
    );

    return pickWeightedMotionIndex(motions, candidates);
  }

  function pickWeightedMotionIndex(
    motions: Motion[],
    indexes: number[],
  ): number | undefined {
    if (indexes.length === 0) {
      return undefined;
    }

    const totalWeight = indexes.reduce(
      (total, index) => total + Math.max(motions[index].Weight ?? 1, 0),
      0,
    );

    if (totalWeight <= 0) {
      return indexes[0];
    }

    let roll = Math.random() * totalWeight;

    for (const index of indexes) {
      roll -= Math.max(motions[index].Weight ?? 1, 0);

      if (roll <= 0) {
        return index;
      }
    }

    return indexes[indexes.length - 1];
  }

  function isMotionConditionMatched(motion: Motion): boolean {
    return (
      motion.VarFloats?.every((variable) => {
        if (variable.Type !== 1) {
          return true;
        }

        const expectedValue = parseEqualCode(variable.Code);

        return (
          expectedValue === undefined ||
          (motionVariables.get(variable.Name) ?? 0) === expectedValue
        );
      }) ?? true
    );
  }

  function applyMotionAssignments(motion: Motion): void {
    for (const variable of motion.VarFloats ?? []) {
      if (variable.Type !== 2) {
        continue;
      }

      const value = parseAssignCode(variable.Code);

      if (value !== undefined) {
        motionVariables.set(variable.Name, value);
      }
    }
  }

  function parseEqualCode(code: string): number | undefined {
    return parseVariableCode(code, 'equal');
  }

  function parseAssignCode(code: string): number | undefined {
    return parseVariableCode(code, 'assign');
  }

  function parseVariableCode(
    code: string,
    operator: 'assign' | 'equal',
  ): number | undefined {
    const [actualOperator, value] = code.trim().split(/\s+/, 2);

    if (actualOperator !== operator || value === undefined) {
      return undefined;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  function parseMotionReference(reference: string): {
    group: string;
    motionName?: string;
  } {
    const [group, motionName] = reference.split(':', 2);

    return { group, motionName };
  }

  function findMotionIndex(
    group: string,
    motionName: string | undefined,
  ): number | undefined {
    if (motionName === undefined) {
      return selectMotionIndex(group);
    }

    const motionIndex = getModelMotions(modelSettings, group).findIndex(
      ({ Name }) => Name === motionName,
    );

    if (motionIndex < 0) {
      throw new Error(`Motion not found in ${group}: ${motionName}`);
    }

    return motionIndex;
  }

  function getMotion(group: string, motionIndex: number): Motion {
    const motion = getModelMotions(modelSettings, group)[motionIndex];

    if (!motion) {
      throw new Error(`Motion index not found in ${group}: ${motionIndex}`);
    }

    return motion;
  }

  function tryRunReferencedMotion(reference: string): boolean {
    const { group, motionName } = parseMotionReference(reference);

    if (!hasMotionGroup(group)) {
      return false;
    }

    const motionIndex = findMotionIndex(group, motionName);

    if (motionIndex === undefined) {
      return false;
    }

    const motion = getMotion(group, motionIndex);

    if (!isMotionConditionMatched(motion)) {
      return false;
    }

    runMotion(group, motionIndex, motion);
    return true;
  }

  function tryRunPresetMotion(groupPrefix: string): boolean {
    const motion = selectPresetMotion(groupPrefix);

    if (!motion) {
      return false;
    }

    runMotionGroup(motion.group, motion.index);
    return true;
  }

  function tryRunMotionGroup(group: string): boolean {
    if (!hasMotionGroup(group)) {
      return false;
    }

    const motionIndex = selectMotionIndex(group);

    if (motionIndex === undefined) {
      return false;
    }

    runMotionGroup(group, motionIndex);
    return true;
  }

  function runMotionGroup(group: string, motionIndex: number): void {
    const motion = getMotion(group, motionIndex);

    if (!isMotionConditionMatched(motion)) {
      return;
    }

    runMotion(group, motionIndex, motion);
  }

  function runReferencedMotion(reference: string): void {
    const { group, motionName } = parseMotionReference(reference);
    const motionIndex = findMotionIndex(group, motionName);

    if (motionIndex === undefined) {
      throw new Error(`No executable motion in group: ${group}`);
    }

    const motion = getMotion(group, motionIndex);

    if (!isMotionConditionMatched(motion)) {
      return;
    }

    runMotion(group, motionIndex, motion);
  }

  function runMotion(group: string, motionIndex: number, motion: Motion): void {
    modelSettingsBridge.applyMotionCommand(motion);
    applyMotionAssignments(motion);
    showMotionDialog(motion);

    if (motion.File) {
      void model
        .motion(group, motionIndex, MotionPriority.NORMAL)
        .then((started) => {
          if (started) {
            schedulePostCommand(motion);
            return;
          }
          requestIdleMotion();
        })
        .catch((error: unknown) => {
          console.error('[live2d-motion] motion failed', {
            group,
            motionIndex,
            error,
          });
          requestIdleMotion();
        });
      return;
    }

    schedulePostCommand(motion);
  }

  function schedulePostCommand(motion: Motion): void {
    if (motion.MotionDuration === undefined) {
      modelSettingsBridge.applyMotionPostCommand(motion);
      return;
    }

    window.setTimeout(() => {
      modelSettingsBridge.applyMotionPostCommand(motion);
    }, motion.MotionDuration);
  }

  function playTouchMotion(action: TouchAction): void {
    if (touchMotionState.status !== 'idle') {
      if (debugTouch) {
        console.log('[live2d-touch] request ignored', {
          action,
          touchMotionState,
        });
      }

      return;
    }

    const motionIndex = action.motionIndex ?? selectMotionIndex(action.group);
    const motion =
      motionIndex === undefined
        ? undefined
        : getMotion(action.group, motionIndex);

    if (
      motionIndex === undefined ||
      motion === undefined ||
      !isMotionConditionMatched(motion)
    ) {
      if (debugTouch) {
        console.log('[live2d-touch] no matched motion', {
          action,
          variables: Object.fromEntries(motionVariables),
        });
      }

      return;
    }

    const requestId = nextRequestId++;
    touchMotionState = {
      status: motion.File ? 'loading' : 'playing',
      requestId,
      action,
      motion,
    };

    if (debugTouch) {
      console.log('[live2d-touch] request start', { requestId, action });
    }

    modelSettingsBridge.applyMotionCommand(motion);
    showMotionDialog(motion);

    if (!motion.File) {
      applyMotionAssignments(motion);
      scheduleTouchMotionFinish(requestId, action, motion);
      return;
    }

    void model
      .motion(action.group, motionIndex, MotionPriority.NORMAL)
      .then((started) => {
        if (!started) {
          if (
            touchMotionState.status === 'loading' &&
            touchMotionState.requestId === requestId
          ) {
            touchMotionState = { status: 'idle' };
          }

          if (debugTouch) {
            console.log('[live2d-touch] request rejected', {
              requestId,
              action,
              motionIndex,
            });
          }

          requestIdleMotion();
          return;
        }

        if (
          touchMotionState.status !== 'loading' ||
          touchMotionState.requestId !== requestId
        ) {
          if (debugTouch) {
            console.log('[live2d-touch] stale request ignored', {
              requestId,
              action,
              motionIndex,
              touchMotionState,
            });
          }

          return;
        }

        touchMotionState = {
          status: 'playing',
          requestId,
          action,
          motion,
        };
        applyMotionAssignments(motion);
        scheduleTouchMotionFinish(requestId, action, motion);

        if (debugTouch) {
          console.log('[live2d-touch] request playing', {
            requestId,
            action,
            motionIndex,
            variables: Object.fromEntries(motionVariables),
          });
        }
      })
      .catch((error: unknown) => {
        if (
          touchMotionState.status === 'loading' &&
          touchMotionState.requestId === requestId
        ) {
          touchMotionState = { status: 'idle' };
        }

        console.error('[live2d-touch] motion failed', { ...action, error });
        requestIdleMotion();
      });
  }

  function scheduleTouchMotionFinish(
    requestId: number,
    action: TouchAction,
    motion: Motion,
  ): void {
    if (motion.MotionDuration === undefined) {
      if (!motion.File) {
        finishTouchMotion(requestId, action, motion);
      }

      return;
    }

    window.setTimeout(() => {
      finishTouchMotion(requestId, action, motion);
    }, motion.MotionDuration);
  }

  function finishTouchMotion(
    requestId: number,
    action: TouchAction,
    motion: Motion,
  ): void {
    if (
      touchMotionState.status !== 'playing' ||
      touchMotionState.requestId !== requestId
    ) {
      return;
    }

    touchMotionState = { status: 'idle' };
    modelSettingsBridge.applyMotionPostCommand(motion);

    if (debugTouch) {
      console.log('[live2d-touch] request finish', { requestId, action });
    }

    requestIdleMotion();
  }

  function showMotionDialog(motion: Motion): void {
    modelDialog.showMotion(motion, (choice) => {
      runReferencedMotion(choice.NextMtn);
    });
  }

  return {
    notifyUserActivity,

    playPresetMotion(groupPrefix: string): boolean {
      if (touchMotionState.status !== 'idle') {
        return false;
      }

      return tryRunPresetMotion(groupPrefix);
    },

    playTouchMotion,
    startInitialMotion,

    startIdleMotion(): void {
      void startIdleMotion();
    },

    startMotion(reference: string): void {
      runReferencedMotion(reference);
    },
  };
}
