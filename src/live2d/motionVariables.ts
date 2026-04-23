import type { MotionItem, Settings } from './modelSettings';

const STORAGE_KEY = 'live2d.motionVariables';

export class MotionVariableStore {
  private readonly values: Map<string, number>;

  constructor(settings: Settings) {
    this.values = new Map(
      collectVariableNames(settings).map((name) => [name, 0]),
    );
    this.restore();
  }

  entries(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  matches(motion: MotionItem): boolean {
    return (
      motion.VarFloats?.every((variable) => {
        if (variable.Type !== 1) {
          return true;
        }

        const expectedValue = parseVariableCode(variable.Code, 'equal');

        return (
          expectedValue === undefined ||
          (this.values.get(variable.Name) ?? 0) === expectedValue
        );
      }) ?? true
    );
  }

  applyAssignments(motion: MotionItem): void {
    let changed = false;

    for (const variable of motion.VarFloats ?? []) {
      if (variable.Type !== 2) {
        continue;
      }

      const value = parseVariableCode(variable.Code, 'assign');

      if (value !== undefined) {
        this.values.set(variable.Name, value);
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }

  private restore(): void {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        return;
      }

      const values = JSON.parse(stored) as Record<string, unknown>;

      for (const [name, value] of Object.entries(values)) {
        if (this.values.has(name) && typeof value === 'number') {
          this.values.set(name, value);
        }
      }
    } catch (error) {
      console.warn('[live2d-motion] failed to restore variables', error);
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries()));
    } catch (error) {
      console.warn('[live2d-motion] failed to persist variables', error);
    }
  }
}

function collectVariableNames(settings: Settings): string[] {
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

function parseVariableCode(
  code: string,
  operator: 'assign' | 'equal',
): number | undefined {
  const [actualOperator, value] = code.trim().split(/\s+/, 2);

  if (actualOperator !== operator || value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
