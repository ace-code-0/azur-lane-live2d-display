import type { MotionItem, Settings } from './modelSettings';

export const MODEL_ASSET_ALIAS_DIRECTORY = '__safe__';

export function createModelAssetAliasPath(path: string): string {
  return [
    MODEL_ASSET_ALIAS_DIRECTORY,
    ...splitModelAssetPath(path).map(sanitizeModelAssetPathSegment),
  ].join('/');
}

export function sanitizeModelSettingsAssetPaths(settings: Settings): Settings {
  return {
    ...settings,
    FileReferences: {
      ...settings.FileReferences,
      Moc: createModelAssetAliasPath(settings.FileReferences.Moc),
      Textures: settings.FileReferences.Textures.map(createModelAssetAliasPath),
      Physics: createModelAssetAliasPath(settings.FileReferences.Physics),
      PhysicsV2: {
        ...settings.FileReferences.PhysicsV2,
        File: createModelAssetAliasPath(settings.FileReferences.PhysicsV2.File),
      },
      Motions: Object.fromEntries(
        Object.entries(settings.FileReferences.Motions).map(([group, motions]) => [
          group,
          motions.map(sanitizeMotionAssetPaths),
        ]),
      ),
    },
  };
}

export function collectModelAssetPaths(settings: Settings): string[] {
  const assetPaths = new Set<string>([
    settings.FileReferences.Moc,
    ...settings.FileReferences.Textures,
    settings.FileReferences.Physics,
    settings.FileReferences.PhysicsV2.File,
  ]);

  for (const motions of Object.values(settings.FileReferences.Motions)) {
    for (const motion of motions) {
      if (motion.File) {
        assetPaths.add(motion.File);
      }

      if (motion.Sound) {
        assetPaths.add(motion.Sound);
      }
    }
  }

  return [...assetPaths];
}

function sanitizeMotionAssetPaths(motion: MotionItem): MotionItem {
  return {
    ...motion,
    File:
      motion.File === undefined
        ? undefined
        : createModelAssetAliasPath(motion.File),
    Sound:
      motion.Sound === undefined
        ? undefined
        : createModelAssetAliasPath(motion.Sound),
  };
}

function splitModelAssetPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function sanitizeModelAssetPathSegment(segment: string): string {
  return Array.from(segment)
    .map((character) =>
      /^[A-Za-z0-9._-]$/.test(character)
        ? character
        : `_u${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`,
    )
    .join('');
}
