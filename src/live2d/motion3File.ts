import { getModelMotions } from './live2dEngineBridge';
import { parseMotionReference } from './motionReference';

import type { MotionItem, Settings } from './modelSettings';

type Motion3CurveTarget = 'Model' | 'Parameter' | 'PartOpacity';

type Motion3Curve = {
  Target: Motion3CurveTarget;
  Id: string;
  Segments: number[];
};

type Motion3File = {
  Version: number;
  Curves: Motion3Curve[];
};

const LINEAR_SEGMENT = 0;
const BEZIER_SEGMENT = 1;
const STEPPED_SEGMENT = 2;
const INVERSE_STEPPED_SEGMENT = 3;

export async function getMotion3ParameterTargetValue(
  modelUrl: string,
  settings: Settings,
  motionReference: string,
  parameterId: string,
): Promise<number | undefined> {
  const motion = findReferencedMotion(settings, motionReference);

  if (!motion?.File) {
    return undefined;
  }

  const motionFile = await loadMotion3File(
    resolveModelFileUrl(modelUrl, motion.File),
  );
  const curve = motionFile.Curves.find(
    ({ Target, Id }) => Target === 'Parameter' && Id === parameterId,
  );

  return curve ? getFinalCurveValue(curve) : undefined;
}

function findReferencedMotion(
  settings: Settings,
  reference: string,
): MotionItem | undefined {
  const { group, motionName } = parseMotionReference(reference);
  const motions = getModelMotions(settings, group);

  if (motionName !== undefined) {
    return motions.find(({ Name }) => Name === motionName);
  }

  return motions.find(({ File }) => File !== undefined);
}

async function loadMotion3File(url: string): Promise<Motion3File> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load motion3 file: ${response.status} ${url}`);
  }

  return (await response.json()) as Motion3File;
}

function resolveModelFileUrl(modelUrl: string, file: string): string {
  return new URL(file, new URL(modelUrl, window.location.href)).toString();
}

function getFinalCurveValue(curve: Motion3Curve): number | undefined {
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
