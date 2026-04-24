import {
  createModelSettingsBridge,
  getModelMotions,
} from './live2dEngineBridge';
import {
  createMotionSelector,
  parseSelectedMotionReference,
} from './motionSelection';
import { createMotionReference } from './motionReference';
import { MotionVariableStore, getTimestamp } from './motionVariables';

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

const L2DEX_PRIORITY = {
  IDLE: 1,
  NORMAL: 2,
  FORCE: 9,
} as const;

type ActiveMotion = {
  selectedMotion: SelectedMotion;
  priority: number;
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

  let foregroundSequence: ForegroundSequence | undefined;
  let leaveTimer: number | undefined;
  let idleRequestToken = 0;
  let idleRetryCount = 0;
  let idleRetryTimer: number | undefined;
  let idleBlockedByEngine = false;
  let nextRequestId = 1;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  const motionManager = internalModel.motionManager;
  const modelSettingsBridge = createModelSettingsBridge(model, modelSettings, {
    startReferencedMotion(reference, source) {
      enqueueReferencedMotion(reference, source);
    },
    onCommand(namespace, action, target, value, source) {
      const cmd = target
        ? `${namespace} ${action} ${target} ${value ?? ''}`.trim()
        : `${namespace} ${action}`;
      const sourceLabel =
        source?.owner !== undefined
          ? `${source.phase}:${source.owner}`
          : source?.phase ?? 'unknown';

      console.log(`${getTimestamp()} Command[${sourceLabel}]: ${cmd}`);
      logScheduler('command', {
        namespace,
        action,
        target,
        value,
        owner: source?.owner,
      });

      reconcileIdle('command');
    },
  });
  modelSettingsBridge.applyInitialSettings();

  motionManager?.on('motionFinish', () => {
    idleBlockedByEngine = false;
    const current = foregroundSequence?.current;

    if (current) {
      completeForegroundMotion('engine-finish');
      return;
    }

    logScheduler('motion-finish-without-foreground', {
      playing: motionManager?.playing,
    });
    reconcileIdle('engine-finish-no-foreground');
  });

  reconcileIdle('bootstrap');

  async function playMotion(
    active: ActiveMotion,
    source: string,
    isForeground: boolean,
  ): Promise<boolean> {
    const motion = active.selectedMotion.motion;
    logMotionStart(active.selectedMotion.reference, active.priority, source);

    if (!motion.File) {
      applyMotionStartEffects(motion);

      const duration = Math.max(motion.MotionDuration ?? 0, 0);

      if (duration > 0) {
        scheduleDetachedPostCommand(active, source, duration);
      } else {
        modelSettingsBridge.applyMotionPostCommand(motion);
      }

      if (isForeground) {
        completeForegroundMotion(
          duration > 0 ? 'detached-duration-scheduled' : 'instant-slot',
          duration <= 0,
        );
      }
      return true;
    }

    const locator = resolveEngineMotionLocator(active.selectedMotion.reference);
    await modelSettingsBridge.prepareMotionPlayback(
      locator.group,
      locator.index,
      motion,
    );

    const enginePriority =
      active.priority >= L2DEX_PRIORITY.FORCE ? 3 : active.priority >= L2DEX_PRIORITY.NORMAL ? 2 : 1;
    const started = await model.motion(locator.group, locator.index, enginePriority as never, {
      onFinish: () => {
        if (isForeground) {
          if (
            foregroundSequence?.current?.selectedMotion.reference ===
            active.selectedMotion.reference
          ) {
            completeForegroundMotion('motion-onFinish');
          }
          return;
        }

        idleBlockedByEngine = false;
        logScheduler('idle-finished', {
          reference: active.selectedMotion.reference,
          source,
        });
        reconcileIdle('idle-finish');
      },
    });

    if (!started) {
      logScheduler('motion-start-rejected', {
        reference: active.selectedMotion.reference,
        source,
        isForeground,
        enginePriority,
        playing: motionManager?.playing,
      });

      if (!isForeground && motionManager?.playing) {
        idleBlockedByEngine = true;
      }
      return false;
    }

    applyMotionStartEffects(motion);
    return true;
  }

  function applyMotionStartEffects(motion: MotionItem): void {
    modelSettingsBridge.applyMotionCommand(motion);
    motionVariables.applyAssignments(motion);
    showMotionDialog(motion);
    playSound(motion.Sound);
  }

  function scheduleDetachedPostCommand(
    active: ActiveMotion,
    source: string,
    duration: number,
  ): void {
    const { motion } = active.selectedMotion;

    window.setTimeout(() => {
      modelSettingsBridge.applyMotionPostCommand(motion);
      logScheduler('detached-post-command-fired', {
        reference: active.selectedMotion.reference,
        duration,
        source,
      });
      reconcileIdle('detached-post-command');
    }, duration);

    logScheduler('detached-post-command-scheduled', {
      reference: active.selectedMotion.reference,
      duration,
      source,
    });
  }

  function completeForegroundMotion(
    trigger: string,
    skipPostCommand = false,
  ): void {
    const sequence = foregroundSequence;
    const current = sequence?.current;

    if (!sequence || !current) {
      logScheduler('complete-skipped', { trigger });
      return;
    }

    logScheduler('foreground-complete', {
      trigger,
      requestId: sequence.requestId,
      reference: current.selectedMotion.reference,
      skipPostCommand,
    });

    if (!skipPostCommand) {
      modelSettingsBridge.applyMotionPostCommand(current.selectedMotion.motion);
    }

    advancePresetCycleCursor(sequence.cycleGroup, current.selectedMotion.reference);

    const next = sequence.pending.shift();

    if (next) {
      sequence.current = next;
      void playMotion(next, `queued-after:${trigger}`, true).then((started) => {
        if (!started && foregroundSequence?.requestId === sequence.requestId) {
          completeForegroundMotion('engine-rejected');
        }
      });
      return;
    }

    const finishedPrefix = sequence.presetPrefix;
    const finishedGroup = sequence.cycleGroup;
    foregroundSequence = undefined;
    advancePresetFamilyCursor(finishedPrefix, finishedGroup);
    reconcileIdle(`after:${trigger}`);
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

    if (foregroundSequence && active.priority < currentPriority) {
      logScheduler('sequence-rejected', {
        source: options.source,
        requested: active.selectedMotion.reference,
        active: foregroundSequence.current?.selectedMotion.reference,
      });
      return false;
    }

    cancelIdleRetry('foreground-start');

    const sequence: ForegroundSequence = {
      requestId: nextRequestId++,
      source: options.source,
      presetPrefix: options.presetPrefix,
      cycleGroup: options.cycleGroup,
      current: active,
      pending: [],
    };
    foregroundSequence = sequence;

    logScheduler('sequence-start', {
      requestId: sequence.requestId,
      source: options.source,
      reference: active.selectedMotion.reference,
      priority: active.priority,
      presetPrefix: options.presetPrefix,
      cycleGroup: options.cycleGroup,
    });

    void playMotion(active, options.source, true).then((started) => {
      if (!started && foregroundSequence?.requestId === sequence.requestId) {
        foregroundSequence = undefined;
        reconcileIdle('foreground-rejected');
      }
    });

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
      logScheduler('enqueue-missing', {
        reference,
        owner: source?.owner,
        phase: source?.phase,
      });
      return;
    }

    const active: ActiveMotion = {
      selectedMotion: selected,
      priority: foregroundSequence?.current?.priority ?? L2DEX_PRIORITY.FORCE,
    };
    const sourceLabel =
      source?.owner !== undefined
        ? `${source.phase}:${source.owner}`
        : source?.phase ?? 'direct';

    if (foregroundSequence) {
      foregroundSequence.pending.unshift(active);
      logScheduler('queued-derived-motion', {
        from: sourceLabel,
        reference,
        queue: foregroundSequence.pending.map(
          ({ selectedMotion }) => selectedMotion.reference,
        ),
      });
      return;
    }

    startForegroundSequence(active, {
      source: `derived:${sourceLabel}`,
    });
  }

  function playTouchMotion(action: TouchAction): void {
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

    if (!selected || !motionVariables.matches(selected.motion)) {
      logScheduler('touch-no-match', { reference: action.reference });
      return;
    }

    startForegroundSequence(
      { selectedMotion: selected, priority: L2DEX_PRIORITY.NORMAL },
      {
        source: `touch:${selected.reference}`,
      },
    );
  }

  function startReferencedMotion(reference: string): void {
    const selected = motionSelector.selectReference(reference);

    if (!selected) {
      logScheduler('reference-missing', { reference });
      return;
    }

    startForegroundSequence(
      { selectedMotion: selected, priority: L2DEX_PRIORITY.FORCE },
      {
        source: `reference:${reference}`,
      },
    );
  }

  function startPresetMotionCycle(groupPrefix: string): boolean {
    if (groupPrefix === IDLE_MOTION_PREFIX) {
      reconcileIdle('public-idle-request');
      return true;
    }

    const priority =
      groupPrefix === START_MOTION_PREFIX
        ? L2DEX_PRIORITY.FORCE
        : L2DEX_PRIORITY.NORMAL;
    const selected = selectPresetMotionFromCursor(groupPrefix, priority);

    if (!selected.active) {
      logScheduler('preset-empty', { groupPrefix });
      return false;
    }

    return startForegroundSequence(selected.active, {
      source: `preset:${groupPrefix}`,
      presetPrefix: groupPrefix,
      cycleGroup: selected.cycleGroup,
    });
  }

  function reconcileIdle(reason: string): void {
    idleRequestToken += 1;

    if (foregroundSequence) {
      logScheduler('idle-skipped', {
        reason,
        foreground: foregroundSequence.current?.selectedMotion.reference,
      });
      return;
    }

    if (idleBlockedByEngine) {
      logScheduler('idle-blocked-by-engine', {
        reason,
      });
      return;
    }

    const idle = selectPresetMotionFromCursor(
      IDLE_MOTION_PREFIX,
      L2DEX_PRIORITY.IDLE,
    );

    if (!idle.active) {
      logScheduler('idle-empty', { reason });
      return;
    }

    const token = idleRequestToken;
    const source = `idle:${reason}`;

    logScheduler('idle-requested', {
      token,
      reason,
      reference: idle.active.selectedMotion.reference,
      retryCount: idleRetryCount,
    });

    window.setTimeout(() => {
      if (token !== idleRequestToken) {
        logScheduler('idle-cancelled', { token, reason: 'superseded' });
        return;
      }

      if (foregroundSequence) {
        logScheduler('idle-cancelled', { token, reason: 'foreground-active' });
        return;
      }

      void playMotion(idle.active, source, false).then((started) => {
        if (token !== idleRequestToken || foregroundSequence) {
          return;
        }

        if (started) {
          idleRetryCount = 0;
          logScheduler('idle-started', {
            token,
            reference: idle.active?.selectedMotion.reference,
            playing: motionManager?.playing,
          });
          return;
        }

        if (motionManager?.playing) {
          idleBlockedByEngine = true;
          logScheduler('idle-wait-motion-finish', {
            reference: idle.active.selectedMotion.reference,
            source,
          });
          return;
        }

        scheduleIdleRetry(idle.active.selectedMotion.reference, source);
      });
    }, 50);
  }

  function scheduleIdleRetry(reference: string, source: string): void {
    idleRetryCount += 1;
    cancelIdleRetry('reschedule');

    const delay = idleRetryCount > 5 ? 1000 : 120;
    logScheduler('idle-retry-scheduled', {
      reference,
      source,
      retryCount: idleRetryCount,
      delay,
      playing: motionManager?.playing,
    });

    idleRetryTimer = window.setTimeout(() => {
      idleRetryTimer = undefined;
      reconcileIdle(`retry:${idleRetryCount}`);
    }, delay);
  }

  function cancelIdleRetry(reason: string): void {
    if (idleRetryTimer !== undefined) {
      window.clearTimeout(idleRetryTimer);
      idleRetryTimer = undefined;
      logScheduler('idle-retry-cancelled', { reason });
    }
  }

  function selectPresetMotionFromCursor(
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

  function logMotionStart(ref: string, priority: number, source: string): void {
    console.log(
      `${getTimestamp()} Motion: ${ref} | Priority: ${priority} | Source: ${source} | Vars:`,
      motionVariables.entries(),
    );
    logScheduler('slot-start', { ref, priority, source });
  }

  function logScheduler(event: string, detail?: Record<string, unknown>): void {
    if (!debugTouch) {
      return;
    }

    console.log(`${getTimestamp()} Scheduler: ${event}`, {
      ...detail,
      foregroundRequestId: foregroundSequence?.requestId,
      foregroundSource: foregroundSequence?.source,
      foregroundCurrent: foregroundSequence?.current?.selectedMotion.reference,
      foregroundQueue:
        foregroundSequence?.pending.map(
          ({ selectedMotion }) => selectedMotion.reference,
        ) ?? [],
      playing: motionManager?.playing,
    });
  }

  function playSound(path?: string): void {
    if (path) {
      new Audio(path).play().catch(() => {});
    }
  }

  function advancePresetCycleCursor(group: string | undefined, ref: string): void {
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
    return Object.fromEntries(PRESET_MOTION_PREFIXES.map((prefix) => [prefix, 0]));
  }

  function createPresetCycleCursorByGroup(): Record<string, number> {
    return Object.fromEntries(
      Object.values(presetGroupsByPrefix)
        .flat()
        .map((group) => [group, 0]),
    );
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
      leaveTimer = window.setTimeout(() => {
        startPresetMotionCycle(LEAVE_MOTION_PREFIX);
      }, Number(match[1]) * 1000);
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

    modelDialog.hide();
    modelDialog.showMotion(motion, (choice) => startReferencedMotion(choice.NextMtn));
  }

  return {
    notifyUserActivity,
    startPresetMotionCycle,
    playTouchMotion,
    startDefaultMotionCycle,
    requestIdleMotionCycle() {
      reconcileIdle('public-api');
    },
    startReferencedMotion,
  };
}
