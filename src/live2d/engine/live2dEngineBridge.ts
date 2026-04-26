import { encodeAssetName } from '@/utils/assetEncoding';

import type {
  FileReferences,
  MotionItem,
  Settings,
} from '@/live2d/settings/modelSettings.types';

export {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from 'untitled-pixi-live2d-engine/cubism';

export type EngineModelSettings = Settings & {
  url: string;
  Groups: EngineParameterGroup[];
};

type EngineParameterGroup = {
  Target: 'Parameter';
  Name: 'EyeBlink' | 'LipSync';
  Ids: string[];
};

export type EngineModel = {
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
      setPartOpacityById?: (id: unknown, value: number) => void;
      setParamFloat?: (id: string, value: number, weight?: number) => unknown;
      setPartsOpacity?: (id: string, value: number) => unknown;
    };
    idManager?: {
      getId(id: string): unknown;
    };
    motionManager?: {
      loadMotion?: (
        group: string,
        index: number,
      ) => Promise<{ setLoop?: (loop: boolean) => void } | undefined>;
    };
  };
};

export function createEngineModelSettings(
  settings: Settings,
  modelUrl: string,
): EngineModelSettings {
  return {
    ...settings,
    url: modelUrl,
    FileReferences: createEngineFileReferences(settings.FileReferences),
    Groups: [
      createParameterGroup('EyeBlink', settings.Controllers.EyeBlink.Items),
      createParameterGroup('LipSync', settings.Controllers.LipSync.Items),
    ],
  };
}

export function getModelMotions(
  settings: Settings,
  group: string,
): MotionItem[] {
  const motions = settings.FileReferences.Motions as Partial<
    Record<string, MotionItem[]>
  >;
  return motions[group] ?? [];
}

export function isExecutableModelMotion(motion: MotionItem): boolean {
  return (
    motion.Enabled !== false &&
    (motion.File !== undefined ||
      motion.Command !== undefined ||
      motion.PostCommand !== undefined ||
      motion.MotionDuration !== undefined ||
      motion.VarFloats?.some((variable) => variable.Type === 2))
  );
}

export function setMouseTrackingEnabled(
  model: EngineModel,
  enabled: boolean,
): void {
  if (model.automator) {
    model.automator.autoFocus = enabled;
  }
}

export function setModelParameter(
  model: EngineModel,
  id: string,
  value: number,
  weight?: number,
): void {
  const coreModel = model.internalModel?.coreModel;

  if (coreModel?.setParameterValueById) {
    coreModel.setParameterValueById(getEngineId(model, id), value, weight);
    return;
  }

  coreModel?.setParamFloat?.(id, value, weight);
}

export function setPartOpacity(
  model: EngineModel,
  id: string,
  value: number,
): void {
  const coreModel = model.internalModel?.coreModel;

  if (coreModel?.setPartOpacityById) {
    coreModel.setPartOpacityById(getEngineId(model, id), value);
    return;
  }

  coreModel?.setPartsOpacity?.(id, value);
}

export async function preloadMotion(
  model: EngineModel,
  group: string,
  index: number,
  options: { loop?: boolean } = {},
): Promise<void> {
  const motion = await model.internalModel?.motionManager?.loadMotion?.(
    group,
    index,
  );

  if (options.loop) {
    motion?.setLoop?.(true);
  }
}

function createEngineFileReferences(
  references: FileReferences,
): FileReferences {
  return {
    ...references,
    Moc: encodeModelAssetPath(references.Moc),
    Textures: references.Textures.map(encodeModelAssetPath),
    Physics: encodeModelAssetPath(references.Physics),
    PhysicsV2: {
      ...references.PhysicsV2,
      File: encodeModelAssetPath(references.PhysicsV2.File),
    },
    Motions: Object.fromEntries(
      Object.entries(references.Motions).map(([group, motions]) => [
        group,
        motions.map((motion) => ({
          ...motion,
          File:
            motion.File === undefined
              ? undefined
              : encodeModelAssetPath(motion.File),
          Sound: undefined,
        })),
      ]),
    ),
  };
}

function createParameterGroup(
  name: 'EyeBlink' | 'LipSync',
  items: { Id: string }[],
): EngineParameterGroup {
  return {
    Target: 'Parameter',
    Name: name,
    Ids: items.map(({ Id }) => Id),
  };
}

function encodeModelAssetPath(path: string): string {
  return path.split('/').map(encodeAssetName).join('/');
}

function getEngineId(model: EngineModel, id: string): unknown {
  return model.internalModel?.idManager?.getId(id) ?? id;
}
