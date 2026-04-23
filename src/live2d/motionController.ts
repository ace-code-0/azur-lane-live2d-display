import {
  createModelSettingsBridge,
  getModelMotions,
  MotionPriority,
} from './live2dEngineBridge';
import { createMotionSelector } from './motionSelection';
import { MotionVariableStore } from './motionVariables';

import type { Cubism4Model } from './model';
import type { ModelDialogElement } from '../ui/modelDialog';
import type { MotionItem, Settings } from './modelSettings';
import type { TouchAction } from './touchActions';

type TouchMotionState =
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
      requestId: number;
      action: TouchAction;
      motion: MotionItem;
    }
  | {
      status: 'playing';
      requestId: number;
      action: TouchAction;
      motion: MotionItem;
    };

type BufferedMotion = {
  group: string;
  index: number;
  motion: MotionItem;
  priority: MotionPriority;
};

type NextMotionBuffer =
  | {
      status: 'idle';
    }
  | {
      status: 'playing';
      requestId: number;
      activeMotion: BufferedMotion;
      remainingMotions: BufferedMotion[];
      onComplete?: () => void;
    };

type MotionManagerState = {
  currentGroup?: string;
  currentIndex?: number;
};

type MotionDebugState = {
  manager: MotionManagerState;
  motion?: MotionItem;
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
  const motionVariables = new MotionVariableStore(modelSettings);
  const motionSelector = createMotionSelector(modelSettings, motionVariables);
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let nextMotionBuffer: NextMotionBuffer = { status: 'idle' };
  let leaveTimer: number | undefined;
  let idleRequestId = 0;
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

  motionManager.on('motionFinish', () => {
    if (touchMotionState.status === 'playing') {
      finishTouchMotion(
        touchMotionState.requestId,
        touchMotionState.action,
        touchMotionState.motion,
      );
      return;
    }

    if (nextMotionBuffer.status === 'playing') {
      finishQueuedMotion(nextMotionBuffer.requestId);
      return;
    }

    requestIdleMotion();
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
      motionVariables: motionVariables.entries(),
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
      requestIdleMotion();
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
        tryRunPresetMotion('Leave');
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

  function requestIdleMotion(): void {
    const requestId = ++idleRequestId;

    window.setTimeout(() => {
      void tryStartQueuedIdleMotion(requestId);
    }, 0);
  }

  async function tryStartQueuedIdleMotion(requestId: number): Promise<void> {
    if (requestId !== idleRequestId || touchMotionState.status !== 'idle') {
      return;
    }

    const started = await startIdleMotion();

    if (!started && debugTouch && requestId === idleRequestId) {
      console.log('[live2d-motion] idle not started', {
        variables: motionVariables.entries(),
      });
    }
  }

  async function startIdleMotion(): Promise<boolean> {
    const idleMotions = selectIdleMotions();

    if (idleMotions.length === 0) {
      if (debugTouch) {
        console.log('[live2d-motion] idle skipped', {
          variables: motionVariables.entries(),
        });
      }

      return false;
    }

    const started = await startMotionQueue(idleMotions);

    return started;
  }

  function selectIdleMotions(): BufferedMotion[] {
    return motionSelector.selectPresetQueue('Idle').map((motion) => ({
      ...motion,
      priority: MotionPriority.IDLE,
    }));
  }

  function toNormalQueuedMotion(selected: {
    group: string;
    index: number;
    motion: MotionItem;
  }): BufferedMotion {
    return {
      ...selected,
      priority: MotionPriority.NORMAL,
    };
  }

  async function startMotionQueue(
    motions: BufferedMotion[],
    onComplete?: () => void,
  ): Promise<boolean> {
    if (motions.length === 0 || nextMotionBuffer.status !== 'idle') {
      return false;
    }

    const [active, ...remaining] = motions;
    const requestId = nextRequestId++;
    const started = await startQueuedMotion(active, requestId, remaining, onComplete);

    if (!started && debugTouch) {
      console.log('[live2d-motion] queued motion rejected', {
        group: active.group,
        motionIndex: active.index,
        variables: motionVariables.entries(),
      });
    }

    return started;
  }

  async function startQueuedMotion(
    active: BufferedMotion,
    requestId: number,
    remaining: BufferedMotion[],
    onComplete?: () => void,
  ): Promise<boolean> {
    modelSettingsBridge.applyMotionCommand(active.motion);
    motionVariables.applyAssignments(active.motion);
    showMotionDialog(active.motion);

    nextMotionBuffer = {
      status: 'playing',
      requestId,
      activeMotion: active,
      remainingMotions: remaining,
      onComplete,
    };

    if (!active.motion.File) {
      finishQueuedMotion(requestId);
      return true;
    }

    const started = await model
      .motion(active.group, active.index, active.priority)
      .catch((error: unknown) => {
        console.error('[live2d-motion] queued motion failed', {
          group: active.group,
          motionIndex: active.index,
          error,
        });

        return false;
      });

    if (!started && nextMotionBuffer.status === 'playing') {
      nextMotionBuffer = { status: 'idle' };
    }

    if (started && debugTouch) {
      console.log('[live2d-motion] queued motion playing', {
        group: active.group,
        motionIndex: active.index,
        variables: motionVariables.entries(),
      });
    }

    return started;
  }

  function finishQueuedMotion(requestId: number): void {
    if (
      nextMotionBuffer.status !== 'playing' ||
      nextMotionBuffer.requestId !== requestId
    ) {
      return;
    }

    const { activeMotion, remainingMotions, onComplete } = nextMotionBuffer;

    modelSettingsBridge.applyMotionPostCommand(activeMotion.motion);

    if (remainingMotions.length > 0) {
      const [next, ...rest] = remainingMotions;

      void startQueuedMotion(next, requestId, rest, onComplete);
      return;
    }

    nextMotionBuffer = { status: 'idle' };
    onComplete?.();
    requestIdleMotion();
  }

  function getPresetMotionGroups(groupPrefix: string): string[] {
    return motionSelector.getPresetGroups(groupPrefix);
  }

  function tryRunReferencedMotion(reference: string): boolean {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      return false;
    }

    runMotion(selected.group, selected.index, selected.motion);
    return true;
  }

  function tryRunPresetMotion(groupPrefix: string): boolean {
    const motions = motionSelector.selectPresetQueue(groupPrefix);

    if (motions.length === 0 || nextMotionBuffer.status !== 'idle') {
      return false;
    }

    void startMotionQueue(motions.map(toNormalQueuedMotion));
    return true;
  }

  function tryRunMotionGroup(group: string): boolean {
    const selected = motionSelector.selectGroup(group);

    if (!selected) {
      return false;
    }

    runMotion(selected.group, selected.index, selected.motion);
    return true;
  }

  function runMotionGroup(group: string, motionIndex: number): void {
    const motion = motionSelector.getMotion(group, motionIndex);

    if (!motionVariables.matches(motion)) {
      return;
    }

    runMotion(group, motionIndex, motion);
  }

  function runReferencedMotion(reference: string): void {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      return;
    }

    runMotion(selected.group, selected.index, selected.motion);
  }

  function runMotion(group: string, motionIndex: number, motion: MotionItem): void {
    modelSettingsBridge.applyMotionCommand(motion);
    motionVariables.applyAssignments(motion);
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

  function schedulePostCommand(motion: MotionItem): void {
    if (motion.MotionDuration === undefined) {
      modelSettingsBridge.applyMotionPostCommand(motion);
      return;
    }

    window.setTimeout(() => {
      modelSettingsBridge.applyMotionPostCommand(motion);
    }, motion.MotionDuration);
  }

  function playTouchMotion(action: TouchAction): void {
    if (
      touchMotionState.status !== 'idle' ||
      nextMotionBuffer.status !== 'idle'
    ) {
      if (debugTouch) {
        console.log('[live2d-touch] request ignored', {
          action,
          touchMotionState,
        });
      }

      return;
    }

    const selected =
      action.motionIndex === undefined
        ? motionSelector.selectGroup(action.group)
        : {
            group: action.group,
            index: action.motionIndex,
            motion: motionSelector.getMotion(action.group, action.motionIndex),
          };
    const motion =
      selected === undefined
        ? undefined
        : selected.motion;

    if (
      selected === undefined ||
      motion === undefined ||
      !motionVariables.matches(motion)
    ) {
      if (debugTouch) {
        console.log('[live2d-touch] no matched motion', {
          action,
          variables: motionVariables.entries(),
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
      motionVariables.applyAssignments(motion);
      scheduleTouchMotionFinish(requestId, action, motion);
      return;
    }

    void model
      .motion(action.group, selected.index, MotionPriority.NORMAL)
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
              motionIndex: selected.index,
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
              motionIndex: selected.index,
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
        motionVariables.applyAssignments(motion);
        scheduleTouchMotionFinish(requestId, action, motion);

        if (debugTouch) {
          console.log('[live2d-touch] request playing', {
            requestId,
            action,
            motionIndex: selected.index,
            variables: motionVariables.entries(),
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
    motion: MotionItem,
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
    motion: MotionItem,
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

  function showMotionDialog(motion: MotionItem): void {
    modelDialog.showMotion(motion, (choice) => {
      runReferencedMotion(choice.NextMtn);
    });
  }

  return {
    notifyUserActivity,

    playPresetMotion(groupPrefix: string): boolean {
      if (
        touchMotionState.status !== 'idle' ||
        nextMotionBuffer.status !== 'idle'
      ) {
        return false;
      }

      return tryRunPresetMotion(groupPrefix);
    },

    playTouchMotion,
    startInitialMotion,

    startIdleMotion(): void {
      requestIdleMotion();
    },

    startMotion(reference: string): void {
      runReferencedMotion(reference);
    },
  };
}
