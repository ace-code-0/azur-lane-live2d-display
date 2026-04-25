export type MotionReferenceParts = {
  group: string;
  motionName?: string;
};

export function createMotionReference(
  group: string,
  motionName?: string,
): string {
  return motionName === undefined ? group : `${group}:${motionName}`;
}

export function parseMotionReference(reference: string): MotionReferenceParts {
  const separatorIndex = reference.indexOf(':');

  if (separatorIndex < 0) {
    return { group: reference };
  }

  return {
    group: reference.slice(0, separatorIndex),
    motionName: reference.slice(separatorIndex + 1),
  };
}
