import type {
  MotionItem,
  Settings,
  VarFloats,
} from '@/live2d/settings/modelSettings.types';

/**
 * 获取当前格式化时间戳 [HH:mm:ss]
 */
export function getTimestamp(): string {
  const now = new Date();
  return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
}

export class MotionVariableStore {
  private readonly values: Map<string, number>;

  constructor(settings: Settings) {
    this.values = new Map(
      collectVariableNames(settings).map((name) => [name, 0]),
    );
  }

  entries(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  matches(motion: MotionItem): boolean {
    return (
      motion.VarFloats?.every((variable) => {
        if (!isVariableCondition(variable)) {
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

  /**
   * 应用变量赋值并输出变动日志
   */
  applyAssignments(motion: MotionItem): void {
    const changes: string[] = [];
    for (const variable of motion.VarFloats ?? []) {
      if (!isVariableAssignment(variable)) {
        continue;
      }

      const value = parseVariableCode(variable.Code, 'assign');

      if (value !== undefined) {
        const oldValue = this.values.get(variable.Name);
        if (oldValue !== value) {
          this.values.set(variable.Name, value);
          changes.push(`${variable.Name}: ${value}`);
        }
      }
    }

    if (changes.length > 0) {
      console.log(`${getTimestamp()} Vars: ${changes.join(', ')}`);
    }
  }
}

function isVariableCondition(variable: VarFloats): boolean {
  return variable.Type === 1;
}

function isVariableAssignment(variable: VarFloats): boolean {
  return variable.Type === 2;
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

  if (actualOperator !== code && actualOperator !== operator) {
    return undefined;
  }
  
  // 某些情况下 code 可能直接是数字（即 assign 操作）
  const parsedValue = value === undefined ? Number(actualOperator) : Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
