import { encodeAssetName } from '../utils/assetEncoding';
import type { MotionItem, Settings } from './modelSettings';

/**
 * 将原始资产路径转换为编码后的安全别名路径
 */
export function createModelAssetAliasPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeAssetName)
    .join('/');
}

export function sanitizeModelSettingsAssetPaths(settings: Settings): Settings {
  const FileReferences = settings.FileReferences;
  return {
    ...settings,
    FileReferences: {
      ...FileReferences,
      Moc: createModelAssetAliasPath(FileReferences.Moc),
      Textures: FileReferences.Textures.map(createModelAssetAliasPath),
      Physics: createModelAssetAliasPath(FileReferences.Physics),
      PhysicsV2: {
        ...FileReferences.PhysicsV2,
        File: createModelAssetAliasPath(FileReferences.PhysicsV2.File),
      },
      Motions: Object.fromEntries(
        Object.entries(FileReferences.Motions).map(([group, motions]) => [
          group,
          motions.map(sanitizeMotionAssetPaths),
        ]),
      ),
    },
  };
}

export function collectModelAssetPaths(settings: Settings): string[] {
  const { FileReferences } = settings;
  const assetPaths = new Set<string>([
    FileReferences.Moc,
    ...FileReferences.Textures,
    FileReferences.Physics,
    FileReferences.PhysicsV2.File,
  ]);

  for (const motions of Object.values(FileReferences.Motions)) {
    for (const motion of motions) {
      if (motion.File) assetPaths.add(motion.File);
      if (motion.Sound) assetPaths.add(motion.Sound);
    }
  }

  return [...assetPaths];
}

function sanitizeMotionAssetPaths(motion: MotionItem): MotionItem {
  return {
    ...motion,
    File: motion.File ? createModelAssetAliasPath(motion.File) : undefined,
    Sound: motion.Sound ? createModelAssetAliasPath(motion.Sound) : undefined,
  };
}
