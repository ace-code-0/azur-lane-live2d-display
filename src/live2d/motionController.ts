import {
  createModelSettingsBridge,
  getModelMotions,
  MotionPriority,
} from './live2dEngineBridge';
import {
  createMotionSelector,
  parseSelectedMotionReference,
} from './motionSelection';
import { createMotionReference } from './motionReference';
import { MotionVariableStore } from './motionVariables';

import type { Cubism4Model } from './model';
import type { ModelDialogElement } from '../ui/modelDialog';
import type { MotionItem, Settings } from './modelSettings';
import type { TouchAction } from './touchActions';
import type { SelectedMotion } from './motionSelection';

const IDLE_MOTION_PREFIX = 'Idle';
const START_MOTION_PREFIX = 'Start';
const LEAVE_MOTION_PREFIX = 'Leave';
const PRESET_MOTION_PREFIXES = [
  IDLE_MOTION_PREFIX,
  'Tap',
  START_MOTION_PREFIX,
  'Shake',
  'Tick',
  LEAVE_MOTION_PREFIX,
] as const;

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

type ActiveMotion = {
  selectedMotion: SelectedMotion;
  priority: MotionPriority;
};

type PresetMotionBufferState = {
  requestId?: number;
  presetPrefix?: string;
  cycleGroup?: string;
  active?: ActiveMotion;
  buffer: ActiveMotion[];
};

type LeaveSchedule = {
  group: string;
  startDelayMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
};

type MotionDebugState = {
  motionVariables: Record<string, number>;
  pendingIdleRequestId: number;
  presetMotionBuffer: {
    presetPrefix?: string;
    activeMotion?: {
      presetPrefix: string;
      motionGroup: string;
      motionItemName: string;
      motionReference: string;
      priority: MotionPriority;
    };
    buffer: Array<{
      presetPrefix: string;
      motionGroup: string;
      motionItemName: string;
      motionReference: string;
      priority: MotionPriority;
    }>;
  };
  presetCycles: Record<
    string,
    {
      cursor: number;
      motionGroups: Array<{
        group: string;
        cursor: number;
        motions: Array<{
          name: string;
          reference: string;
          selectable: boolean;
        }>;
      }>;
    }
  >;
  touchMotionState: TouchMotionState;
};

type MotionDebugWindow = Window &
  typeof globalThis & {
    live2dDebug?: {
      getState(): MotionDebugState;
      notifyUserActivity(): void;
      startDefaultMotionCycle(): void;
      requestIdleMotionCycle(): void;
      startReferencedMotion(reference: string): void;
    };
  };

export type MotionController = {
  notifyUserActivity(): void;
  startPresetMotionCycle(groupPrefix: string): boolean;
  playTouchMotion(action: TouchAction): void;
  startDefaultMotionCycle(): void;
  requestIdleMotionCycle(): void;
  startReferencedMotion(reference: string): void;
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
  const presetGroupsByPrefix = createPresetGroupsByPrefix();
  const presetReferencesByGroup = createPresetReferencesByGroup();
  const presetFamilyCursorByPrefix = createPresetFamilyCursorByPrefix();
  const presetCycleCursorByGroup = createPresetCycleCursorByGroup();
  let touchMotionState: TouchMotionState = { status: 'idle' };
  let presetMotionBufferState: PresetMotionBufferState = { buffer: [] };
  let leaveTimer: number | undefined;
  let idleRequestId = 0;
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  const motionManager = internalModel.motionManager;
  const modelSettingsBridge = createModelSettingsBridge(model, modelSettings, {
    startReferencedMotion(reference) {
      startReferencedMotion(reference);
    },
  });
  modelSettingsBridge.applyInitialSettings();

  if (debugTouch) {
    installMotionDebugControls();
  }

  resetIdlePresetMotionBuffer();

  motionManager.on('motionFinish', () => {
    if (touchMotionState.status === 'playing') {
      finishTouchMotion(
        touchMotionState.requestId,
        touchMotionState.action,
        touchMotionState.motion,
      );
      return;
    }

    if (presetMotionBufferState.active && presetMotionBufferState.requestId !== undefined) {
      advancePresetMotionBuffer(presetMotionBufferState.requestId);
      return;
    }

    requestIdleMotion();
  });

  function getMotionDebugState(): MotionDebugState {
    return {
      motionVariables: motionVariables.entries(),
      pendingIdleRequestId: idleRequestId,
      presetMotionBuffer: {
        presetPrefix: presetMotionBufferState.presetPrefix,
        activeMotion:
          presetMotionBufferState.active === undefined
            ? undefined
            : toQueuedMotionDebugItem(presetMotionBufferState.active),
        buffer: presetMotionBufferState.buffer.map(toQueuedMotionDebugItem),
      },
      presetCycles: Object.fromEntries(
        PRESET_MOTION_PREFIXES.map((prefix) => [
          prefix,
          {
            cursor: presetFamilyCursorByPrefix[prefix] ?? 0,
            motionGroups: (presetGroupsByPrefix[prefix] ?? []).map((group) => ({
              group,
              cursor: presetCycleCursorByGroup[group] ?? 0,
              motions: buildPresetMotionDebugItems(group),
            })),
          },
        ]),
      ),
      touchMotionState,
    };
  }

  function toQueuedMotionDebugItem(motion: ActiveMotion): {
    presetPrefix: string;
    motionGroup: string;
    motionItemName: string;
    motionReference: string;
    priority: MotionPriority;
  } {
    const { group } = parseSelectedMotionReference(
      motion.selectedMotion.reference,
    );

    return {
      presetPrefix:
        motion.selectedMotion.presetPrefix ??
        getPresetPrefixFromReference(motion.selectedMotion.reference),
      motionGroup: group,
      motionItemName: motion.selectedMotion.motion.Name,
      motionReference: motion.selectedMotion.reference,
      priority: motion.priority,
    };
  }

  function getPresetPrefixFromReference(reference: string): string {
    return parseSelectedMotionReference(reference).group.match(/^[A-Za-z]+/)?.[0] ?? reference;
  }

  function installMotionDebugControls(): void {
    (window as MotionDebugWindow).live2dDebug = {
      getState: getMotionDebugState,

      notifyUserActivity(): void {
        notifyUserActivity();
      },

      startDefaultMotionCycle(): void {
        startDefaultMotionCycle();
      },

      requestIdleMotionCycle(): void {
        requestIdleMotion();
      },

      startReferencedMotion(reference: string): void {
        startReferencedMotion(reference);
      },
    };
  }

  function startDefaultMotionCycle(): void {
    if (!startPresetMotionCycle(START_MOTION_PREFIX)) {
      requestIdleMotion();
    }

    resetLeaveTimer();
  }

  function notifyUserActivity(): void {
    resetLeaveTimer();
  }

  function resetLeaveTimer(): void {
    const leaveSchedule = getLeaveSchedule();

    if (!leaveSchedule) {
      return;
    }

    if (leaveTimer !== undefined) {
      window.clearTimeout(leaveTimer);
    }

    leaveTimer = window.setTimeout(() => {
      leaveTimer = undefined;

      if (touchMotionState.status === 'idle') {
        startPresetMotionCycle(LEAVE_MOTION_PREFIX);
      }

      scheduleNextLeaveTrigger(leaveSchedule);
    }, leaveSchedule.startDelayMs);
  }

  function scheduleNextLeaveTrigger(leaveSchedule: LeaveSchedule): void {
    if (leaveTimer !== undefined) {
      window.clearTimeout(leaveTimer);
    }

    leaveTimer = window.setTimeout(() => {
      leaveTimer = undefined;

      if (touchMotionState.status === 'idle') {
        startPresetMotionCycle(LEAVE_MOTION_PREFIX);
      }

      scheduleNextLeaveTrigger(leaveSchedule);
    }, pickLeaveIntervalMs(leaveSchedule));
  }

  function getLeaveSchedule(): LeaveSchedule | undefined {
    const group = getPresetMotionGroups(LEAVE_MOTION_PREFIX)[0];

    if (!group) {
      return undefined;
    }

    const parsedLeaveGroup = parseLeaveGroup(group);

    if (!parsedLeaveGroup) {
      return undefined;
    }

    return parsedLeaveGroup;
  }

  function parseLeaveGroup(group: string): LeaveSchedule | undefined {
    const match = group.match(/^Leave(\d+)_(\d+)_(\d+)$/) ?? group.match(/^leave_(\d+)_(\d+)_(\d+)$/);

    if (!match) {
      return undefined;
    }

    const [startSeconds, minIntervalSeconds, maxIntervalSeconds] = match
      .slice(1)
      .map(Number);

    if (
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(minIntervalSeconds) ||
      !Number.isFinite(maxIntervalSeconds)
    ) {
      return undefined;
    }

    return {
      group,
      startDelayMs: startSeconds * 1000,
      minIntervalMs: minIntervalSeconds * 1000,
      maxIntervalMs: maxIntervalSeconds * 1000,
    };
  }

  function pickLeaveIntervalMs(leaveSchedule: LeaveSchedule): number {
    const { minIntervalMs, maxIntervalMs } = leaveSchedule;

    if (maxIntervalMs <= minIntervalMs) {
      return minIntervalMs;
    }

    return Math.round(
      minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs),
    );
  }

  function requestIdleMotion(): void {
    const requestId = ++idleRequestId;

    window.setTimeout(() => {
      void tryStartIdleMotionCycle(requestId);
    }, 0);
  }

  async function tryStartIdleMotionCycle(requestId: number): Promise<void> {
    if (requestId !== idleRequestId || touchMotionState.status !== 'idle') {
      return;
    }

    resetIdlePresetMotionBuffer();
    const started = await startBufferedPresetMotion();

    if (!started && debugTouch && requestId === idleRequestId) {
      console.log('[live2d-motion] idle not started', {
        variables: motionVariables.entries(),
      });
    }
  }

  function createPresetGroupsByPrefix(): Record<string, string[]> {
    const groupsByPrefix: Record<string, string[]> = {};

    for (const prefix of PRESET_MOTION_PREFIXES) {
      groupsByPrefix[prefix] = motionSelector.getPresetGroups(prefix);
    }

    return groupsByPrefix;
  }

  function createPresetReferencesByGroup(): Record<string, string[]> {
    const referencesByGroup: Record<string, string[]> = {};

    for (const groups of Object.values(presetGroupsByPrefix)) {
      for (const group of groups) {
        referencesByGroup[group] = buildPresetReferenceQueue(group);
      }
    }

    return referencesByGroup;
  }

  function createPresetFamilyCursorByPrefix(): Record<string, number> {
    return Object.fromEntries(
      PRESET_MOTION_PREFIXES.map((prefix) => [prefix, 0]),
    );
  }

  function createPresetCycleCursorByGroup(): Record<string, number> {
    return Object.fromEntries(
      Object.values(presetGroupsByPrefix)
        .flatMap((groups) => groups)
        .map((group) => [group, 0]),
    );
  }

  function buildPresetReferenceQueue(group: string): string[] {
    return getModelMotions(modelSettings, group).map((motion, index) => {
      const motionName = motion.Name || String(index);
      return createMotionReference(group, motionName);
    });
  }

  function buildPresetMotionDebugItems(group: string): Array<{
    name: string;
    reference: string;
    selectable: boolean;
  }> {
    return getModelMotions(modelSettings, group).map((motion, index) => {
      const name = motion.Name || String(index);
      const reference = createMotionReference(group, name);

      return {
        name,
        reference,
        selectable: motionSelector.selectReference(reference) !== undefined,
      };
    });
  }

  function selectPresetCycleFromCursor(
    groupPrefix: string,
    priority: MotionPriority,
  ): { cycleGroup?: string; motions: ActiveMotion[] } {
    const groups = presetGroupsByPrefix[groupPrefix] ?? [];

    if (groups.length === 0) {
      return { motions: [] };
    }

    const familyCursor = presetFamilyCursorByPrefix[groupPrefix] ?? 0;
    const orderedGroups = [
      ...groups.slice(familyCursor),
      ...groups.slice(0, familyCursor),
    ];

    const cycleSelections = orderedGroups.map((group) =>
      selectPresetCycleGroup(group, priority),
    );
    const firstSelectableCycle = cycleSelections.find(
      ({ motions }) => motions.length > 0,
    );

    if (!firstSelectableCycle) {
      return { motions: [] };
    }

    return {
      cycleGroup: firstSelectableCycle.group,
      motions: cycleSelections.flatMap(({ motions }) => motions),
    };
  }

  function selectPresetCycleGroup(
    group: string,
    priority: MotionPriority,
  ): { group: string; motions: ActiveMotion[] } {
    const references = presetReferencesByGroup[group] ?? [];

    if (references.length === 0) {
      return { group, motions: [] };
    }

    const cycleCursor = presetCycleCursorByGroup[group] ?? 0;
    const orderedReferences = [
      ...references.slice(cycleCursor),
      ...references.slice(0, cycleCursor),
    ];
    const selectedMotion = orderedReferences.reduce<SelectedMotion | undefined>(
      (selected, reference) =>
        selected ?? motionSelector.selectReference(reference),
      undefined,
    );

    return {
      group,
      motions:
        selectedMotion === undefined ? [] : [{ selectedMotion, priority }],
    };
  }

  function resetPresetMotionBuffer(
    groupPrefix: string,
    priority: MotionPriority,
  ): void {
    const { cycleGroup, motions } = selectPresetCycleFromCursor(
      groupPrefix,
      priority,
    );
    const [active, ...buffer] = motions;

    presetMotionBufferState = {
      requestId: active ? nextRequestId++ : undefined,
      presetPrefix: active ? groupPrefix : undefined,
      cycleGroup: active ? cycleGroup : undefined,
      active,
      buffer,
    };
  }

  function resetIdlePresetMotionBuffer(): void {
    resetPresetMotionBuffer(IDLE_MOTION_PREFIX, MotionPriority.IDLE);
  }

  async function startBufferedPresetMotion(): Promise<boolean> {
    if (!presetMotionBufferState.active || presetMotionBufferState.requestId === undefined) {
      return false;
    }

    const started = await playPresetMotionBufferItem(
      presetMotionBufferState.active,
      presetMotionBufferState.requestId,
    );

    if (!started && debugTouch) {
      console.log('[live2d-motion] queued motion rejected', {
        reference: presetMotionBufferState.active.selectedMotion.reference,
        variables: motionVariables.entries(),
      });
    }

    return started;
  }

  let currentAudio: HTMLAudioElement | undefined;

  function playSound(soundPath: string | undefined): void {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = undefined;
    }

    if (!soundPath) {
      return;
    }

    const audio = new Audio(soundPath);
    currentAudio = audio;
    audio.play().catch((error) => {
      console.warn('[live2d-motion] Failed to play audio:', soundPath, error);
    });
  }

  async function playPresetMotionBufferItem(
    active: ActiveMotion,
    requestId: number,
  ): Promise<boolean> {
    const motion = active.selectedMotion.motion;

    modelSettingsBridge.applyMotionCommand(motion);
    motionVariables.applyAssignments(motion);
    showMotionDialog(motion);
    playSound(motion.Sound);

    presetMotionBufferState.active = active;
    presetMotionBufferState.requestId = requestId;

    if (!motion.File) {
      advancePresetMotionBuffer(requestId);
      return true;
    }

    const started = await startEngineMotion(active)
      .catch((error: unknown) => {
        console.error('[live2d-motion] queued motion failed', {
          reference: active.selectedMotion.reference,
          error,
        });

        return false;
      });

    if (!started && presetMotionBufferState.requestId === requestId) {
      handlePresetMotionStartRejected(requestId);
    }

    if (started && debugTouch) {
      console.log('[live2d-motion] queued motion playing', {
        reference: active.selectedMotion.reference,
        variables: motionVariables.entries(),
      });
    }

    return started;
  }

  async function startEngineMotion(active: ActiveMotion): Promise<boolean> {
    const locator = resolveEngineMotionLocator(active.selectedMotion.reference);
    await modelSettingsBridge.prepareMotionPlayback(
      locator.group,
      locator.index,
      active.selectedMotion.motion,
    );

    return model.motion(locator.group, locator.index, active.priority);
  }

  function resolveEngineMotionLocator(reference: string): {
    group: string;
    index: number;
  } {
    const { group, motionName } = parseSelectedMotionReference(reference);

    if (motionName === undefined) {
      throw new Error(`Motion reference is missing motion name: ${reference}`);
    }

    const index = getModelMotions(modelSettings, group).findIndex(
      ({ Name }) => Name === motionName,
    );

    if (index < 0) {
      throw new Error(`Motion not found in ${group}: ${motionName}`);
    }

    return { group, index };
  }

  function advancePresetMotionBuffer(requestId: number): void {
    if (
      presetMotionBufferState.active === undefined ||
      presetMotionBufferState.requestId !== requestId
    ) {
      return;
    }

    const { active, buffer, presetPrefix, cycleGroup } = presetMotionBufferState;
    const completedReference = active.selectedMotion.reference;

    modelSettingsBridge.applyMotionPostCommand(active.selectedMotion.motion);
    advancePresetCycleCursor(cycleGroup, completedReference);

    if (buffer.length > 0) {
      const [next, ...rest] = buffer;
      presetMotionBufferState.active = next;
      presetMotionBufferState.buffer = rest;
      presetMotionBufferState.requestId = requestId;
      
      // Force next-frame execution to prevent synchronous recursion loops
      window.requestAnimationFrame(() => {
        void playPresetMotionBufferItem(next, requestId);
      });
      return;
    }

    advancePresetFamilyCursor(presetPrefix, cycleGroup);
    presetMotionBufferState.active = undefined;

    if (presetPrefix === IDLE_MOTION_PREFIX) {
      resetIdlePresetMotionBuffer();
      if (presetMotionBufferState.active && presetMotionBufferState.requestId !== undefined) {
        const next = presetMotionBufferState.active;
        const nextId = presetMotionBufferState.requestId;
        window.requestAnimationFrame(() => {
          void playPresetMotionBufferItem(next, nextId);
        });
      }
      return;
    }

    resetIdlePresetMotionBuffer();
    requestIdleMotion();
  }

  function handlePresetMotionStartRejected(requestId: number): void {
    if (
      presetMotionBufferState.requestId !== requestId ||
      presetMotionBufferState.presetPrefix === undefined
    ) {
      return;
    }

    if (presetMotionBufferState.buffer.length > 0) {
      const [next, ...rest] = presetMotionBufferState.buffer;
      presetMotionBufferState.active = next;
      presetMotionBufferState.buffer = rest;
      presetMotionBufferState.requestId = requestId;
      window.requestAnimationFrame(() => {
        void playPresetMotionBufferItem(next, requestId);
      });
      return;
    }

    advancePresetFamilyCursor(
      presetMotionBufferState.presetPrefix,
      presetMotionBufferState.cycleGroup,
    );

    if (presetMotionBufferState.presetPrefix === IDLE_MOTION_PREFIX) {
      resetIdlePresetMotionBuffer();
      if (
        presetMotionBufferState.active !== undefined &&
        presetMotionBufferState.requestId !== undefined
      ) {
        const next = presetMotionBufferState.active;
        const nextId = presetMotionBufferState.requestId;
        window.requestAnimationFrame(() => {
          void playPresetMotionBufferItem(next, nextId);
        });
      }
      return;
    }

    presetMotionBufferState = { buffer: [] };
    resetIdlePresetMotionBuffer();
    requestIdleMotion();
  }

  function advancePresetCycleCursor(
    cycleGroup: string | undefined,
    completedReference: string,
  ): void {
    if (!cycleGroup) {
      return;
    }

    const references = presetReferencesByGroup[cycleGroup] ?? [];

    if (references.length === 0) {
      presetCycleCursorByGroup[cycleGroup] = 0;
      return;
    }

    const completedIndex = references.indexOf(completedReference);

    if (completedIndex < 0) {
      return;
    }

    presetCycleCursorByGroup[cycleGroup] =
      (completedIndex + 1) % references.length;
  }

  function getPresetMotionGroups(groupPrefix: string): string[] {
    return presetGroupsByPrefix[groupPrefix] ?? [];
  }

  function advancePresetFamilyCursor(
    groupPrefix: string | undefined,
    completedGroup: string | undefined,
  ): void {
    if (!groupPrefix || !completedGroup) {
      return;
    }

    const groups = presetGroupsByPrefix[groupPrefix] ?? [];

    if (groups.length === 0) {
      presetFamilyCursorByPrefix[groupPrefix] = 0;
      return;
    }

    const completedIndex = groups.indexOf(completedGroup);

    if (completedIndex < 0) {
      return;
    }

    presetFamilyCursorByPrefix[groupPrefix] =
      (completedIndex + 1) % groups.length;
  }

  function startPresetMotionCycle(groupPrefix: string): boolean {
    if (
      touchMotionState.status !== 'idle' ||
      presetMotionBufferState.active !== undefined
    ) {
      return false;
    }

    resetPresetMotionBuffer(groupPrefix, MotionPriority.NORMAL);
    if (!presetMotionBufferState.active) {
      return false;
    }

    void startBufferedPresetMotion();
    return true;
  }

  function startReferencedMotion(reference: string): void {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      return;
    }

    playReferencedMotion(selected);
  }

  function playReferencedMotion(selectedMotion: SelectedMotion): void {
    const motion = selectedMotion.motion;

    modelSettingsBridge.applyMotionCommand(motion);
    motionVariables.applyAssignments(motion);
    showMotionDialog(motion);

    if (motion.File) {
      const locator = resolveEngineMotionLocator(selectedMotion.reference);

      void modelSettingsBridge
        .prepareMotionPlayback(locator.group, locator.index, motion)
        .then(() =>
          model.motion(locator.group, locator.index, MotionPriority.NORMAL),
        )
        .then((started) => {
          if (started) {
            schedulePostCommand(motion);
            return;
          }
          requestIdleMotion();
        })
        .catch((error: unknown) => {
          console.error('[live2d-motion] motion failed', {
            reference: selectedMotion.reference,
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
    const canInterruptIdlePreset =
      touchMotionState.status === 'idle' &&
      presetMotionBufferState.active !== undefined &&
      presetMotionBufferState.presetPrefix === IDLE_MOTION_PREFIX;

    if (touchMotionState.status !== 'idle' || (
      presetMotionBufferState.active !== undefined && !canInterruptIdlePreset
    )) {
      if (debugTouch) {
        console.log('[live2d-touch] request ignored', {
          action,
          touchMotionState,
        });
      }

      return;
    }

    if (canInterruptIdlePreset) {
      presetMotionBufferState = { buffer: [] };
    }

    const selected =
      action.kind === 'script'
        ? motionSelector.selectReference(action.reference)
        : action.motionIndex === undefined
        ? motionSelector.selectGroup(action.group)
        : {
            motion: motionSelector.getMotion(action.group, action.motionIndex),
            reference: createMotionReference(
              action.group,
              motionSelector.getMotion(action.group, action.motionIndex).Name,
            ),
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

    const locator = resolveEngineMotionLocator(selected.reference);

    void modelSettingsBridge
      .prepareMotionPlayback(locator.group, locator.index, motion)
      .then(() =>
        model.motion(
          locator.group,
          locator.index,
          MotionPriority.NORMAL,
        ),
      )
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
              reference: selected.reference,
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
              reference: selected.reference,
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
            reference: selected.reference,
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

  let lastDialogMotion: MotionItem | undefined;

  function showMotionDialog(motion: MotionItem): void {
    const hasContent = !!(motion.Text || (motion.Choices && motion.Choices.length > 0));

    // If this motion has no content, don't touch the dialog at all.
    // This allows interactive dialogs to stay visible while background motions play.
    if (!hasContent) {
      return;
    }

    // If the same motion is already being displayed, don't restart it (prevents flickering)
    if (lastDialogMotion === motion && modelDialog.isVisible) {
      return;
    }

    lastDialogMotion = motion;
    modelDialog.hide();
    modelDialog.showMotion(motion, (choice) => {
      lastDialogMotion = undefined;
      startReferencedMotion(choice.NextMtn);
    });
  }

  return {
    notifyUserActivity,
    startPresetMotionCycle,

    playTouchMotion,
    startDefaultMotionCycle,

    requestIdleMotionCycle(): void {
      requestIdleMotion();
    },

    startReferencedMotion(reference: string): void {
      startReferencedMotion(reference);
    },
  };
}
