import type { Settings } from './modelSettings.types';

const modelAssetPathPattern =
  /\.(?:moc3?|png|jpe?g|webp|json|wav|mp3|ogg)$/i;

export async function loadModelSettings(modelUrl: string): Promise<Settings> {
  const response = await fetch(modelUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model settings: ${response.status}`);
  }

  return escapeModelAssetPaths((await response.json()) as Settings);
}

function escapeModelAssetPaths(settings: Settings): Settings {
  return escapeAssetPathValues(settings);
}

function escapeAssetPathValues<T>(value: T): T {
  if (typeof value === 'string') {
    return (modelAssetPathPattern.test(value) ? createEscapedPath(value) : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(escapeAssetPathValues) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, escapeAssetPathValues(entry)]),
    ) as T;
  }

  return value;
}

function createEscapedPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(escapePathSegment)
    .join('/');
}

function escapePathSegment(input: string): string {
  let out = '';

  for (const ch of input) {
    if (/[A-Za-z0-9._\-]/.test(ch)) {
      out += ch;
      continue;
    }

    const hex = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    out += `ascii__${hex}`;
  }

  return out;
}
