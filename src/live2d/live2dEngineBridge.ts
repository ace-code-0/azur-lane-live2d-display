export {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from 'untitled-pixi-live2d-engine/cubism';

import type { Cubism4Model } from './model';
import type { FileReferences, MotionItem, Settings } from './modelSettings';

export type ModelSettingsBridge = {
  applyInitialSettings(): void;
  applyMotionCommand(motion: MotionItem): void;
  applyMotionPostCommand(motion: MotionItem): void;
  prepareMotionPlayback(
    group: string,
    index: number,
    motion: MotionItem,
  ): Promise<void>;
};

export type EngineModelSettings = Settings & {
  url: string;
  Groups: {
    Target: 'Parameter';
    Name: 'EyeBlink' | 'LipSync';
    Ids: string[];
  }[];
};

type BridgeCallbacks = {
  startReferencedMotion(reference: string): void;
};

type CoreModelAdapter = {
  setParamFloat?: (id: string, value: number, weight?: number) => unknown;
  setPartsOpacity?: (id: string, value: number) => unknown;
  setParameterValueById?: (id: unknown, value: number, weight?: number) => void;
  setPartOpacityById?: (id: unknown, value: number) => void;
};

type InternalModelAdapter = {
  coreModel?: CoreModelAdapter;
  idManager?: {
    getId(id: string): unknown;
  };
  motionManager?: {
    loadMotion?: (
      group: string,
      index: number,
    ) => Promise<MotionPlaybackAdapter | undefined>;
  };
  on(event: 'beforeModelUpdate', listener: () => void): void;
};

type AutomatorAdapter = {
  autoFocus?: boolean;
};

type MotionPlaybackAdapter = {
  setLoop?: (loop: boolean) => void;
};

type PersistedCommandState = {
  mouseTrackingEnabled?: boolean;
  parameterLocks: Record<string, number>;
  parameterValues: Record<string, number>;
};

const COMMAND_STATE_STORAGE_KEY = 'live2d.commandState';

export function getModelMotions(
  settings: Settings,
  group: string,
): MotionItem[] {
  const motions = settings.FileReferences.Motions as Partial<
    Record<string, MotionItem[]>
  >;
  const groupMotions = motions[group];

  if (!groupMotions) {
    throw new Error(`Motion group not found in model settings: ${group}`);
  }

  return groupMotions;
}

export function createEngineModelSettings(
  settings: Settings,
  modelUrl: string,
): EngineModelSettings {
  return {
    ...settings,
    FileReferences: createEngineFileReferences(settings),
    url: modelUrl,
    Groups: [
      {
        Target: 'Parameter',
        Name: 'EyeBlink',
        Ids: settings.Controllers.EyeBlink.Items.map(({ Id }) => Id),
      },
      {
        Target: 'Parameter',
        Name: 'LipSync',
        Ids: settings.Controllers.LipSync.Items.map(({ Id }) => Id),
      },
    ],
  };
}

export function isExecutableModelMotion(motion: MotionItem): boolean {
  return (
    isEnabledModelMotion(motion) &&
    (motion.File !== undefined ||
      motion.Command !== undefined ||
      motion.PostCommand !== undefined ||
      motion.MotionDuration !== undefined ||
      (motion.VarFloats?.some(({ Type }) => Type === 2) ?? false))
  );
}

export function isEnabledModelMotion(motion: MotionItem): boolean {
  return motion.Enabled !== false;
}

function createEngineFileReferences(settings: Settings): FileReferences {
  const { FileReferences } = settings;

  return {
    ...FileReferences,
    Moc: encodeModelFilePath(FileReferences.Moc),
    Textures: FileReferences.Textures.map(encodeModelFilePath),
    Physics: encodeModelFilePath(FileReferences.Physics),
    PhysicsV2: {
      ...FileReferences.PhysicsV2,
      File: encodeModelFilePath(FileReferences.PhysicsV2.File),
    },
    Motions: Object.fromEntries(
      Object.entries(FileReferences.Motions).map(([group, motions]) => [
        group,
        motions.map((motion) => ({
          ...motion,
          File:
            motion.File === undefined
              ? undefined
              : encodeModelFilePath(motion.File),
          Sound:
            motion.Sound === undefined
              ? undefined
              : encodeModelFilePath(motion.Sound),
        })),
      ]),
    ),
  };
}

function encodeModelFilePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function createModelSettingsBridge(
  model: Cubism4Model,
  settings: Settings,
  callbacks: BridgeCallbacks,
): ModelSettingsBridge {
  const parameterLocks = new Map<string, number>();
  const parameterValues = new Map<string, number>();
  const persistedCommandState = restoreCommandState();

  const internalModel = getInternalModel(model);
  internalModel.on('beforeModelUpdate', () => {
    for (const [id, value] of parameterLocks) {
      setModelParameter(model, id, value);
    }
  });

  function applyCommand(command: string | undefined): void {
    for (const statement of splitCommand(command)) {
      const [namespace, action, target, rawValue] = statement.split(/\s+/, 4);

      if (namespace === 'mouse_tracking') {
        const enabled = action === 'enable';
        setMouseTrackingEnabled(model, enabled);
        persistedCommandState.mouseTrackingEnabled = enabled;
        persistCommandState();
        continue;
      }

      if (namespace === 'parameters') {
        applyParameterCommand(action, target, rawValue);
        continue;
      }

      if (namespace === 'start_mtn') {
        callbacks.startReferencedMotion(action);
        continue;
      }

      throw new Error(`Unsupported model command: ${statement}`);
    }
  }

  function applyParameterCommand(
    action: string | undefined,
    target: string | undefined,
    rawValue: string | undefined,
  ): void {
    if (!target) {
      throw new Error(`Missing parameter target for command: ${action}`);
    }

    if (action === 'unlock') {
      parameterLocks.delete(target);
      delete persistedCommandState.parameterLocks[target];
      persistCommandState();
      return;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      throw new Error(`Invalid parameter value for ${target}: ${rawValue}`);
    }

    if (action === 'lock') {
      parameterLocks.set(target, value);
      persistedCommandState.parameterLocks[target] = value;
      setModelParameter(model, target, value);
      persistCommandState();
      return;
    }

    if (action === 'set') {
      parameterValues.set(target, value);
      persistedCommandState.parameterValues[target] = value;
      setModelParameter(model, target, value);
      persistCommandState();
      return;
    }

    throw new Error(`Unsupported parameter command: ${action}`);
  }

  return {
    applyInitialSettings(): void {
      setMouseTrackingEnabled(
        model,
        persistedCommandState.mouseTrackingEnabled ??
          settings.Controllers.MouseTracking.Enabled,
      );

      for (const [id, value] of Object.entries(persistedCommandState.parameterValues)) {
        parameterValues.set(id, value);
        setModelParameter(model, id, value);
      }

      for (const [id, value] of Object.entries(persistedCommandState.parameterLocks)) {
        parameterLocks.set(id, value);
        setModelParameter(model, id, value);
      }

      applyPartOpacitySettings(model, settings);
    },

    applyMotionCommand(motion: MotionItem): void {
      applyCommand(motion.Command);
    },

    applyMotionPostCommand(motion: MotionItem): void {
      applyCommand(motion.PostCommand);
    },

    async prepareMotionPlayback(
      group: string,
      index: number,
      motion: MotionItem,
    ): Promise<void> {
      if (!motion.FileLoop) {
        return;
      }

      const loadedMotion = await internalModel.motionManager
        ?.loadMotion?.(group, index)
        .catch(() => undefined);

      loadedMotion?.setLoop?.(true);
    },
  };

  function persistCommandState(): void {
    try {
      window.localStorage.setItem(
        COMMAND_STATE_STORAGE_KEY,
        JSON.stringify({
          mouseTrackingEnabled: persistedCommandState.mouseTrackingEnabled,
          parameterLocks: Object.fromEntries(parameterLocks),
          parameterValues: Object.fromEntries(parameterValues),
        } satisfies PersistedCommandState),
      );
    } catch (error) {
      console.warn('[live2d-motion] failed to persist command state', error);
    }
  }

  function restoreCommandState(): PersistedCommandState {
    try {
      const stored = window.localStorage.getItem(COMMAND_STATE_STORAGE_KEY);

      if (!stored) {
        return { parameterLocks: {}, parameterValues: {} };
      }

      const parsed = JSON.parse(stored) as Partial<PersistedCommandState>;

      return {
        mouseTrackingEnabled:
          typeof parsed.mouseTrackingEnabled === 'boolean'
            ? parsed.mouseTrackingEnabled
            : undefined,
        parameterLocks: coerceNumberRecord(parsed.parameterLocks),
        parameterValues: coerceNumberRecord(parsed.parameterValues),
      };
    } catch (error) {
      console.warn('[live2d-motion] failed to restore command state', error);

      return { parameterLocks: {}, parameterValues: {} };
    }
  }
}

export function setMouseTrackingEnabled(
  model: Cubism4Model,
  enabled: boolean,
): void {
  (model.automator as AutomatorAdapter).autoFocus = enabled;
}

function applyPartOpacitySettings(
  model: Cubism4Model,
  settings: Settings,
): void {
  if (!settings.Controllers.PartOpacity.Enabled) {
    return;
  }

  for (const item of settings.Controllers.PartOpacity.Items) {
    for (const id of item.Ids) {
      setPartOpacity(model, id, item.Value);
    }
  }
}

function splitCommand(command: string | undefined): string[] {
  return (
    command
      ?.split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0) ?? []
  );
}

function coerceNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) =>
      typeof entryValue === 'number' ? [[key, entryValue]] : [],
    ),
  );
}

export function setModelParameter(
  model: Cubism4Model,
  id: string,
  value: number,
): void {
  const { coreModel } = getInternalModel(model);

  if (coreModel?.setParameterValueById) {
    coreModel.setParameterValueById(getEngineId(model, id), value);
    return;
  }

  if (coreModel?.setParamFloat) {
    coreModel.setParamFloat(id, value);
    return;
  }

  throw new Error(`Live2D core model cannot set parameter: ${id}`);
}

function setPartOpacity(
  model: Cubism4Model,
  id: string,
  value: number,
): void {
  const { coreModel } = getInternalModel(model);

  if (coreModel?.setPartOpacityById) {
    coreModel.setPartOpacityById(getEngineId(model, id), value);
    return;
  }

  if (coreModel?.setPartsOpacity) {
    coreModel.setPartsOpacity(id, value);
    return;
  }

  throw new Error(`Live2D core model cannot set part opacity: ${id}`);
}

function getEngineId(model: Cubism4Model, id: string): unknown {
  return getInternalModel(model).idManager?.getId(id) ?? id;
}

function getInternalModel(model: Cubism4Model): InternalModelAdapter {
  const internalModel = model.internalModel as InternalModelAdapter | undefined;

  if (!internalModel) {
    throw new Error('Live2D internal model is not ready');
  }

  return internalModel;
}
