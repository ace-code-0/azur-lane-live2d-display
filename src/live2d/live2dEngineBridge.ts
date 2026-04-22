export {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from 'untitled-pixi-live2d-engine/cubism';

import type { Cubism4Model } from './model';
import type { ModelMotion, ModelSettings } from './modelSettings';

export type ModelSettingsBridge = {
  applyInitialSettings(): void;
  applyMotionCommand(motion: ModelMotion): void;
  applyMotionPostCommand(motion: ModelMotion): void;
};

export type EngineModelSettings = ModelSettings & {
  url: string;
  Groups: {
    Target: 'Parameter';
    Name: 'EyeBlink' | 'LipSync';
    Ids: string[];
  }[];
};

type BridgeCallbacks = {
  startMotion(reference: string): void;
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
  on(event: 'beforeModelUpdate', listener: () => void): void;
};

type AutomatorAdapter = {
  autoFocus?: boolean;
};

export function getModelMotions(
  settings: ModelSettings,
  group: string,
): ModelMotion[] {
  const motions = settings.FileReferences.Motions as Partial<
    Record<string, ModelMotion[]>
  >;
  const groupMotions = motions[group];

  if (!groupMotions) {
    throw new Error(`Motion group not found in model settings: ${group}`);
  }

  return groupMotions;
}

export function createEngineModelSettings(
  settings: ModelSettings,
  modelUrl: string,
): EngineModelSettings {
  return {
    ...settings,
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

export function isExecutableModelMotion(motion: ModelMotion): boolean {
  return (
    motion.File !== undefined ||
    motion.Command !== undefined ||
    motion.PostCommand !== undefined ||
    motion.MotionDuration !== undefined ||
    (motion.VarFloats?.some(({ Type }) => Type === 2) ?? false)
  );
}

export function createModelSettingsBridge(
  model: Cubism4Model,
  settings: ModelSettings,
  callbacks: BridgeCallbacks,
): ModelSettingsBridge {
  const parameterLocks = new Map<string, number>();

  const internalModel = getInternalModel(model);
  internalModel.on('beforeModelUpdate', () => {
    for (const [id, value] of parameterLocks) {
      setParameter(model, id, value);
    }
  });

  function applyCommand(command: string | undefined): void {
    for (const statement of splitCommand(command)) {
      const [namespace, action, target, rawValue] = statement.split(/\s+/, 4);

      if (namespace === 'mouse_tracking') {
        setMouseTrackingEnabled(model, action === 'enable');
        continue;
      }

      if (namespace === 'parameters') {
        applyParameterCommand(action, target, rawValue);
        continue;
      }

      if (namespace === 'start_mtn') {
        callbacks.startMotion(action);
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
      return;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      throw new Error(`Invalid parameter value for ${target}: ${rawValue}`);
    }

    if (action === 'lock') {
      parameterLocks.set(target, value);
      setParameter(model, target, value);
      return;
    }

    if (action === 'set') {
      setParameter(model, target, value);
      return;
    }

    throw new Error(`Unsupported parameter command: ${action}`);
  }

  return {
    applyInitialSettings(): void {
      setMouseTrackingEnabled(model, settings.Controllers.MouseTracking.Enabled);
      applyPartOpacitySettings(model, settings);
    },

    applyMotionCommand(motion: ModelMotion): void {
      applyCommand(motion.Command);
    },

    applyMotionPostCommand(motion: ModelMotion): void {
      applyCommand(motion.PostCommand);
    },
  };
}

export function setMouseTrackingEnabled(
  model: Cubism4Model,
  enabled: boolean,
): void {
  (model.automator as AutomatorAdapter).autoFocus = enabled;
}

function applyPartOpacitySettings(
  model: Cubism4Model,
  settings: ModelSettings,
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

function setParameter(
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
