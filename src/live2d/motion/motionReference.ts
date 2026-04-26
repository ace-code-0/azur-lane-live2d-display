export type MotionReference = {
  group: string;
  motionName?: string;
};

export type MotionLayerReference = MotionReference & {
  layer: number;
};

export function parseMotionReference(reference: string): MotionReference {
  const separatorIndex = reference.indexOf(':');

  if (separatorIndex < 0) {
    return { group: reference };
  }

  return {
    group: reference.slice(0, separatorIndex),
    motionName: reference.slice(separatorIndex + 1),
  };
}

export function parseMotionLayerReference(
  reference: MotionReference,
): MotionLayerReference {
  const match = reference.group.match(/^(.*)#([1-9]\d*)$/);

  if (!match) {
    return {
      ...reference,
      layer: 0,
    };
  }

  return {
    group: reference.group,
    motionName: reference.motionName,
    layer: Number(match[2]),
  };
}
