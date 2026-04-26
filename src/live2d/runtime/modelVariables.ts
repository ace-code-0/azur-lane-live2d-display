import type {
  MotionItem,
  Settings,
  VarFloats,
} from '@/live2d/settings/modelSettings.types';

const storageKeyPrefix = 'azur-lane-live2d:model-var:';

export type ModelVariableStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type ModelVariableStore = {
  initialize(defaultValue?: number): void;
  entries(): Record<string, number>;
  get(name: string): number;
  set(name: string, value: number): void;
  reset(name: string): void;
  matches(motion: MotionItem): boolean;
  applyAssignments(motion: MotionItem): void;
};

export function initializeModelVarFloats(settings: Settings): void {
  createModelVariableStore(settings).initialize(0);
}

export function createModelVariableStore(
  settings: Settings,
  storage: ModelVariableStorage = localStorage,
): ModelVariableStore {
  const names = collectModelVariableNames(settings);

  return {
    initialize(defaultValue = 0): void {
      for (const name of names) {
        if (storage.getItem(createStorageKey(name)) === null) {
          storage.setItem(createStorageKey(name), String(defaultValue));
        }
      }
    },

    entries(): Record<string, number> {
      return Object.fromEntries(names.map((name) => [name, readValue(storage, name)]));
    },

    get(name: string): number {
      return readValue(storage, name);
    },

    set(name: string, value: number): void {
      storage.setItem(createStorageKey(name), String(value));
    },

    reset(name: string): void {
      storage.removeItem(createStorageKey(name));
    },

    matches(motion: MotionItem): boolean {
      return matchesVarFloats(motion.VarFloats ?? [], (name) =>
        readValue(storage, name),
      );
    },

    applyAssignments(motion: MotionItem): void {
      applyVarFloatAssignments(motion.VarFloats ?? [], (name, value) => {
        storage.setItem(createStorageKey(name), String(value));
      });
    },
  };
}

export function collectModelVariableNames(settings: Settings): string[] {
  const names = new Set<string>();

  for (const motions of Object.values(settings.FileReferences.Motions)) {
    for (const motion of motions) {
      for (const variable of motion.VarFloats ?? []) {
        names.add(variable.Name);
      }
    }
  }

  return [...names];
}

export function matchesVarFloats(
  variables: VarFloats[],
  readValueByName: (name: string) => number,
): boolean {
  return variables.every((variable) => {
    if (variable.Type !== 1) {
      return true;
    }

    const expectedValue = parseVarFloatCode(variable.Code, 'equal');

    return (
      expectedValue === undefined ||
      readValueByName(variable.Name) === expectedValue
    );
  });
}

export function applyVarFloatAssignments(
  variables: VarFloats[],
  writeValueByName: (name: string, value: number) => void,
): void {
  for (const variable of variables) {
    if (variable.Type !== 2) {
      continue;
    }

    const value = parseVarFloatCode(variable.Code, 'assign');

    if (value !== undefined) {
      writeValueByName(variable.Name, value);
    }
  }
}

export function parseVarFloatCode(
  code: string,
  operator: 'assign' | 'equal',
): number | undefined {
  const [actualOperator, rawValue] = code.trim().split(/\s+/, 2);

  if (rawValue !== undefined && actualOperator !== operator) {
    return undefined;
  }

  const parsedValue = Number(rawValue ?? actualOperator);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function readValue(storage: ModelVariableStorage, name: string): number {
  const storedValue = storage.getItem(createStorageKey(name));
  const value = storedValue === null ? 0 : Number(storedValue);

  return Number.isFinite(value) ? value : 0;
}

function createStorageKey(name: string): string {
  return `${storageKeyPrefix}${name}`;
}
