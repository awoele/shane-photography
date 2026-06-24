import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fetchPhotos, getPhotoTimestamp, type Photo } from '../photos';

export const CMS_PHOTO_STATUSES = ['draft', 'published', 'hidden'] as const;

export type CmsPhotoStatus = (typeof CMS_PHOTO_STATUSES)[number];

export type CmsPhoto = Photo & {
  createdAt: string;
  featured: boolean;
  status: CmsPhotoStatus;
  updatedAt: string;
};

export type CmsProcessingStatus =
  | 'completed'
  | 'failed'
  | 'processing'
  | 'queued';

export type CmsProcessingStepStatus =
  | 'completed'
  | 'failed'
  | 'pending'
  | 'skipped';

export type CmsProcessingJob = {
  createdAt: string;
  error: string;
  exifStatus: CmsProcessingStepStatus;
  filename: string;
  id: string;
  livePhotoStatus: CmsProcessingStepStatus;
  objectPath?: string;
  photoId?: string;
  progress: number;
  stage: string;
  status: CmsProcessingStatus;
  thumbnail: string;
  updatedAt: string;
};

export type CmsSettings = {
  defaultPublishStatus: CmsPhotoStatus;
  lastManifestRefreshAt: string;
  manifestCacheEnabled: boolean;
  manifestCacheVersion: string;
  processFunctionConfigured: boolean;
  storageBucket: string;
  uploadFunctionConfigured: boolean;
};

export type CmsSettingsPatch = Partial<
  Pick<
    CmsSettings,
    'defaultPublishStatus' | 'manifestCacheEnabled' | 'storageBucket'
  >
>;

export type CmsPhotoPatch = Partial<
  Pick<
    CmsPhoto,
    | 'aperture'
    | 'camera'
    | 'category'
    | 'date'
    | 'dateTaken'
    | 'description'
    | 'featured'
    | 'focalLength'
    | 'height'
    | 'iso'
    | 'lens'
    | 'location'
    | 'manifestLocation'
    | 'rating'
    | 'shutterSpeed'
    | 'status'
    | 'tags'
    | 'thumbnail'
    | 'title'
    | 'width'
  >
>;

export type CmsPhotoListOptions = {
  category?: string;
  publishedOnly?: boolean;
  query?: string;
  status?: CmsPhotoStatus | 'all';
};

export type CmsBulkUpdateInput = {
  ids: string[];
  patch: CmsPhotoPatch;
};

export type CmsStats = {
  categoryCounts: Record<string, number>;
  statusCounts: Record<CmsPhotoStatus, number>;
  total: number;
};

type CmsPhotoRecord = Partial<CmsPhoto> & Partial<Photo>;
type CmsProcessingJobRecord = Partial<CmsProcessingJob>;
type CmsSettingsRecord = Partial<CmsSettings>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const normalizeTags = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(toText)
        .filter(Boolean)
        .map((tag) => tag.toLowerCase()),
    ),
  );
};

const isCmsStatus = (value: unknown): value is CmsPhotoStatus =>
  CMS_PHOTO_STATUSES.includes(value as CmsPhotoStatus);

const getNow = () => new Date().toISOString();

const getCmsDataFilePath = () =>
  process.env.PHOTO_CMS_DATA_FILE ||
  path.join(process.cwd(), 'data', 'photo-cms.json');

const getCmsSiblingFilePath = (filename: string) => {
  const dataFilePath = getCmsDataFilePath();

  return path.join(path.dirname(dataFilePath), filename);
};

const getCmsJobsFilePath = () => getCmsSiblingFilePath('photo-cms-jobs.json');

const getCmsSettingsFilePath = () =>
  getCmsSiblingFilePath('photo-cms-settings.json');

const sortCmsPhotos = (photos: CmsPhoto[]) =>
  [...photos].sort(
    (first, second) =>
      getPhotoTimestamp(second) - getPhotoTimestamp(first) ||
      first.id.localeCompare(second.id),
  );

const normalizeCmsPhoto = (item: unknown): CmsPhoto | null => {
  if (!isRecord(item)) {
    return null;
  }

  const record = item as CmsPhotoRecord;
  const id = toText(record.id);
  const src = toText(record.src);
  const thumbnail = toText(record.thumbnail);
  const category = toText(record.category) || 'uncategorized';

  if (!id || !src || !thumbnail) {
    return null;
  }

  const now = getNow();
  const createdAt = toText(record.createdAt) || toText(record.date) || now;
  const updatedAt = toText(record.updatedAt) || createdAt;

  return {
    aperture: toText(record.aperture),
    camera: toText(record.camera),
    category,
    createdAt,
    date: toText(record.date),
    dateTaken: toText(record.dateTaken),
    description: toText(record.description),
    featured: record.featured === true,
    focalLength: toText(record.focalLength),
    height: toNumber(record.height),
    id,
    iso: toText(record.iso),
    lens: toText(record.lens),
    location: toText(record.location),
    shutterSpeed: toText(record.shutterSpeed),
    src,
    status: isCmsStatus(record.status) ? record.status : 'published',
    thumbnail,
    title: toText(record.title) || id,
    updatedAt,
    width: toNumber(record.width),
    ...(record.digest ? { digest: toText(record.digest) } : {}),
    ...(record.exif ? { exif: record.exif } : {}),
    ...(record.fileSize ? { fileSize: toNumber(record.fileSize) } : {}),
    ...(record.format ? { format: toText(record.format).toUpperCase() } : {}),
    ...(record.fujiRecipe ? { fujiRecipe: record.fujiRecipe } : {}),
    ...(record.isHDR !== undefined ? { isHDR: record.isHDR === true } : {}),
    ...(record.lastModified
      ? { lastModified: toText(record.lastModified) }
      : {}),
    ...(record.manifestLocation
      ? { manifestLocation: record.manifestLocation }
      : {}),
    ...(record.rating ? { rating: toNumber(record.rating) } : {}),
    ...(record.s3Key ? { s3Key: toText(record.s3Key) } : {}),
    ...(normalizeTags(record.tags).length
      ? { tags: normalizeTags(record.tags) }
      : {}),
    ...(record.thumbHash ? { thumbHash: toText(record.thumbHash) } : {}),
    ...(record.toneAnalysis ? { toneAnalysis: record.toneAnalysis } : {}),
    ...(record.video ? { video: record.video } : {}),
  };
};

const isProcessingStatus = (value: unknown): value is CmsProcessingStatus =>
  ['completed', 'failed', 'processing', 'queued'].includes(String(value));

const isProcessingStepStatus = (
  value: unknown,
): value is CmsProcessingStepStatus =>
  ['completed', 'failed', 'pending', 'skipped'].includes(String(value));

const normalizeProcessingJob = (item: unknown): CmsProcessingJob | null => {
  if (!isRecord(item)) {
    return null;
  }

  const record = item as CmsProcessingJobRecord;
  const id = toText(record.id);
  const filename = toText(record.filename);

  if (!id || !filename) {
    return null;
  }

  const now = getNow();
  const progress = Math.max(0, Math.min(100, toNumber(record.progress)));

  return {
    createdAt: toText(record.createdAt) || now,
    error: toText(record.error),
    exifStatus: isProcessingStepStatus(record.exifStatus)
      ? record.exifStatus
      : 'pending',
    filename,
    id,
    livePhotoStatus: isProcessingStepStatus(record.livePhotoStatus)
      ? record.livePhotoStatus
      : 'pending',
    progress,
    stage: toText(record.stage) || 'Queued',
    status: isProcessingStatus(record.status) ? record.status : 'queued',
    thumbnail: toText(record.thumbnail),
    updatedAt: toText(record.updatedAt) || now,
    ...(record.objectPath ? { objectPath: toText(record.objectPath) } : {}),
    ...(record.photoId ? { photoId: toText(record.photoId) } : {}),
  };
};

const normalizeSettings = (item: unknown): CmsSettings => {
  const record = isRecord(item) ? (item as CmsSettingsRecord) : {};

  return {
    defaultPublishStatus: isCmsStatus(record.defaultPublishStatus)
      ? record.defaultPublishStatus
      : 'draft',
    lastManifestRefreshAt: toText(record.lastManifestRefreshAt),
    manifestCacheEnabled: record.manifestCacheEnabled !== false,
    manifestCacheVersion: toText(record.manifestCacheVersion) || 'never',
    processFunctionConfigured: Boolean(
      process.env.PROCESS_FUNCTION_URL && process.env.PROCESS_FUNCTION_SECRET,
    ),
    storageBucket: toText(record.storageBucket) || 'shane-photos',
    uploadFunctionConfigured: Boolean(
      process.env.UPLOAD_FUNCTION_URL && process.env.UPLOAD_FUNCTION_SECRET,
    ),
  };
};

const photoToCmsPhoto = (photo: Photo): CmsPhoto => {
  const now = getNow();

  return {
    ...photo,
    createdAt: photo.lastModified || photo.dateTaken || photo.date || now,
    featured: false,
    status: 'published',
    updatedAt: photo.lastModified || now,
  };
};

const readCmsFile = async () => {
  const filePath = getCmsDataFilePath();
  const text = await readFile(filePath, 'utf8');
  const data: unknown = JSON.parse(text);

  if (!Array.isArray(data)) {
    throw new Error('photo-cms.json must contain an array.');
  }

  return data;
};

const readCmsJobsFile = async () => {
  try {
    const text = await readFile(getCmsJobsFilePath(), 'utf8');
    const data: unknown = JSON.parse(text);

    return Array.isArray(data) ? data : [];
  } catch (error) {
    const missingFile =
      error instanceof Error &&
      ('code' in error ? (error as NodeJS.ErrnoException).code : '') ===
        'ENOENT';

    if (missingFile) {
      return [];
    }

    throw error;
  }
};

const readCmsSettingsFile = async () => {
  try {
    const text = await readFile(getCmsSettingsFilePath(), 'utf8');

    return JSON.parse(text) as unknown;
  } catch (error) {
    const missingFile =
      error instanceof Error &&
      ('code' in error ? (error as NodeJS.ErrnoException).code : '') ===
        'ENOENT';

    if (missingFile) {
      return {};
    }

    throw error;
  }
};

export const saveCmsPhotos = async (photos: CmsPhoto[]) => {
  const filePath = getCmsDataFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(sortCmsPhotos(photos), null, 2), {
    encoding: 'utf8',
  });
};

export const saveProcessingJobs = async (jobs: CmsProcessingJob[]) => {
  const filePath = getCmsJobsFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      [...jobs].sort(
        (first, second) =>
          Date.parse(second.updatedAt) - Date.parse(first.updatedAt) ||
          first.id.localeCompare(second.id),
      ),
      null,
      2,
    ),
    {
      encoding: 'utf8',
    },
  );
};

const saveCmsSettings = async (settings: CmsSettings) => {
  const filePath = getCmsSettingsFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(settings, null, 2), {
    encoding: 'utf8',
  });
};

export const loadCmsPhotos = async ({
  seedFromLegacy = false,
}: {
  seedFromLegacy?: boolean;
} = {}) => {
  try {
    const data = await readCmsFile();

    return sortCmsPhotos(
      data
        .map(normalizeCmsPhoto)
        .filter((photo): photo is CmsPhoto => photo !== null),
    );
  } catch (error) {
    const missingFile =
      error instanceof Error &&
      ('code' in error ? (error as NodeJS.ErrnoException).code : '') ===
        'ENOENT';

    if (!missingFile || !seedFromLegacy) {
      if (missingFile) {
        return [];
      }

      throw error;
    }

    const legacyPhotos = (await fetchPhotos({ cacheBust: true })).map(
      photoToCmsPhoto,
    );
    await saveCmsPhotos(legacyPhotos);

    return sortCmsPhotos(legacyPhotos);
  }
};

export const listCmsPhotos = async (options: CmsPhotoListOptions = {}) => {
  const query = toText(options.query).toLowerCase();
  const category = toText(options.category).toLowerCase();
  const status = options.status || 'all';

  return (await loadCmsPhotos({ seedFromLegacy: true })).filter((photo) => {
    if (options.publishedOnly && photo.status !== 'published') {
      return false;
    }

    if (status !== 'all' && photo.status !== status) {
      return false;
    }

    if (category && category !== 'all' && photo.category !== category) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      photo.id,
      photo.title,
      photo.category,
      photo.description,
      photo.location,
      photo.camera,
      photo.lens,
      photo.tags?.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
};

export const getPublishedCmsPhotos = () =>
  listCmsPhotos({ publishedOnly: true });

export const updateCmsPhoto = async (id: string, patch: CmsPhotoPatch) => {
  const photos = await loadCmsPhotos({ seedFromLegacy: true });
  const index = photos.findIndex((photo) => photo.id === id);

  if (index < 0) {
    throw new Error(`Photo ${id} was not found.`);
  }

  const current = photos[index] as CmsPhoto;
  const next: CmsPhoto = {
    ...current,
    ...patch,
    category: toText(patch.category) || current.category,
    status: isCmsStatus(patch.status) ? patch.status : current.status,
    tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
    title: toText(patch.title) || current.title,
    updatedAt: getNow(),
  };

  photos[index] = next;
  await saveCmsPhotos(photos);

  return next;
};

export const createCmsPhoto = async (
  photo: Pick<CmsPhoto, 'id' | 'src' | 'thumbnail'> &
    Partial<Omit<CmsPhoto, 'createdAt' | 'id' | 'src' | 'thumbnail'>>,
) => {
  const photos = await loadCmsPhotos({ seedFromLegacy: true });
  const existing = photos.find((item) => item.id === photo.id);

  if (existing) {
    throw new Error(`Photo ${photo.id} already exists.`);
  }

  const now = getNow();
  const next = normalizeCmsPhoto({
    aperture: '',
    camera: '',
    category: photo.category || 'uncategorized',
    createdAt: now,
    date: photo.date || '',
    dateTaken: photo.dateTaken || '',
    description: photo.description || '',
    featured: photo.featured === true,
    focalLength: '',
    height: photo.height ?? 0,
    id: photo.id,
    iso: '',
    lens: '',
    location: photo.location || '',
    shutterSpeed: '',
    src: photo.src,
    status: photo.status || 'draft',
    tags: photo.tags || [],
    thumbnail: photo.thumbnail,
    title: photo.title || photo.id,
    updatedAt: now,
    width: photo.width ?? 0,
  });

  if (!next) {
    throw new Error('Photo id, source, and thumbnail are required.');
  }

  await saveCmsPhotos([next, ...photos]);

  return next;
};

export const deleteCmsPhotos = async (ids: string[]) => {
  const selectedIds = new Set(ids.map(toText).filter(Boolean));
  const photos = await loadCmsPhotos({ seedFromLegacy: true });
  const nextPhotos = photos.filter((photo) => !selectedIds.has(photo.id));

  await saveCmsPhotos(nextPhotos);

  return {
    deleted: photos.length - nextPhotos.length,
  };
};

export const bulkUpdateCmsPhotos = async ({
  ids,
  patch,
}: CmsBulkUpdateInput) => {
  const selectedIds = new Set(ids.map(toText).filter(Boolean));
  const photos = await loadCmsPhotos({ seedFromLegacy: true });
  let updated = 0;
  const now = getNow();

  const nextPhotos = photos.map((photo) => {
    if (!selectedIds.has(photo.id)) {
      return photo;
    }

    updated += 1;

    return {
      ...photo,
      ...patch,
      category: toText(patch.category) || photo.category,
      status: isCmsStatus(patch.status) ? patch.status : photo.status,
      tags: patch.tags ? normalizeTags(patch.tags) : photo.tags,
      updatedAt: now,
    };
  });

  await saveCmsPhotos(nextPhotos);

  return {
    updated,
  };
};

export const listProcessingJobs = async () =>
  (await readCmsJobsFile())
    .map(normalizeProcessingJob)
    .filter((job): job is CmsProcessingJob => job !== null);

export const addProcessingJob = async (
  job: Pick<CmsProcessingJob, 'filename' | 'id'> & Partial<CmsProcessingJob>,
) => {
  const jobs = await listProcessingJobs();
  const now = getNow();
  const next: CmsProcessingJob = {
    createdAt: job.createdAt || now,
    error: job.error || '',
    exifStatus: job.exifStatus || 'pending',
    filename: job.filename,
    id: job.id,
    livePhotoStatus: job.livePhotoStatus || 'pending',
    progress: job.progress ?? 0,
    stage: job.stage || 'Queued',
    status: job.status || 'queued',
    thumbnail: job.thumbnail || '',
    updatedAt: now,
    ...(job.objectPath ? { objectPath: job.objectPath } : {}),
    ...(job.photoId ? { photoId: job.photoId } : {}),
  };

  await saveProcessingJobs([
    next,
    ...jobs.filter((current) => current.id !== next.id),
  ]);

  return next;
};

export const retryProcessingJob = async (id: string) => {
  const jobs = await listProcessingJobs();
  const index = jobs.findIndex((job) => job.id === id);

  if (index < 0) {
    throw new Error(`Processing job ${id} was not found.`);
  }

  const current = jobs[index] as CmsProcessingJob;
  const next: CmsProcessingJob = {
    ...current,
    error: '',
    exifStatus: 'pending',
    livePhotoStatus: 'pending',
    progress: 0,
    stage: 'Queued for retry',
    status: 'queued',
    updatedAt: getNow(),
  };

  jobs[index] = next;
  await saveProcessingJobs(jobs);

  return next;
};

export const getCmsSettings = async () =>
  normalizeSettings(await readCmsSettingsFile());

export const updateCmsSettings = async (patch: CmsSettingsPatch) => {
  const current = await getCmsSettings();
  const next = normalizeSettings({
    ...current,
    ...patch,
    defaultPublishStatus: isCmsStatus(patch.defaultPublishStatus)
      ? patch.defaultPublishStatus
      : current.defaultPublishStatus,
  });

  await saveCmsSettings(next);

  return next;
};

export const refreshManifestCache = async () => {
  const current = await getCmsSettings();
  const now = getNow();
  const next: CmsSettings = {
    ...current,
    lastManifestRefreshAt: now,
    manifestCacheVersion: now,
  };

  await saveCmsSettings(next);

  return next;
};

export const getCmsStats = async (): Promise<CmsStats> => {
  const photos = await loadCmsPhotos({ seedFromLegacy: true });
  const stats: CmsStats = {
    categoryCounts: {},
    statusCounts: {
      draft: 0,
      hidden: 0,
      published: 0,
    },
    total: photos.length,
  };

  photos.forEach((photo) => {
    stats.statusCounts[photo.status] += 1;
    stats.categoryCounts[photo.category] =
      (stats.categoryCounts[photo.category] ?? 0) + 1;
  });

  return stats;
};
