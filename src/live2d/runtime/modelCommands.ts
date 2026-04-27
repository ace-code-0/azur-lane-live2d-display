export type ModelCommand =
  | {
      kind: 'mouseTracking';
      enabled: boolean;
      raw: string;
    }
  | {
      kind: 'parameter';
      action: 'set' | 'lock' | 'unlock';
      parameterId: string;
      value?: number;
      raw: string;
    }
  | {
      kind: 'startMotion';
      reference: string;
      raw: string;
    }
  | {
      kind: 'unknown';
      namespace: string;
      args: string[];
      raw: string;
    };

export type ModelCommandHandlers = {
  setMouseTrackingEnabled?(enabled: boolean): void;
  setParameter?(parameterId: string, value: number): void;
  lockParameter?(parameterId: string, value?: number): void;
  unlockParameter?(parameterId: string): void;
  startMotion?(reference: string): void;
  onUnknownCommand?(command: Extract<ModelCommand, { kind: 'unknown' }>): void;
};

export function parseModelCommands(commandText?: string): ModelCommand[] {
  if (!commandText) {
    return [];
  }

  return commandText
    .split(';')
    .map((rawCommand) => rawCommand.trim())
    .filter((rawCommand) => rawCommand.length > 0)
    .map(parseModelCommand);
}

export function executeModelCommands(
  commandText: string | undefined,
  handlers: ModelCommandHandlers,
): void {
  for (const command of parseModelCommands(commandText)) {
    executeModelCommand(command, handlers);
  }
}

export function parseModelCommand(raw: string): ModelCommand {
  const [namespace = '', action = '', ...args] = raw.trim().split(/\s+/);

  if (namespace === 'mouse_tracking') {
    return {
      kind: 'mouseTracking',
      enabled: action === 'enable',
      raw,
    };
  }

  if (namespace === 'parameters') {
    const [parameterId, rawValue] = args;
    const value = rawValue === undefined ? undefined : Number(rawValue);

    if (
      (action === 'set' || action === 'lock' || action === 'unlock') &&
      parameterId !== undefined
    ) {
      return {
        kind: 'parameter',
        action,
        parameterId,
        value: Number.isFinite(value) ? value : undefined,
        raw,
      };
    }
  }

  if (namespace === 'start_mtn') {
    return {
      kind: 'startMotion',
      reference: [action, ...args].join(' ').trim(),
      raw,
    };
  }

  return {
    kind: 'unknown',
    namespace,
    args: [action, ...args].filter((arg) => arg.length > 0),
    raw,
  };
}

export function executeModelCommand(
  command: ModelCommand,
  handlers: ModelCommandHandlers,
): void {
  switch (command.kind) {
    case 'mouseTracking':
      handlers.setMouseTrackingEnabled?.(command.enabled);
      return;

    case 'parameter':
      if (command.action === 'set' && command.value !== undefined) {
        handlers.setParameter?.(command.parameterId, command.value);
        return;
      }

      if (command.action === 'lock') {
        handlers.lockParameter?.(command.parameterId, command.value);
        return;
      }

      handlers.unlockParameter?.(command.parameterId);
      return;

    case 'startMotion':
      handlers.startMotion?.(command.reference);
      return;

    case 'unknown':
      handlers.onUnknownCommand?.(command);
      return;
  }
}
