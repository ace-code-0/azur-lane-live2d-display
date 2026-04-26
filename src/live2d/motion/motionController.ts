import {
  createModelSettingsBridge,
  getModelMotions,
} from '@/live2d/engine/live2dEngineBridge';
import {
  createMotionSelector,
  parseSelectedMotionReference,
} from './motionSelection';
import { createMotionReference } from './motionReference';
import { MotionVariableStore, getTimestamp } from './motionVariables';

import type { Cubism4Model } from '@/live2d/model';
import type { MotionItem, Settings } from '@/live2d/settings/modelSettings.types';
import type { TouchAction } from '@/live2d/interactions/touchActions';
import type { dialogController } from '@/ui/dialog';
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

const PRIORITY = {
  IDLE: 1,
  NORMAL: 2,
  FORCE: 9,
} as const;

type ActiveMotion = {
  selectedMotion: SelectedMotion;
  priority: number;
};

type MotionPlayStatus = 'started' | 'blocked' | 'rejected';

type MotionLocator = {
  group: string;
  index: number;
};

type ForegroundSequence = {
  requestId: number;
  source: string;
  presetPrefix?: string;
  cycleGroup?: string;
  current?: ActiveMotion;
  pending: ActiveMotion[];
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
  debugTouch: boolean,
): MotionController {
  const motionManager = model.internalModel?.motionManager;
  const motionVariables = new MotionVariableStore(modelSettings);
  const motionSelector = createMotionSelector(modelSettings, motionVariables);
  const presetGroupsByPrefix = createPresetGroupsByPrefix();
  const presetReferencesByGroup = createPresetReferencesByGroup();
  const presetFamilyCursorByPrefix = createPresetFamilyCursorByPrefix();
  const presetCycleCursorByGroup = createPresetCycleCursorByGroup();

  let foregroundSequence: ForegroundSequence | undefined;
  let idleRequestToken = 0;
  let idleTimer: number | undefined;
  let leaveTimer: number | undefined;
  const activeLayeredIdleGroups = new Set<string>();
  let nextRequestId = 1;

  const modelSettingsBridge = createModelSettingsBridge(model, modelSettings, {
    startReferencedMotion(reference, source) {
      enqueueReferencedMotion(reference, source);
    },
    onCommand(namespace, action, target, value, source) {
      if (!debugTouch) {
        return;
      }

      const command = target
        ? `${namespace} ${action} ${target} ${value ?? ''}`.trim()
        : `${namespace} ${action}`;
      const owner =
        source?.owner !== undefined
          ? `${source.phase}:${source.owner}`
          : (source?.phase ?? 'unknown');

      console.log(`${getTimestamp()} Command[${owner}]: ${command}`);
    },
  });
  modelSettingsBridge.applyInitialSettings();

  motionManager?.on('motionFinish', () => {
    if (foregroundSequence?.current?.selectedMotion.motion.File) {
      completeForegroundCurrent();
      return;
    }

    if (!foregroundSequence) {
      requestIdle('engine-finish');
    }
  });

  function startPresetMotionCycle(groupPrefix: string): boolean {
    if (groupPrefix === IDLE_MOTION_PREFIX) {
      requestIdle('preset');
      return true;
    }

    const priority =
      groupPrefix === START_MOTION_PREFIX ? PRIORITY.FORCE : PRIORITY.NORMAL;
    const selected = selectPresetMotion(groupPrefix, priority);

    if (!selected.active) {
      return false;
    }

    return startForegroundSequence(selected.active, {
      source: `preset:${groupPrefix}`,
      presetPrefix: groupPrefix,
      cycleGroup: selected.cycleGroup,
    });
  }

  function playTouchMotion(action: TouchAction): void {
    const selected =
      action.kind === 'script'
        ? motionSelector.selectReference(action.reference)
        : action.motionIndex === undefined
          ? motionSelector.selectGroup(action.group)
          : {
              motion: motionSelector.getMotion(
                action.group,
                action.motionIndex,
              ),
              reference: createMotionReference(
                action.group,
                motionSelector.getMotion(action.group, action.motionIndex).Name,
              ),
            };

    if (!selected || !motionVariables.matches(selected.motion)) {
      return;
    }

    startForegroundSequence(
      { selectedMotion: selected, priority: PRIORITY.NORMAL },
      { source: `touch:${selected.reference}` },
    );
  }

  function startReferencedMotion(reference: string): void {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      return;
    }

    startForegroundSequence(
      { selectedMotion: selected, priority: PRIORITY.FORCE },
      { source: `reference:${reference}` },
    );
  }

  function startForegroundSequence(
    active: ActiveMotion,
    options: {
      source: string;
      presetPrefix?: string;
      cycleGroup?: string;
    },
  ): boolean {
    const currentPriority = foregroundSequence?.current?.priority ?? 0;

    if (
      foregroundSequence &&
      active.priority <= currentPriority &&
      active.priority < PRIORITY.FORCE
    ) {
      return false;
    }

    idleRequestToken += 1;
    foregroundSequence = {
      requestId: nextRequestId++,
      source: options.source,
      presetPrefix: options.presetPrefix,
      cycleGroup: options.cycleGroup,
      current: active,
      pending: [],
    };

    void playForegroundCurrent(options.source);
    return true;
  }

  function enqueueReferencedMotion(
    reference: string,
    source?: {
      phase: 'command' | 'post-command';
      owner?: string;
    },
  ): void {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      return;
    }

    const active: ActiveMotion = {
      selectedMotion: selected,
      priority: foregroundSequence?.current?.priority ?? PRIORITY.FORCE,
    };

    if (!foregroundSequence) {
      startForegroundSequence(active, {
        source:
          source?.owner !== undefined
            ? `${source.phase}:${source.owner}`
            : 'derived',
      });
      return;
    }

    if (shouldDetachMotion(active.selectedMotion.motion)) {
      void playDetachedMotion(
        active,
        source?.owner !== undefined
          ? `detached:${source.phase}:${source.owner}`
          : 'detached:derived',
      );
      return;
    }

    foregroundSequence.pending.unshift(active);
  }

  async function playForegroundCurrent(source: string): Promise<void> {
    const sequence = foregroundSequence;
    const active = sequence?.current;

    if (!sequence || !active) {
      return;
    }

    const status = await playMotion(active, source, () => {
      completeForegroundCurrent();
    });

    if (
      status === 'blocked' &&
      foregroundSequence?.requestId === sequence.requestId
    ) {
      window.setTimeout(() => {
        if (foregroundSequence?.requestId === sequence.requestId) {
          void playForegroundCurrent(source);
        }
      }, 200);
      return;
    }

    if (
      status === 'rejected' &&
      foregroundSequence?.requestId === sequence.requestId
    ) {
      foregroundSequence = undefined;
      requestIdle('foreground-rejected');
    }
  }

  function completeForegroundCurrent(): void {
    const sequence = foregroundSequence;
    const current = sequence?.current;

    if (!sequence || !current) {
      return;
    }

    modelSettingsBridge.applyMotionPostCommand(current.selectedMotion.motion);
    advancePresetCycleCursor(
      sequence.cycleGroup,
      current.selectedMotion.reference,
    );

    const next = sequence.pending.shift();

    if (next) {
      sequence.current = next;
      void playForegroundCurrent(`queued:${next.selectedMotion.reference}`);
      return;
    }

    const finishedPrefix = sequence.presetPrefix;
    const finishedGroup = sequence.cycleGroup;
    foregroundSequence = undefined;
    advancePresetFamilyCursor(finishedPrefix, finishedGroup);
    requestIdle('foreground-complete');
  }

  async function playMotion(
    active: ActiveMotion,
    source: string,
    onComplete: () => void,
  ): Promise<MotionPlayStatus> {
    const motion = active.selectedMotion.motion;

    if (!motion.File) {
      logMotionLifecycle('started', active.selectedMotion.reference, source, {
        requestPriority: active.priority,
        vars: motionVariables.entries(),
      });
      applyMotionStartEffects(motion);
      const duration = Math.max(motion.MotionDuration ?? 0, 0);

      if (duration > 0) {
        window.setTimeout(onComplete, duration);
      } else {
        queueMicrotask(onComplete);
      }

      return 'started';
    }

    const locator = resolveEngineMotionLocator(active.selectedMotion.reference);
    await modelSettingsBridge.prepareMotionPlayback(
      locator.group,
      locator.index,
      motion,
    );

    const enginePriority =
      active.priority >= PRIORITY.FORCE
        ? 3
        : active.priority >= PRIORITY.NORMAL
          ? 2
          : 1;

    clearStaleReserve();

    if (shouldWaitForCurrentMotion(enginePriority)) {
      logMotionLifecycle('blocked', active.selectedMotion.reference, source, {
        requestPriority: active.priority,
        live2dPriority: getEnginePriorityName(enginePriority),
        reason: 'waits-current-motion',
        diagnostics: getMotionDiagnostics(active.selectedMotion.reference),
      });
      return 'blocked';
    }

    const started = await model.motion(
      locator.group,
      locator.index,
      enginePriority as never,
      {
        onError: (error) => {
          logMotionLifecycle('error', active.selectedMotion.reference, source, {
            requestPriority: active.priority,
            live2dPriority: getEnginePriorityName(enginePriority),
            error,
          });
        },
      },
    );

    if (!started) {
      clearStaleReserve();
      logMotionLifecycle('rejected', active.selectedMotion.reference, source, {
        requestPriority: active.priority,
        live2dPriority: getEnginePriorityName(enginePriority),
        diagnostics: getMotionDiagnostics(active.selectedMotion.reference),
      });
      return 'rejected';
    }

    logMotionLifecycle('started', active.selectedMotion.reference, source, {
      requestPriority: active.priority,
      live2dPriority: getEnginePriorityName(enginePriority),
      vars: motionVariables.entries(),
    });
    applyMotionStartEffects(motion);

    if (source === `preset:${START_MOTION_PREFIX}`) {
      void startLayeredIdleMotions();
    }

    return 'started';
  }

  async function playDetachedMotion(
    active: ActiveMotion,
    source: string,
  ): Promise<void> {
    const motion = active.selectedMotion.motion;
    logMotionLifecycle('started', active.selectedMotion.reference, source, {
      requestPriority: active.priority,
      detached: true,
      vars: motionVariables.entries(),
    });
    applyMotionStartEffects(motion);

    const duration = Math.max(motion.MotionDuration ?? 0, 0);

    window.setTimeout(() => {
      modelSettingsBridge.applyMotionPostCommand(motion);
      completeStartForegroundFromDetached();
      requestIdle('detached-motion-complete');
    }, duration);
  }

  function completeStartForegroundFromDetached(): void {
    const sequence = foregroundSequence;

    if (sequence?.presetPrefix !== START_MOTION_PREFIX) {
      return;
    }

    const finishedPrefix = sequence.presetPrefix;
    const finishedGroup = sequence.cycleGroup;

    foregroundSequence = undefined;
    advancePresetFamilyCursor(finishedPrefix, finishedGroup);
    releaseCurrentMotionPriority();
  }

  function applyMotionStartEffects(motion: MotionItem): void {
    modelSettingsBridge.applyMotionCommand(motion);
    motionVariables.applyAssignments(motion);
    showMotionDialog(motion);
    playSound(motion.Sound);
  }

  function requestIdle(reason: string): void {
    const token = ++idleRequestToken;

    if (idleTimer) {
      clearTimeout(idleTimer);
    }

    idleTimer = window.setTimeout(() => {
      idleTimer = undefined;

      if (token !== idleRequestToken || foregroundSequence) {
        return;
      }

      const selected = selectPresetMotion(IDLE_MOTION_PREFIX, PRIORITY.IDLE);

      if (!selected.active) {
        return;
      }

      void playMotion(selected.active, `idle:${reason}`, () => {}).then(
        (status) => {
          if (
            status === 'blocked' &&
            token === idleRequestToken &&
            !foregroundSequence
          ) {
            window.setTimeout(() => requestIdle('engine-blocked'), 200);
          }
        },
      );
    }, 50);
  }

  function selectPresetMotion(
    groupPrefix: string,
    priority: number,
  ): {
    cycleGroup?: string;
    active?: ActiveMotion;
  } {
    const groups = presetGroupsByPrefix[groupPrefix] ?? [];
    const familyCursor = presetFamilyCursorByPrefix[groupPrefix] ?? 0;
    const orderedGroups = [
      ...groups.slice(familyCursor),
      ...groups.slice(0, familyCursor),
    ];

    for (const group of orderedGroups) {
      const references = presetReferencesByGroup[group] ?? [];
      const cycleCursor = presetCycleCursorByGroup[group] ?? 0;
      const orderedRefs = [
        ...references.slice(cycleCursor),
        ...references.slice(0, cycleCursor),
      ];

      for (const reference of orderedRefs) {
        const selected = motionSelector.selectReference(reference);

        if (selected) {
          return {
            cycleGroup: group,
            active: { selectedMotion: selected, priority },
          };
        }
      }
    }

    return {};
  }

  function resolveEngineMotionLocator(reference: string) {
    const { group, motionName } = parseSelectedMotionReference(reference);
    const index = getModelMotions(modelSettings, group).findIndex(
      (motion) => motion.Name === motionName,
    );

    if (index < 0) {
      throw new Error(`Not found: ${reference}`);
    }

    return { group, index };
  }

  async function startLayeredIdleMotions(): Promise<void> {
    const groups = getLayeredIdleGroups();

    for (const group of groups) {
      if (activeLayeredIdleGroups.has(group)) {
        continue;
      }

      const selected = motionSelector.selectGroup(group);

      if (!selected?.motion.File) {
        continue;
      }

      const locator = resolveEngineMotionLocator(selected.reference);
      const started = await playLayeredMotion(
        locator,
        selected,
        PRIORITY.IDLE,
        'layered-idle',
      );

      if (started) {
        activeLayeredIdleGroups.add(group);
      }
    }
  }

  async function playLayeredMotion(
    locator: MotionLocator,
    selected: SelectedMotion,
    priority: number,
    source: string,
  ): Promise<boolean> {
    const layer = getMotionLayer(locator.group);

    if (layer === undefined || layer <= 0) {
      return false;
    }

    const parallel = model.internalModel as
      | {
          extendParallelMotionManager?: (count: number) => void;
          parallelMotionManager?: {
            startMotion?: (
              group: string,
              index: number,
              priority?: number,
            ) => Promise<boolean>;
          }[];
        }
      | undefined;

    parallel?.extendParallelMotionManager?.(layer);

    const manager = parallel?.parallelMotionManager?.[layer - 1];

    if (!manager?.startMotion) {
      return false;
    }

    await modelSettingsBridge.prepareMotionPlayback(
      locator.group,
      locator.index,
      selected.motion,
    );

    const started = await manager.startMotion(
      locator.group,
      locator.index,
      priority >= PRIORITY.FORCE ? 3 : priority >= PRIORITY.NORMAL ? 2 : 1,
    );

    logMotionLifecycle(
      started ? 'started' : 'rejected',
      selected.reference,
      source,
      {
        requestPriority: priority,
        live2dPriority: getEnginePriorityName(
          priority >= PRIORITY.FORCE ? 3 : priority >= PRIORITY.NORMAL ? 2 : 1,
        ),
        layer,
        vars: motionVariables.entries(),
      },
    );

    return started;
  }

  function advancePresetCycleCursor(
    group: string | undefined,
    ref: string,
  ): void {
    if (!group) {
      return;
    }

    const refs = presetReferencesByGroup[group] ?? [];
    const idx = refs.indexOf(ref);

    if (idx >= 0) {
      presetCycleCursorByGroup[group] = (idx + 1) % refs.length;
    }
  }

  function advancePresetFamilyCursor(
    prefix: string | undefined,
    group: string | undefined,
  ): void {
    if (!prefix || !group) {
      return;
    }

    const groups = presetGroupsByPrefix[prefix] ?? [];
    const idx = groups.indexOf(group);

    if (idx >= 0) {
      presetFamilyCursorByPrefix[prefix] = (idx + 1) % groups.length;
    }
  }

  function createPresetGroupsByPrefix(): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const prefix of PRESET_MOTION_PREFIXES) {
      result[prefix] = motionSelector.getPresetGroups(prefix);
    }

    return result;
  }

  function createPresetReferencesByGroup(): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const groups of Object.values(presetGroupsByPrefix)) {
      for (const group of groups) {
        result[group] = getModelMotions(modelSettings, group).map(
          (motion, index) =>
            createMotionReference(group, motion.Name || String(index)),
        );
      }
    }

    return result;
  }

  function createPresetFamilyCursorByPrefix(): Record<string, number> {
    return Object.fromEntries(
      PRESET_MOTION_PREFIXES.map((prefix) => [prefix, 0]),
    );
  }

  function createPresetCycleCursorByGroup(): Record<string, number> {
    return Object.fromEntries(
      Object.values(presetGroupsByPrefix)
        .flat()
        .map((group) => [group, 0]),
    );
  }

  function getLayeredIdleGroups(): string[] {
    return Object.keys(modelSettings.FileReferences.Motions).filter(
      (group) =>
        group.startsWith(`${IDLE_MOTION_PREFIX}#`) &&
        getMotionLayer(group) !== undefined,
    );
  }

  function getMotionLayer(group: string): number | undefined {
    const match = group.match(/#(\d+)$/);

    if (!match) {
      return undefined;
    }

    const layer = Number(match[1]);

    return Number.isInteger(layer) && layer > 0 ? layer : undefined;
  }

  function startDefaultMotionCycle(): void {
    startPresetMotionCycle(START_MOTION_PREFIX);
    resetLeaveTimer();
  }

  function notifyUserActivity(): void {
    resetLeaveTimer();
  }

  function resetLeaveTimer(): void {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
    }

    const group = motionSelector.getPresetGroups(LEAVE_MOTION_PREFIX)[0];

    if (!group) {
      return;
    }

    const match = group.match(/Leave(\d+)_(\d+)_(\d+)/);

    if (match) {
      leaveTimer = window.setTimeout(
        () => {
          startPresetMotionCycle(LEAVE_MOTION_PREFIX);
        },
        Number(match[1]) * 1000,
      );
    }
  }

  function showMotionDialog(motion: MotionItem): void {
    const hasContent = !!(
      motion.Text ||
      (motion.Choices && motion.Choices.length > 0)
    );

    if (!hasContent) {
      return;
    }

    dialogController.hide();

    if (motion.Choices && motion.Choices.length > 0) {
      dialogController.showChoices(
        motion.Text ?? '',
        motion.Choices.map((choice) => ({
          label: choice.Text,
          onSelect: () => startReferencedMotion(choice.NextMtn),
        })),
      );
      return;
    }

    if (motion.Text) {
      dialogController.showText(motion.Text);
    }
  }

  function logMotionLifecycle(
    event: 'started' | 'blocked' | 'rejected' | 'error',
    ref: string,
    source: string,
    extra?: Record<string, unknown>,
  ): void {
    if (!debugTouch) {
      return;
    }

    console.log(`${getTimestamp()} Motion:${event} ${ref}`, {
      source,
      ...extra,
    });
  }

  function getMotionDiagnostics(reference: string): Record<string, unknown> {
    const state = motionManager?.state as
      | {
          currentPriority?: number;
          reservePriority?: number;
          currentGroup?: string;
          currentIndex?: number;
          reservedGroup?: string;
          reservedIndex?: number;
          reservedIdleGroup?: string;
          reservedIdleIndex?: number;
          isActive?: (group: string, index: number) => boolean;
        }
      | undefined;

    const current = foregroundSequence?.current;
    let engineLocator:
      | {
          group: string;
          index: number;
        }
      | undefined;

    try {
      engineLocator = resolveEngineMotionLocator(reference);
    } catch {
      engineLocator = undefined;
    }

    return {
      playing: motionManager?.playing,
      foregroundCurrent: current?.selectedMotion.reference,
      foregroundQueue:
        foregroundSequence?.pending.map(
          ({ selectedMotion }) => selectedMotion.reference,
        ) ?? [],
      state: state
        ? {
            currentPriority: state.currentPriority,
            reservePriority: state.reservePriority,
            currentGroup: state.currentGroup,
            currentIndex: state.currentIndex,
            reservedGroup: state.reservedGroup,
            reservedIndex: state.reservedIndex,
            reservedIdleGroup: state.reservedIdleGroup,
            reservedIdleIndex: state.reservedIdleIndex,
            isCurrentActive:
              engineLocator && state.isActive
                ? state.isActive(engineLocator.group, engineLocator.index)
                : undefined,
          }
        : undefined,
    };
  }

  function playSound(path?: string): void {
    if (path) {
      new Audio(resolveModelAssetUrl(path)).play().catch(() => {});
    }
  }

  function getEnginePriorityName(priority: number): string {
    if (priority >= 3) {
      return 'FORCE';
    }

    if (priority >= 2) {
      return 'NORMAL';
    }

    if (priority >= 1) {
      return 'IDLE';
    }

    return 'NONE';
  }

  function resolveModelAssetUrl(path: string): string {
    const settings = motionManager?.settings as
      | {
          resolveURL?: (path: string) => string;
        }
      | undefined;

    return settings?.resolveURL?.(path) ?? path;
  }

  function shouldDetachMotion(motion: MotionItem): boolean {
    return !motion.File && Math.max(motion.MotionDuration ?? 0, 0) > 0;
  }

  function shouldWaitForCurrentMotion(enginePriority: number): boolean {
    if (enginePriority >= 3) {
      return false;
    }

    const state = motionManager?.state as
      | {
          currentPriority?: number;
        }
      | undefined;

    return (state?.currentPriority ?? 0) >= enginePriority;
  }

  function releaseCurrentMotionPriority(): void {
    const state = motionManager?.state as
      | {
          complete?: () => void;
        }
      | undefined;

    state?.complete?.();
  }

  function clearStaleReserve(): void {
    const state = motionManager?.state as
      | {
          currentPriority?: number;
          reservePriority?: number;
          setReserved?: (
            group: string | undefined,
            index: number | undefined,
            priority: number,
          ) => void;
        }
      | undefined;

    if (
      state?.setReserved &&
      state.currentPriority === 0 &&
      (state.reservePriority ?? 0) > 0
    ) {
      state.setReserved(undefined, undefined, 0);
    }
  }

  return {
    notifyUserActivity,
    startPresetMotionCycle,
    playTouchMotion,
    startDefaultMotionCycle,
    requestIdleMotionCycle() {
      requestIdle('public-api');
    },
    startReferencedMotion,
  };
}
