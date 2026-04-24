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

// L2DEX 标准优先级
const L2DEX_PRIORITY = {
  IDLE: 1,
  NORMAL: 2,
  FORCE: 9,
} as const;

type ActiveMotion = {
  selectedMotion: SelectedMotion;
  priority: number;
};

/**
 * 统一 Slot 调度状态 (完全模仿 L2DEX 核心控制器)
 */
type MotionSchedulerState = {
  requestId?: number;
  presetPrefix?: string;
  cycleGroup?: string;
  currentMotionSlot?: ActiveMotion;
  nextMotionSlot?: ActiveMotion;
  // 交互状态标记，替代原有的 touchMotionState
  isInteractionActive: boolean;
};

type MotionDebugState = {
  motionVariables: Record<string, number>;
  pendingIdleRequestId: number;
  motionScheduler: {
    presetPrefix?: string;
    currentSlot?: string;
    nextSlot?: string;
    isInteractionActive: boolean;
  };
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
  
  let motionScheduler: MotionSchedulerState = { isInteractionActive: false };
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
    onCommand(namespace, action, target, value) {
      const cmd = target ? `${namespace} ${action} ${target} ${value ?? ''}` : `${namespace} ${action}`;
      console.log(`${getTimestamp()} Command: ${cmd}`);
      
      // 指令执行后重评估变量匹配
      reevaluateIdleSlot();
    }
  });
  modelSettingsBridge.applyInitialSettings();

  if (debugTouch) {
    installMotionDebugControls();
  }

  // 初始启动 Idle
  requestIdleMotion();

  motionManager.on('motionFinish', () => {
    const currentId = motionScheduler.requestId;
    
    // 如果没有正在播放的 Slot，或者 ID 已经失效，强制回到 Idle
    if (!motionScheduler.currentMotionSlot || currentId === undefined) {
      requestIdleMotion();
      return;
    }

    // 处理当前动作结束后的接力
    advanceMotionScheduler(currentId);
  });

  function getMotionDebugState(): MotionDebugState {
    return {
      motionVariables: motionVariables.entries(),
      pendingIdleRequestId: idleRequestId,
      motionScheduler: {
        presetPrefix: motionScheduler.presetPrefix,
        currentSlot: motionScheduler.currentMotionSlot?.selectedMotion.reference,
        nextSlot: motionScheduler.nextMotionSlot?.selectedMotion.reference,
        isInteractionActive: motionScheduler.isInteractionActive,
      },
    };
  }

  function installMotionDebugControls(): void {
    (window as MotionDebugWindow).live2dDebug = {
      getState: getMotionDebugState,
      notifyUserActivity() { notifyUserActivity(); },
      startDefaultMotionCycle() { startDefaultMotionCycle(); },
      requestIdleMotionCycle() { requestIdleMotion(); },
      startReferencedMotion(reference) { startReferencedMotion(reference); },
    };
  }

  function requestIdleMotion(): void {
    const requestId = ++idleRequestId;
    window.setTimeout(() => {
        // 只有当没有更高优先级的“交互”在进行，且请求 ID 匹配时才启动 Idle
        if (requestId === idleRequestId && !motionScheduler.isInteractionActive) {
            assignSlotsAndStart(IDLE_MOTION_PREFIX, L2DEX_PRIORITY.IDLE);
        }
    }, 0);
  }

  function reevaluateIdleSlot(): void {
      if (motionScheduler.presetPrefix !== IDLE_MOTION_PREFIX || motionScheduler.isInteractionActive) return;
      const current = motionScheduler.currentMotionSlot;
      if (!current || !motionVariables.matches(current.selectedMotion.motion)) {
          requestIdleMotion();
      }
  }

  async function playScheduledMotionItem(active: ActiveMotion, requestId: number): Promise<boolean> {
    const motion = active.selectedMotion.motion;
    
    // 更新 Slot 状态
    motionScheduler.currentMotionSlot = active;
    motionScheduler.requestId = requestId;

    if (!motion.File) {
      logMotionStart(active.selectedMotion.reference, active.priority);
      modelSettingsBridge.applyMotionCommand(motion);
      motionVariables.applyAssignments(motion);
      showMotionDialog(motion);
      playSound(motion.Sound);
      advanceMotionScheduler(requestId);
      return true;
    }

    const started = await startEngineMotion(active).catch(() => false);
    if (started) {
      logMotionStart(active.selectedMotion.reference, active.priority);
      modelSettingsBridge.applyMotionCommand(motion);
      motionVariables.applyAssignments(motion);
      showMotionDialog(motion);
      playSound(motion.Sound);
    } else if (motionScheduler.requestId === requestId) {
      // 被拒后的自愈逻辑：如果是 Idle 则重试，否则跳过
      if (motionScheduler.presetPrefix === IDLE_MOTION_PREFIX) {
          window.setTimeout(() => requestIdleMotion(), 100);
      } else {
          advanceMotionScheduler(requestId);
      }
    }
    return started;
  }

  async function startEngineMotion(active: ActiveMotion): Promise<boolean> {
    const locator = resolveEngineMotionLocator(active.selectedMotion.reference);
    await modelSettingsBridge.prepareMotionPlayback(locator.group, locator.index, active.selectedMotion.motion);
    return model.motion(locator.group, locator.index, active.priority as any);
  }

  function advanceMotionScheduler(requestId: number): void {
    if (motionScheduler.requestId !== requestId) return;

    const { currentMotionSlot, nextMotionSlot, presetPrefix, cycleGroup } = motionScheduler;
    if (!currentMotionSlot) return;

    modelSettingsBridge.applyMotionPostCommand(currentMotionSlot.selectedMotion.motion);
    advancePresetCycleCursor(cycleGroup, currentMotionSlot.selectedMotion.reference);

    if (nextMotionSlot) {
      motionScheduler.currentMotionSlot = nextMotionSlot;
      motionScheduler.nextMotionSlot = undefined;
      void playScheduledMotionItem(nextMotionSlot, requestId);
      return;
    }

    // 动作序列彻底结束
    motionScheduler.currentMotionSlot = undefined;
    motionScheduler.isInteractionActive = false;
    advancePresetFamilyCursor(presetPrefix, cycleGroup);
    requestIdleMotion();
  }

  function assignSlotsAndStart(groupPrefix: string, priority: number): void {
      const { cycleGroup, motions } = selectPresetCycleFromCursor(groupPrefix, priority);
      const [current, next] = motions;
      if (!current) return;

      const newRequestId = nextRequestId++;
      const canInterrupt = !motionScheduler.currentMotionSlot || priority >= motionScheduler.currentMotionSlot.priority;

      if (canInterrupt) {
          motionScheduler.presetPrefix = groupPrefix;
          motionScheduler.cycleGroup = cycleGroup;
          motionScheduler.nextMotionSlot = next;
          void playScheduledMotionItem(current, newRequestId);
      }
  }

  // --- API 接入 ---

  function playTouchMotion(action: TouchAction): void {
    // 如果已经有正在播放的交互动作，不予打断（L2DEX 规则）
    if (motionScheduler.isInteractionActive) return;

    const selected = action.kind === 'script' 
        ? motionSelector.selectReference(action.reference)
        : action.motionIndex === undefined ? motionSelector.selectGroup(action.group) : { motion: motionSelector.getMotion(action.group, action.motionIndex), reference: createMotionReference(action.group, motionSelector.getMotion(action.group, action.motionIndex).Name) };

    if (!selected || !motionVariables.matches(selected.motion)) return;

    const requestId = nextRequestId++;
    motionScheduler.isInteractionActive = true;
    motionScheduler.presetPrefix = undefined; // 交互不是预定义周期
    
    void playScheduledMotionItem({ selectedMotion: selected, priority: L2DEX_PRIORITY.NORMAL }, requestId);
  }

  function startReferencedMotion(reference: string) {
      const selected = motionSelector.selectReference(reference);
      if (!selected) return;

      // start_mtn 指令通常意味着强行打断当前所有，开启一个独立的前景动作
      const requestId = nextRequestId++;
      motionScheduler.isInteractionActive = true;
      void playScheduledMotionItem({ selectedMotion: selected, priority: L2DEX_PRIORITY.FORCE }, requestId);
  }

  function startPresetMotionCycle(groupPrefix: string): boolean {
    assignSlotsAndStart(groupPrefix, L2DEX_PRIORITY.NORMAL);
    return true;
  }

  // --- 工具函数 ---

  function preloadMotion(active: ActiveMotion): void {
    const locator = resolveEngineMotionLocator(active.selectedMotion.reference);
    void modelSettingsBridge.prepareMotionPlayback(locator.group, locator.index, active.selectedMotion.motion);
  }

  function selectPresetCycleFromCursor(groupPrefix: string, priority: number): { cycleGroup?: string; motions: ActiveMotion[] } {
    const groups = presetGroupsByPrefix[groupPrefix] ?? [];
    const familyCursor = presetFamilyCursorByPrefix[groupPrefix] ?? 0;
    const orderedGroups = [...groups.slice(familyCursor), ...groups.slice(0, familyCursor)];

    for (const group of orderedGroups) {
        const references = presetReferencesByGroup[group] ?? [];
        const cycleCursor = presetCycleCursorByGroup[group] ?? 0;
        const orderedRefs = [...references.slice(cycleCursor), ...references.slice(0, cycleCursor)];
        const matches = orderedRefs.map(ref => motionSelector.selectReference(ref)).filter((sel): sel is SelectedMotion => sel !== undefined);
        if (matches.length > 0) return { cycleGroup: group, motions: matches.map(m => ({ selectedMotion: m, priority })) };
    }
    return { motions: [] };
  }

  function resolveEngineMotionLocator(reference: string) {
    const { group, motionName } = parseSelectedMotionReference(reference);
    const index = getModelMotions(modelSettings, group).findIndex(m => m.Name === motionName);
    if (index < 0) throw new Error(`Not found: ${reference}`);
    return { group, index };
  }

  function logMotionStart(ref: string, p: number) { 
    console.log(`${getTimestamp()} Motion: ${ref} | Priority: ${p} | Vars:`, motionVariables.entries()); 
  }
  
  function playSound(path?: string) { if (path) new Audio(path).play().catch(() => {}); }

  function advancePresetCycleCursor(group: string | undefined, ref: string) {
    if (!group) return;
    const refs = presetReferencesByGroup[group] ?? [];
    const idx = refs.indexOf(ref);
    if (idx >= 0) presetCycleCursorByGroup[group] = (idx + 1) % refs.length;
  }

  function advancePresetFamilyCursor(prefix: string | undefined, group: string | undefined) {
    if (!prefix || !group) return;
    const groups = presetGroupsByPrefix[prefix] ?? [];
    const idx = groups.indexOf(group);
    if (idx >= 0) presetFamilyCursorByPrefix[prefix] = (idx + 1) % groups.length;
  }

  function createPresetGroupsByPrefix() {
    const res: Record<string, string[]> = {};
    for (const p of PRESET_MOTION_PREFIXES) res[p] = motionSelector.getPresetGroups(p);
    return res;
  }

  function createPresetReferencesByGroup() {
    const res: Record<string, string[]> = {};
    for (const groups of Object.values(presetGroupsByPrefix)) {
      for (const group of groups) res[group] = getModelMotions(modelSettings, group).map((m, i) => createMotionReference(group, m.Name || String(i)));
    }
    return res;
  }

  function createPresetFamilyCursorByPrefix() { return Object.fromEntries(PRESET_MOTION_PREFIXES.map(p => [p, 0])); }
  function createPresetCycleCursorByGroup() { return Object.fromEntries(Object.values(presetGroupsByPrefix).flat().map(g => [g, 0])); }

  function startDefaultMotionCycle() { startPresetMotionCycle(START_MOTION_PREFIX); resetLeaveTimer(); }
  function notifyUserActivity() { resetLeaveTimer(); }
  function resetLeaveTimer() {
      if (leaveTimer) clearTimeout(leaveTimer);
      const group = motionSelector.getPresetGroups(LEAVE_MOTION_PREFIX)[0];
      if (!group) return;
      const match = group.match(/Leave(\d+)_(\d+)_(\d+)/);
      if (match) leaveTimer = window.setTimeout(() => startPresetMotionCycle(LEAVE_MOTION_PREFIX), Number(match[1]) * 1000);
  }

  function showMotionDialog(motion: MotionItem) {
    const hasContent = !!(motion.Text || (motion.Choices && motion.Choices.length > 0));
    if (!hasContent) return;
    modelDialog.hide();
    modelDialog.showMotion(motion, (choice) => startReferencedMotion(choice.NextMtn));
  }

  return {
    notifyUserActivity,
    startPresetMotionCycle,
    playTouchMotion,
    startDefaultMotionCycle,
    requestIdleMotionCycle() { requestIdleMotion(); },
    startReferencedMotion,
  };
}
