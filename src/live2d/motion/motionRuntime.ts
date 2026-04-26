import {
  parseMotionReference,
  parseMotionLayerReference,
} from '@/live2d/motion/motionReference';
import {
  selectSingleMotion,
  type MotionPlan,
  type MotionPriorityName,
  type PlannedMotion,
} from '@/live2d/motion/motionPlanner';
import { executeModelCommands } from '@/live2d/runtime/modelCommands';
import type { ModelVariableStore } from '@/live2d/runtime/modelVariables';
import type { Settings } from '@/live2d/settings/modelSettings.types';
import type { Live2DModel } from 'untitled-pixi-live2d-engine';

type EngineModel = Live2DModel & {
  automator?: {
    autoFocus?: boolean;
  };
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (
        id: unknown,
        value: number,
        weight?: number,
      ) => void;
      setParamFloat?: (id: string, value: number, weight?: number) => unknown;
    };
    idManager?: {
      getId(id: string): unknown;
    };
    motionManager?: {
      on?: (event: 'motionFinish', listener: () => void) => void;
    };
  };
};

export type MotionRuntimeOptions = {
  onForegroundDone?: () => void;
};

export class MotionRuntime {
  private foregroundMotion: PlannedMotion | undefined;
  private readonly lockedParameters = new Map<string, number>();

  constructor(
    private readonly model: EngineModel,
    private readonly settings: Settings,
    private readonly variables: ModelVariableStore,
    private readonly options: MotionRuntimeOptions = {},
  ) {
    this.model.internalModel?.motionManager?.on?.('motionFinish', () => {
      this.finishForegroundMotion();
    });
  }

  async play(plan: MotionPlan): Promise<void> {
    if (plan.kind === 'none') {
      return;
    }

    if (plan.kind === 'single') {
      await this.playMotion(plan.motion);
      return;
    }

    await this.playParallel(plan.motions);
  }

  async playReferencedMotion(
    reference: string,
    priority: MotionPriorityName = 'NORMAL',
  ): Promise<void> {
    const plan = selectSingleMotion(
      this.settings,
      this.variables,
      parseMotionReference(reference),
      priority,
    );

    await this.play(plan);
  }

  applyLockedParameters(): void {
    for (const [id, value] of this.lockedParameters) {
      this.setModelParameter(id, value);
    }
  }

  private async playParallel(motions: PlannedMotion[]): Promise<void> {
    const baseMotions = motions.filter((motion) => getMotionLayer(motion) === 0);
    const layeredMotions = motions.filter((motion) => getMotionLayer(motion) > 0);

    for (const motion of baseMotions) {
      await this.playMotion(motion);
    }

    if (layeredMotions.length > 0) {
      await this.model.parallelMotion(
        layeredMotions.map((motion) => ({
          group: motion.group,
          index: motion.index,
          priority: toEnginePriority(motion.priority) as never,
        })),
      );

      for (const motion of layeredMotions) {
        this.applyMotionStartEffects(motion);
      }
    }
  }

  private async playMotion(motion: PlannedMotion): Promise<void> {
    this.applyMotionStartEffects(motion);

    if (!motion.motion.File) {
      this.scheduleCommandOnlyMotionFinish(motion);
      return;
    }

    const layer = getMotionLayer(motion);

    if (layer > 0) {
      await this.model.parallelMotion([
        {
          group: motion.group,
          index: motion.index,
          priority: toEnginePriority(motion.priority) as never,
        },
      ]);
      return;
    }

    if (motion.priority !== 'IDLE') {
      this.foregroundMotion = motion;
    }

    await this.model.motion(
      motion.group,
      motion.index,
      toEnginePriority(motion.priority) as never,
    );
  }

  private applyMotionStartEffects(motion: PlannedMotion): void {
    executeModelCommands(motion.motion.Command, {
      setMouseTrackingEnabled: (enabled) => {
        if (this.model.automator) {
          this.model.automator.autoFocus = enabled;
        }
      },
      setParameter: (id, value) => this.setModelParameter(id, value),
      lockParameter: (id, value = 0) => {
        this.lockedParameters.set(id, value);
        this.setModelParameter(id, value);
      },
      unlockParameter: (id) => {
        this.lockedParameters.delete(id);
      },
      startMotion: (reference) => {
        void this.playReferencedMotion(reference, 'NORMAL');
      },
    });
    this.variables.applyAssignments(motion.motion);
    this.playSound(motion.motion.Sound);
  }

  private finishForegroundMotion(): void {
    const motion = this.foregroundMotion;

    if (!motion) {
      return;
    }

    this.foregroundMotion = undefined;
    this.applyMotionPostEffects(motion);
    this.options.onForegroundDone?.();
  }

  private scheduleCommandOnlyMotionFinish(motion: PlannedMotion): void {
    if (motion.priority !== 'IDLE') {
      this.foregroundMotion = motion;
    }

    window.setTimeout(
      () => this.finishForegroundMotion(),
      Math.max(motion.motion.MotionDuration ?? 0, 0),
    );
  }

  private applyMotionPostEffects(motion: PlannedMotion): void {
    executeModelCommands(motion.motion.PostCommand, {
      setParameter: (id, value) => this.setModelParameter(id, value),
      lockParameter: (id, value = 0) => {
        this.lockedParameters.set(id, value);
        this.setModelParameter(id, value);
      },
      unlockParameter: (id) => {
        this.lockedParameters.delete(id);
      },
      startMotion: (reference) => {
        void this.playReferencedMotion(reference, 'NORMAL');
      },
    });
  }

  private setModelParameter(id: string, value: number): void {
    const coreModel = this.model.internalModel?.coreModel;
    const engineId = this.model.internalModel?.idManager?.getId(id) ?? id;

    if (coreModel?.setParameterValueById) {
      coreModel.setParameterValueById(engineId, value);
      return;
    }

    coreModel?.setParamFloat?.(id, value);
  }

  private playSound(path?: string): void {
    if (!path) {
      return;
    }

    new Audio(`/model/${path}`).play().catch(() => {});
  }
}

function getMotionLayer(motion: PlannedMotion): number {
  return parseMotionLayerReference({ group: motion.group }).layer;
}

function toEnginePriority(priority: MotionPriorityName): number {
  if (priority === 'FORCE') {
    return 3;
  }

  if (priority === 'NORMAL') {
    return 2;
  }

  return 1;
}
