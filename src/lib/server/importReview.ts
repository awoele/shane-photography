const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif)$/i;
const TIMESTAMP_PREFIX_PATTERN = /^\d{8}-\d{6}-\d{3}-(.+)$/;

export type ImportReviewObject = {
  contentType?: string;
  name: string;
  previewUrl?: string;
  size?: number;
  updated?: string;
};

export type ImportReviewCandidateStatus =
  | 'complete'
  | 'missing-sidecar'
  | 'orphan-json';

export type ImportReviewCandidate = {
  archivePaths: string[];
  category: string;
  duplicateCount: number;
  duplicateGroupKey: string;
  filename: string;
  id: string;
  metadataPath?: string;
  objectPath?: string;
  previewUrl?: string;
  reasons: string[];
  recommended: boolean;
  size: number;
  status: ImportReviewCandidateStatus;
  updated: string;
};

export type ImportReviewSnapshot = {
  candidates: ImportReviewCandidate[];
  generatedAt: string;
  summary: {
    complete: number;
    duplicates: number;
    missingSidecar: number;
    orphanJson: number;
    recommended: number;
    total: number;
  };
};

const isIncomingObject = (name: string) => name.startsWith('incoming/');

const isImageObject = (name: string) => IMAGE_EXTENSION_PATTERN.test(name);

const isSidecarObject = (name: string) => name.endsWith('.json');

const stripSidecarExtension = (name: string) => name.replace(/\.json$/i, '');

const getCategory = (name: string) => name.split('/')[1] ?? '';

const getFilename = (name: string) => name.split('/').pop() ?? name;

const getOriginalFilename = (name: string) => {
  const filename = getFilename(stripSidecarExtension(name));
  const match = filename.match(TIMESTAMP_PREFIX_PATTERN);

  return (match?.[1] ?? filename).toLowerCase();
};

const compareCandidatesByUpdatedDesc = (
  first: Pick<ImportReviewCandidate, 'objectPath' | 'updated'>,
  second: Pick<ImportReviewCandidate, 'objectPath' | 'updated'>,
) => {
  const dateDiff =
    Date.parse(second.updated || '') - Date.parse(first.updated || '');

  if (dateDiff !== 0 && Number.isFinite(dateDiff)) {
    return dateDiff;
  }

  return String(second.objectPath ?? '').localeCompare(
    String(first.objectPath ?? ''),
  );
};

const buildDuplicateGroupKey = (name: string) =>
  `${getCategory(name)}/${getOriginalFilename(name)}`;

export const createImportReviewSnapshot = (
  objects: ImportReviewObject[],
): ImportReviewSnapshot => {
  const incomingObjects = objects.filter((object) =>
    isIncomingObject(object.name),
  );
  const imageObjects = incomingObjects.filter((object) =>
    isImageObject(object.name),
  );
  const sidecarObjects = incomingObjects.filter((object) =>
    isSidecarObject(object.name),
  );
  const sidecarNames = new Set(sidecarObjects.map((object) => object.name));
  const imageNames = new Set(imageObjects.map((object) => object.name));
  const candidates: ImportReviewCandidate[] = [];

  imageObjects.forEach((object) => {
    const metadataPath = `${object.name}.json`;
    const hasSidecar = sidecarNames.has(metadataPath);
    const duplicateGroupKey = buildDuplicateGroupKey(object.name);

    candidates.push({
      archivePaths: hasSidecar ? [object.name, metadataPath] : [object.name],
      category: getCategory(object.name),
      duplicateCount: 1,
      duplicateGroupKey,
      filename: getOriginalFilename(object.name),
      id: object.name,
      ...(hasSidecar ? { metadataPath } : {}),
      objectPath: object.name,
      previewUrl: object.previewUrl,
      reasons: hasSidecar ? [] : ['Missing metadata sidecar'],
      recommended: false,
      size: object.size ?? 0,
      status: hasSidecar ? 'complete' : 'missing-sidecar',
      updated: object.updated ?? '',
    });
  });

  sidecarObjects.forEach((object) => {
    const imageName = stripSidecarExtension(object.name);

    if (imageNames.has(imageName)) {
      return;
    }

    candidates.push({
      archivePaths: [object.name],
      category: getCategory(object.name),
      duplicateCount: 1,
      duplicateGroupKey: buildDuplicateGroupKey(object.name),
      filename: getOriginalFilename(object.name),
      id: object.name,
      metadataPath: object.name,
      reasons: ['Image file was not uploaded'],
      recommended: false,
      size: object.size ?? 0,
      status: 'orphan-json',
      updated: object.updated ?? '',
    });
  });

  const completeByGroup = new Map<string, ImportReviewCandidate[]>();

  candidates
    .filter((candidate) => candidate.status === 'complete')
    .forEach((candidate) => {
      const current = completeByGroup.get(candidate.duplicateGroupKey) ?? [];

      current.push(candidate);
      completeByGroup.set(candidate.duplicateGroupKey, current);
    });

  completeByGroup.forEach((group) => {
    const sorted = [...group].sort(compareCandidatesByUpdatedDesc);
    const duplicateCount = sorted.length;

    sorted.forEach((candidate, index) => {
      const currentCandidate = candidate;

      currentCandidate.duplicateCount = duplicateCount;
      currentCandidate.recommended = index === 0;

      if (duplicateCount > 1 && index > 0) {
        currentCandidate.reasons.push('Older duplicate upload');
      }
    });
  });

  const sortedCandidates = candidates.sort((first, second) => {
    if (first.recommended !== second.recommended) {
      return first.recommended ? -1 : 1;
    }

    if (first.status !== second.status) {
      return first.status.localeCompare(second.status);
    }

    return compareCandidatesByUpdatedDesc(first, second);
  });
  const duplicateGroups = Array.from(completeByGroup.values()).filter(
    (group) => group.length > 1,
  );

  return {
    candidates: sortedCandidates,
    generatedAt: new Date().toISOString(),
    summary: {
      complete: candidates.filter(
        (candidate) => candidate.status === 'complete',
      ).length,
      duplicates: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
      missingSidecar: candidates.filter(
        (candidate) => candidate.status === 'missing-sidecar',
      ).length,
      orphanJson: candidates.filter(
        (candidate) => candidate.status === 'orphan-json',
      ).length,
      recommended: candidates.filter((candidate) => candidate.recommended)
        .length,
      total: candidates.length,
    },
  };
};

export const getRecommendedImportObjectPaths = (
  snapshot: ImportReviewSnapshot,
) =>
  snapshot.candidates
    .filter(
      (candidate) => candidate.recommended && Boolean(candidate.objectPath),
    )
    .map((candidate) => candidate.objectPath as string);
