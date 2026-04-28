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
import type { Live2DModel } from 'untitled-pixi-live2d-engine/cubism';

type EngineModel = Live2DModel & {
  automator?: {
    autoFocus?: boolean;
  };
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (
        engineParameterId: unknown,
        value: number,
        weight?: number,
      ) => void;
      setParamFloat?: (
        parameterId: string,
        value: number,
        weight?: number,
      ) => unknown;
    };
    idManager?: {
      getId(parameterId: string): unknown;
    };
    motionManager?: {
      loadMotion?: (
        group: string,
        index: number,
      ) => Promise<unknown>;
      on?: (event: 'motionFinish', listener: () => void) => void;
    };
  };
};

type EngineMotion = {
  setLoop?: (loop: boolean) => void;
};

export type MotionRuntimeOptions = {
  onForegroundDone?: () => void;
};

export type RuntimePlayOptions = {
  foreground?: boolean;
};

export class MotionRuntime {
  private foregroundMotion: PlannedMotion | undefined;
  private currentCommandAudio: HTMLAudioElement | undefined;
  private readonly lockedParameters = new Map<string, number>();

  constructor(
    private readonly model: EngineModel,
    private readonly settings: Settings,
    private readonly variables: ModelVariableStore,
    private readonly options: MotionRuntimeOptions = {},
  ) {
    this.model.internalModel?.motionManager?.on?.('motionFinish', () => {
      console.log('Motion finished');
      this.finishForegroundMotion();
    });
  }

  async play(plan: MotionPlan, options: RuntimePlayOptions = {}): Promise<void> {
    if (plan.kind === 'none') {
      return;
    }

    const foreground = options.foreground ?? true;

    if (plan.kind === 'single') {
      await this.playMotion(plan.motion, foreground);
      return;
    }

    await this.playParallel(plan.motions, foreground);
  }

  async playReferencedMotion(
    reference: string,
    priority: MotionPriorityName = 'NORMAL',
    options: RuntimePlayOptions = {},
  ): Promise<void> {
    const plan = selectSingleMotion(
      this.settings,
      this.variables,
      parseMotionReference(reference),
      priority,
    );

    await this.play(plan, options);
  }

  applyLockedParameters(): void {
    for (const [parameterId, value] of this.lockedParameters) {
      this.setModelParameter(parameterId, value);
    }
  }

  private async playParallel(
    motions: PlannedMotion[],
    foreground: boolean,
  ): Promise<void> {
    const baseMotions = motions.filter((motion) => getMotionLayer(motion) === 0);
    const layeredMotions = motions.filter((motion) => getMotionLayer(motion) > 0);

    for (const motion of baseMotions) {
      await this.playMotion(motion, foreground);
    }

    if (layeredMotions.length > 0) {
      await Promise.all(
        layeredMotions.map((motion) => this.applyMotionLoopSetting(motion)),
      );

      const results = await this.model.parallelMotion(
        layeredMotions.map((motion) => ({
          group: motion.group,
          index: motion.index,
          priority: toEnginePriority(motion.priority) as never,
        })),
      );

      for (let index = 0; index < layeredMotions.length; index += 1) {
        if (results[index]) {
          this.applyMotionStartEffects(layeredMotions[index]);
          this.playCommandSound(layeredMotions[index].motion.Sound);
        }
      }
    }
  }

  private async playMotion(
    motion: PlannedMotion,
    foreground: boolean,
  ): Promise<void> {
    if (!motion.motion.File) {
      this.applyMotionStartEffects(motion);
      this.playCommandSound(motion.motion.Sound);
      this.scheduleCommandOnlyMotionFinish(motion, foreground);
      return;
    }

    const layer = getMotionLayer(motion);

    if (layer > 0) {
      await this.applyMotionLoopSetting(motion);

      const [accepted] = await this.model.parallelMotion([
        {
          group: motion.group,
          index: motion.index,
          priority: toEnginePriority(motion.priority) as never,
        },
      ]);

      if (accepted) {
        this.applyMotionStartEffects(motion);
        this.playCommandSound(motion.motion.Sound);
      }

      return;
    }

    await this.applyMotionLoopSetting(motion);

    const accepted = await this.model.motion(
      motion.group,
      motion.index,
      toEnginePriority(motion.priority) as never,
      this.createMotionSoundOptions(motion),
    );

    if (!accepted) {
      return;
    }

    if (foreground && motion.priority !== 'IDLE') {
      this.foregroundMotion = motion;
    }

    this.applyMotionStartEffects(motion);
  }

  private applyMotionStartEffects(motion: PlannedMotion): void {
    executeModelCommands(motion.motion.Command, {
      setMouseTrackingEnabled: (enabled) => {
        if (this.model.automator) {
          this.model.automator.autoFocus = enabled;
        }
      },
      setParameter: (parameterId, value) =>
        this.setModelParameter(parameterId, value),
      lockParameter: (parameterId, value = 0) => {
        this.lockedParameters.set(parameterId, value);
        this.setModelParameter(parameterId, value);
      },
      unlockParameter: (parameterId) => {
        this.lockedParameters.delete(parameterId);
      },
      startMotion: (reference) => {
        void this.playReferencedMotion(reference, 'NORMAL', {
          foreground: false,
        });
      },
    });
    this.variables.applyAssignments(motion.motion);
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

  private scheduleCommandOnlyMotionFinish(
    motion: PlannedMotion,
    foreground: boolean,
  ): void {
    if (foreground && motion.priority !== 'IDLE') {
      this.foregroundMotion = motion;
      window.setTimeout(
        () => this.finishForegroundMotion(),
        Math.max(motion.motion.MotionDuration ?? 0, 0),
      );
      return;
    }

    window.setTimeout(
      () => this.applyMotionPostEffects(motion),
      Math.max(motion.motion.MotionDuration ?? 0, 0),
    );
  }

  private applyMotionPostEffects(motion: PlannedMotion): void {
    executeModelCommands(motion.motion.PostCommand, {
      setParameter: (parameterId, value) =>
        this.setModelParameter(parameterId, value),
      lockParameter: (parameterId, value = 0) => {
        this.lockedParameters.set(parameterId, value);
        this.setModelParameter(parameterId, value);
      },
      unlockParameter: (parameterId) => {
        this.lockedParameters.delete(parameterId);
      },
      startMotion: (reference) => {
        void this.playReferencedMotion(reference, 'NORMAL', {
          foreground: false,
        });
      },
    });
  }

  private setModelParameter(parameterId: string, value: number): void {
    const coreModel = this.model.internalModel?.coreModel;
    const engineId =
      this.model.internalModel?.idManager?.getId(parameterId) ?? parameterId;

    if (coreModel?.setParameterValueById) {
      coreModel.setParameterValueById(engineId, value);
      return;
    }

    coreModel?.setParamFloat?.(parameterId, value);
  }

  private createMotionSoundOptions(
    motion: PlannedMotion,
  ): { sound?: string } | undefined {
    return motion.motion.Sound
      ? { sound: this.resolveSoundPath(motion.motion.Sound) }
      : undefined;
  }

  private playCommandSound(path?: string): void {
    if (!path) {
      return;
    }

    this.currentCommandAudio?.pause();
    this.currentCommandAudio = new Audio(this.resolveSoundPath(path));
    this.currentCommandAudio.play().catch(() => {});
  }

  private resolveSoundPath(path: string): string {
    return `/model/${path}`;
  }

  private async applyMotionLoopSetting(motion: PlannedMotion): Promise<void> {
    if (motion.motion.FileLoop !== true) {
      return;
    }

    const engineMotion = await this.model.internalModel?.motionManager?.loadMotion?.(
      motion.group,
      motion.index,
    );

    if (!isEngineMotion(engineMotion)) {
      return;
    }

    engineMotion.setLoop?.(true);
  }
}

function isEngineMotion(value: unknown): value is EngineMotion {
  return typeof value === 'object' && value !== null;
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
