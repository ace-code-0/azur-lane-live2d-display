import { getModelMotions } from './live2dEngineBridge';

import type { ModelMotion, ModelSettings } from './modelSettings';

type MotionCurveTarget = 'Model' | 'Parameter' | 'PartOpacity';

type MotionCurve = {
  Target: MotionCurveTarget;
  Id: string;
  Segments: number[];
};

type MotionFile = {
  Version: number;
  Curves: MotionCurve[];
};

const LINEAR_SEGMENT = 0;
const BEZIER_SEGMENT = 1;
const STEPPED_SEGMENT = 2;
const INVERSE_STEPPED_SEGMENT = 3;

export async function getMotionParameterTargetValue(
  modelUrl: string,
  settings: ModelSettings,
  motionReference: string,
  parameterId: string,
): Promise<number | undefined> {
  const motion = findReferencedMotion(settings, motionReference);

  if (!motion?.File) {
    return undefined;
  }

  const motionFile = await loadMotionFile(
    resolveModelFileUrl(modelUrl, motion.File),
  );
  const curve = motionFile.Curves.find(
    ({ Target, Id }) => Target === 'Parameter' && Id === parameterId,
  );

  return curve ? getFinalCurveValue(curve) : undefined;
}

function findReferencedMotion(
  settings: ModelSettings,
  reference: string,
): ModelMotion | undefined {
  const [group, motionName] = reference.split(':', 2);
  const motions = getModelMotions(settings, group);

  if (motionName !== undefined) {
    return motions.find(({ Name }) => Name === motionName);
  }

  return motions.find(({ File }) => File !== undefined);
}

async function loadMotionFile(url: string): Promise<MotionFile> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load motion file: ${response.status} ${url}`);
  }

  return (await response.json()) as MotionFile;
}

function resolveModelFileUrl(modelUrl: string, file: string): string {
  return new URL(file, new URL(modelUrl, window.location.href)).toString();
}

function getFinalCurveValue(curve: MotionCurve): number | undefined {
  const { Segments } = curve;

  if (Segments.length < 2) {
    return undefined;
  }

  let index = 2;
  let value = Segments[1];

  while (index < Segments.length) {
    const segmentType = Segments[index];

    if (
      segmentType === LINEAR_SEGMENT ||
      segmentType === STEPPED_SEGMENT ||
      segmentType === INVERSE_STEPPED_SEGMENT
    ) {
      value = Segments[index + 2];
      index += 3;
      continue;
    }

    if (segmentType === BEZIER_SEGMENT) {
      value = Segments[index + 6];
      index += 7;
      continue;
    }

    return undefined;
  }

  return Number.isFinite(value) ? value : undefined;
}
