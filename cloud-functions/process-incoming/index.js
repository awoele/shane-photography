const path = require('node:path');

const { Storage } = require('@google-cloud/storage');
const exifr = require('exifr');
const sharp = require('sharp');

const INCOMING_PREFIX = 'incoming/';
const PROCESSING_PREFIX = 'processing/';
const PROCESSED_PREFIX = 'processed/';
const FAILED_PREFIX = 'failed/';
const PHOTOS_JSON_PATH = 'data/photos.json';
const CMS_OVERRIDES_JSON_PATH = 'data/photo-cms-overrides.json';
const CMS_PROCESSING_JOBS_JSON_PATH = 'data/photo-cms-jobs.json';
const LARGE_SIZE = 2560;
const THUMBNAIL_SIZE = 800;
const MAX_INPUT_PIXELS = 500_000_000;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const LIVE_VIDEO_EXTENSIONS = ['.mov', '.MOV', '.mp4', '.MP4'];
const IMPORT_REVIEW_SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const ALLOWED_CATEGORIES = new Set([
  'alex-webb',
  'beauty',
  'color',
  'cute',
  'design',
  'favourites',
  'mark',
  'nature',
  'night',
  'portrait',
  'street',
  'travel',
]);

const CMS_PHOTO_STATUSES = new Set(['draft', 'hidden', 'published']);

const storage = new Storage();

const toCleanString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const getJsonBody = (req) => {
  const body = req && req.body;

  if (!body) {
    return {};
  }

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch (_error) {
      return {};
    }
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }

  if (typeof body === 'object' && !Array.isArray(body)) {
    return body;
  }

  return {};
};

const padNumber = (value) => String(value).padStart(3, '0');

const createTimestamp = () => {
  const now = new Date();
  const pad = (value, length = 2) => String(value).padStart(length, '0');

  return [
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
      now.getUTCDate(),
    )}`,
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
      now.getUTCSeconds(),
    )}`,
    pad(now.getUTCMilliseconds(), 3),
  ].join('-');
};

const isAuthorized = (req) => {
  const expectedSecret = process.env.PROCESS_FUNCTION_SECRET;
  const authHeader = req.get('authorization') || '';
  const headerSecret = req.get('x-process-function-secret') || '';

  return (
    expectedSecret &&
    (authHeader === `Bearer ${expectedSecret}` ||
      headerSecret === expectedSecret)
  );
};

const getCategoryFromObjectName = (objectName) => {
  const parts = objectName.split('/');

  if (parts.length < 3 || parts[0] !== 'incoming') {
    return '';
  }

  return parts[1].toLowerCase();
};

const getRelativeIncomingPath = (objectName) =>
  objectName.startsWith(INCOMING_PREFIX)
    ? objectName.slice(INCOMING_PREFIX.length)
    : objectName;

const getProcessingName = (objectName) =>
  `${PROCESSING_PREFIX}${getRelativeIncomingPath(objectName)}`;

const getProcessedName = (objectName) =>
  `${PROCESSED_PREFIX}${getRelativeIncomingPath(objectName)}`;

const getFailedName = (objectName) =>
  `${FAILED_PREFIX}${getRelativeIncomingPath(objectName)}`;

const moveFile = async (bucket, sourceName, targetName) => {
  const sourceFile = bucket.file(sourceName);
  const targetFile = bucket.file(targetName);

  await sourceFile.copy(targetFile);
  await sourceFile.delete();
};

const movePair = async (bucket, imageName, jsonName, targetImageName) => {
  const targetJsonName = `${targetImageName}.json`;

  await bucket.file(imageName).copy(bucket.file(targetImageName));
  await bucket.file(jsonName).copy(bucket.file(targetJsonName));
  await bucket.file(imageName).delete();
  await bucket.file(jsonName).delete();

  return {
    imageName: targetImageName,
    jsonName: targetJsonName,
  };
};

const moveObjectWithOptionalSidecar = async (
  bucket,
  objectName,
  targetName,
) => {
  await moveFile(bucket, objectName, targetName);

  const jsonName = `${objectName}.json`;
  const targetJsonName = `${targetName}.json`;
  const [jsonExists] = await bucket.file(jsonName).exists();

  if (jsonExists) {
    await moveFile(bucket, jsonName, targetJsonName);
  }
};

const safeMoveObjectWithOptionalSidecarToFailed = async (
  bucket,
  objectName,
) => {
  const failedObjectName = getFailedName(objectName).replace(
    /^failed\/processing\//,
    'failed/',
  );

  try {
    await moveFile(bucket, objectName, failedObjectName);
  } catch (_error) {
    // The companion object may be missing or may already have been moved.
  }

  try {
    await moveFile(bucket, `${objectName}.json`, `${failedObjectName}.json`);
  } catch (_error) {
    // The companion sidecar is optional for Live Photo videos.
  }
};

const safeMoveToFailed = async (bucket, imageName, jsonName, reason) => {
  const failedImageName = getFailedName(imageName).replace(
    /^failed\/processing\//,
    'failed/',
  );
  const failedJsonName = `${failedImageName}.json`;
  const errorName = `${failedImageName}.error.json`;

  try {
    await moveFile(bucket, imageName, failedImageName);
  } catch (_error) {
    // Keep going so the error marker is still written.
  }

  try {
    await moveFile(bucket, jsonName, failedJsonName);
  } catch (_error) {
    // The sidecar may be missing or may already have been moved.
  }

  await bucket.file(errorName).save(
    JSON.stringify(
      {
        failedAt: new Date().toISOString(),
        originalImagePath: imageName,
        reason,
      },
      null,
      2,
    ),
    {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    },
  );
};

const getLiveVideoCandidateNames = (imageName) => {
  const parsed = path.posix.parse(imageName);
  const stem = `${parsed.dir}/${parsed.name}`;

  return LIVE_VIDEO_EXTENSIONS.map((extension) => `${stem}${extension}`);
};

const findLiveVideoName = async (bucket, imageName) => {
  const candidates = getLiveVideoCandidateNames(imageName);

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const [exists] = await bucket.file(candidate).exists();

    if (exists) {
      return candidate;
    }
  }

  return '';
};

const getVideoContentType = (objectName) => {
  const extension = path.posix.extname(objectName).toLowerCase();

  return extension === '.mp4' ? 'video/mp4' : 'video/quicktime';
};

const copyLiveVideoToPublic = async (
  sourceFile,
  publicBucket,
  outputVideoPath,
) => {
  const publicFile = publicBucket.file(outputVideoPath);

  await sourceFile.copy(publicFile);
  await publicFile.setMetadata({
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: getVideoContentType(outputVideoPath),
  });
};

const downloadJson = async (file, fallback) => {
  try {
    const [buffer] = await file.download();
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    if (error && error.code === 404) {
      return fallback;
    }

    throw error;
  }
};

const readPhotosJson = async (publicBucket) => {
  const data = await downloadJson(publicBucket.file(PHOTOS_JSON_PATH), []);

  return Array.isArray(data) ? data : [];
};

const savePhotosJson = async (publicBucket, photos) => {
  await publicBucket
    .file(PHOTOS_JSON_PATH)
    .save(JSON.stringify(photos, null, 2), {
      cacheControl: 'public, max-age=60',
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    });
};

const readCmsOverridesJson = async (publicBucket) => {
  const data = await downloadJson(
    publicBucket.file(CMS_OVERRIDES_JSON_PATH),
    [],
  );

  return Array.isArray(data) ? data : [];
};

const saveCmsOverridesJson = async (publicBucket, overrides) => {
  await publicBucket.file(CMS_OVERRIDES_JSON_PATH).save(
    JSON.stringify(
      [...overrides].sort((first, second) =>
        String(first.id || '').localeCompare(String(second.id || '')),
      ),
      null,
      2,
    ),
    {
      cacheControl: 'public, max-age=15',
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    },
  );
};

const normalizeTags = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.map((tag) => toCleanString(tag).toLowerCase()).filter(Boolean),
    ),
  );
};

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const sanitizeCmsPatch = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const patch = {};
  const textFields = [
    'aperture',
    'camera',
    'date',
    'dateTaken',
    'description',
    'focalLength',
    'iso',
    'lens',
    'location',
    'originalCategory',
    'shutterSpeed',
    'thumbnail',
    'title',
  ];
  const numberFields = ['height', 'rating', 'sortOrder', 'width'];

  textFields.forEach((field) => {
    if (value[field] !== undefined) {
      patch[field] = toCleanString(value[field]);
    }
  });

  numberFields.forEach((field) => {
    if (value[field] !== undefined) {
      const parsed = toNumber(value[field]);

      if (parsed !== undefined) {
        patch[field] = parsed;
      }
    }
  });

  if (typeof value.category === 'string') {
    const category = toCleanString(value.category).toLowerCase();

    if (ALLOWED_CATEGORIES.has(category)) {
      patch.category = category;
    }
  }

  if (typeof value.featured === 'boolean') {
    patch.featured = value.featured;
  }

  if (
    value.manifestLocation &&
    typeof value.manifestLocation === 'object' &&
    !Array.isArray(value.manifestLocation)
  ) {
    patch.manifestLocation = value.manifestLocation;
  }

  if (CMS_PHOTO_STATUSES.has(value.status)) {
    patch.status = value.status;
  }

  if (Array.isArray(value.tags)) {
    patch.tags = normalizeTags(value.tags);
  }

  return patch;
};

const normalizeCmsOverride = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = toCleanString(value.id);

  if (!id) {
    return null;
  }

  return {
    ...sanitizeCmsPatch(value),
    id,
    ...(value.createdAt ? { createdAt: toCleanString(value.createdAt) } : {}),
    ...(value.deleted === true ? { deleted: true } : {}),
    ...(value.updatedAt ? { updatedAt: toCleanString(value.updatedAt) } : {}),
  };
};

const getCmsIds = (value) =>
  Array.isArray(value)
    ? Array.from(new Set(value.map(toCleanString).filter(Boolean)))
    : [];

const handleCmsMutation = async ({ body, publicBucket, res }) => {
  const cmsAction = toCleanString(body.cmsAction);
  const photos = await readPhotosJson(publicBucket);
  const photoIds = new Set(
    photos.map((photo) => toCleanString(photo && photo.id)).filter(Boolean),
  );
  const existingOverrides = (await readCmsOverridesJson(publicBucket))
    .map(normalizeCmsOverride)
    .filter(Boolean);
  const overridesById = new Map(
    existingOverrides.map((override) => [override.id, override]),
  );
  const now = new Date().toISOString();

  if (cmsAction === 'patch') {
    const id = toCleanString(body.id);

    if (!id || !photoIds.has(id)) {
      res
        .status(404)
        .json({ error: `Photo ${id || '(missing)'} was not found.` });
      return;
    }

    const current = overridesById.get(id) || { createdAt: now, id };

    overridesById.set(id, {
      ...current,
      ...sanitizeCmsPatch(body.patch),
      deleted: false,
      id,
      updatedAt: now,
    });
    await saveCmsOverridesJson(
      publicBucket,
      Array.from(overridesById.values()),
    );
    res.status(200).json({ updated: 1, updatedAt: now });
    return;
  }

  if (cmsAction === 'bulkPatch') {
    const ids = getCmsIds(body.ids).filter((id) => photoIds.has(id));
    const patch = sanitizeCmsPatch(body.patch);

    ids.forEach((id) => {
      const current = overridesById.get(id) || { createdAt: now, id };

      overridesById.set(id, {
        ...current,
        ...patch,
        deleted: false,
        id,
        updatedAt: now,
      });
    });
    await saveCmsOverridesJson(
      publicBucket,
      Array.from(overridesById.values()),
    );
    res.status(200).json({ updated: ids.length, updatedAt: now });
    return;
  }

  if (cmsAction === 'delete') {
    const ids = getCmsIds(body.ids).filter((id) => photoIds.has(id));

    ids.forEach((id) => {
      const current = overridesById.get(id) || { createdAt: now, id };

      overridesById.set(id, {
        ...current,
        deleted: true,
        id,
        status: 'hidden',
        updatedAt: now,
      });
    });
    await saveCmsOverridesJson(
      publicBucket,
      Array.from(overridesById.values()),
    );
    res.status(200).json({ deleted: ids.length, updatedAt: now });
    return;
  }

  if (cmsAction === 'restore') {
    const ids = getCmsIds(body.ids).filter((id) => photoIds.has(id));

    ids.forEach((id) => {
      const current = overridesById.get(id) || { createdAt: now, id };

      overridesById.set(id, {
        ...current,
        deleted: false,
        id,
        status: current.status === 'hidden' ? 'published' : current.status,
        updatedAt: now,
      });
    });
    await saveCmsOverridesJson(
      publicBucket,
      Array.from(overridesById.values()),
    );
    res.status(200).json({ updated: ids.length, updatedAt: now });
    return;
  }

  if (cmsAction === 'sequence') {
    const ids = getCmsIds(body.ids).filter((id) => photoIds.has(id));
    const sortStart = toNumber(body.sortStart);
    const titlePrefix = toCleanString(body.titlePrefix);
    const titleStart = toNumber(body.titleStart) ?? 1;

    ids.forEach((id, index) => {
      const current = overridesById.get(id) || { createdAt: now, id };

      overridesById.set(id, {
        ...current,
        ...(sortStart !== undefined ? { sortOrder: sortStart + index } : {}),
        ...(titlePrefix
          ? { title: `${titlePrefix}-${titleStart + index}` }
          : {}),
        id,
        updatedAt: now,
      });
    });
    await saveCmsOverridesJson(
      publicBucket,
      Array.from(overridesById.values()),
    );
    res.status(200).json({ updated: ids.length, updatedAt: now });
    return;
  }

  res.status(400).json({ error: `Unsupported CMS action: ${cmsAction}.` });
};

const handleProcessingJobsMutation = async ({ body, publicBucket, res }) => {
  const action = toCleanString(body.processingJobsAction) || 'list';

  if (action === 'list') {
    const jobs = await downloadJson(
      publicBucket.file(CMS_PROCESSING_JOBS_JSON_PATH),
      [],
    );

    res.status(200).json({ jobs: Array.isArray(jobs) ? jobs : [] });
    return;
  }

  if (action === 'save') {
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];

    await publicBucket.file(CMS_PROCESSING_JOBS_JSON_PATH).save(
      JSON.stringify(jobs, null, 2),
      {
        cacheControl: 'no-store, max-age=0',
        contentType: 'application/json; charset=utf-8',
        resumable: false,
      },
    );

    res.status(200).json({ saved: jobs.length });
    return;
  }

  res
    .status(400)
    .json({ error: `Unsupported processing jobs action: ${action}.` });
};

const getExistingMaxNumber = async (publicBucket, photos, category) => {
  const idPattern = new RegExp(`^${category}-(\\d+)$`);
  const filePattern = new RegExp(
    `^photos/${category}/${category}-(\\d+)\\.jpg$`,
  );
  let maxNumber = 0;

  photos.forEach((photo) => {
    const id = toCleanString(photo && photo.id);
    const match = id.match(idPattern);

    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  });

  const [files] = await publicBucket.getFiles({
    prefix: `photos/${category}/`,
  });

  files.forEach((file) => {
    const match = file.name.match(filePattern);

    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  });

  return maxNumber;
};

const formatNumber = (value, digits = 1) => {
  const fixed = Number(value).toFixed(digits);

  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const formatFocalLength = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'number') {
    return `${formatNumber(value)}mm`;
  }

  const text = toCleanString(String(value));

  return text && !/mm$/i.test(text) ? `${text}mm` : text;
};

const formatAperture = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'number') {
    return `f/${formatNumber(value, 1)}`;
  }

  const text = toCleanString(String(value));

  return text && !/^f\//i.test(text) ? `f/${text}` : text;
};

const formatShutterSpeed = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'number') {
    if (value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }

    return `${formatNumber(value, 1)}s`;
  }

  const text = toCleanString(String(value));

  return text && !/s$/i.test(text) ? `${text}s` : text;
};

const getExposureTime = (exif) => {
  if (exif.ExposureTime) {
    return exif.ExposureTime;
  }

  if (typeof exif.ShutterSpeedValue === 'number') {
    return 1 / 2 ** exif.ShutterSpeedValue;
  }

  return '';
};

const formatExifDate = (value) => {
  if (!value) {
    return '';
  }

  const pad = (number) => String(number).padStart(2, '0');

  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
      value.getDate(),
    )} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(
      value.getSeconds(),
    )}`;
  }

  return toCleanString(String(value)).replace(
    /^(\d{4}):(\d{2}):(\d{2})/,
    '$1-$2-$3',
  );
};

const formatCamera = (exif) => {
  const make = toCleanString(exif.Make);
  const model = toCleanString(exif.Model);

  if (make && model && !model.toLowerCase().includes(make.toLowerCase())) {
    return `${make} ${model}`;
  }

  return model || make;
};

const extractExif = async (buffer) => {
  try {
    const exif =
      (await exifr.parse(buffer, {
        exif: true,
        ifd0: true,
        interop: true,
        tiff: true,
      })) || {};

    return {
      aperture: formatAperture(exif.FNumber || exif.ApertureValue),
      camera: formatCamera(exif),
      dateTaken: formatExifDate(
        exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate,
      ),
      focalLength: formatFocalLength(exif.FocalLength),
      iso: toCleanString(String(exif.ISO || exif.ISOSpeedRatings || '')),
      lens: toCleanString(exif.LensModel || exif.Lens || exif.LensInfo),
      shutterSpeed: formatShutterSpeed(getExposureTime(exif)),
    };
  } catch (_error) {
    return {
      aperture: '',
      camera: '',
      dateTaken: '',
      focalLength: '',
      iso: '',
      lens: '',
      shutterSpeed: '',
    };
  }
};

const createJpegVariants = async (buffer) => {
  const base = sharp(buffer, {
    failOn: 'none',
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();

  const [large, thumbnail] = await Promise.all([
    base
      .clone()
      .resize({
        fit: 'inside',
        height: LARGE_SIZE,
        width: LARGE_SIZE,
        withoutEnlargement: true,
      })
      .jpeg({
        mozjpeg: true,
        quality: 90,
      })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({
        fit: 'inside',
        height: THUMBNAIL_SIZE,
        width: THUMBNAIL_SIZE,
        withoutEnlargement: true,
      })
      .jpeg({
        mozjpeg: true,
        quality: 82,
      })
      .toBuffer({ resolveWithObject: true }),
  ]);

  return {
    height: large.info.height,
    largeBuffer: large.data,
    thumbnailBuffer: thumbnail.data,
    width: large.info.width,
  };
};

const uploadJpeg = async (bucket, objectName, buffer) => {
  await bucket.file(objectName).save(buffer, {
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: 'image/jpeg',
    resumable: false,
  });
};

const listIncomingImages = async (incomingBucket) => {
  const [files] = await incomingBucket.getFiles({
    prefix: INCOMING_PREFIX,
  });

  return files
    .filter((file) => IMAGE_EXTENSIONS.test(file.name))
    .filter((file) => !file.name.endsWith('.json'))
    .sort((first, second) => first.name.localeCompare(second.name));
};

const isIncomingReviewObject = (objectName) =>
  objectName.startsWith(INCOMING_PREFIX) &&
  (IMAGE_EXTENSIONS.test(objectName) || objectName.endsWith('.json'));

const createPreviewUrl = async (file) => {
  try {
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + IMPORT_REVIEW_SIGNED_URL_TTL_MS,
    });

    return url;
  } catch (_error) {
    return '';
  }
};

const listIncomingReviewObjects = async (incomingBucket) => {
  const [files] = await incomingBucket.getFiles({
    prefix: INCOMING_PREFIX,
  });

  const reviewFiles = files
    .filter((file) => isIncomingReviewObject(file.name))
    .sort((first, second) => first.name.localeCompare(second.name));

  return Promise.all(
    reviewFiles.map(async (file) => {
      const [metadata] = await file.getMetadata();
      const object = {
        contentType: toCleanString(metadata.contentType),
        name: file.name,
        size: Number(metadata.size) || 0,
        updated: toCleanString(metadata.updated || metadata.timeCreated),
      };

      if (!IMAGE_EXTENSIONS.test(file.name)) {
        return object;
      }

      const previewUrl = await createPreviewUrl(file);

      return previewUrl ? { ...object, previewUrl } : object;
    }),
  );
};

const normalizeImportReviewObjectPaths = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.startsWith(INCOMING_PREFIX))
        .filter((item) => !item.includes('..'))
        .filter((item) => isIncomingReviewObject(item)),
    ),
  );
};

const archiveImportReviewObjects = async (incomingBucket, objectPaths) => {
  const archived = [];

  for (const objectPath of normalizeImportReviewObjectPaths(objectPaths)) {
    const file = incomingBucket.file(objectPath);
    // eslint-disable-next-line no-await-in-loop
    const [exists] = await file.exists();

    if (!exists) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await moveFile(incomingBucket, objectPath, getFailedName(objectPath));
    archived.push(objectPath);
  }

  return archived;
};

const handleImportReviewAction = async ({ body, incomingBucket, res }) => {
  const importReviewAction = toCleanString(body.importReviewAction);

  if (importReviewAction === 'list') {
    const objects = await listIncomingReviewObjects(incomingBucket);

    res.status(200).json({ objects });
    return;
  }

  if (importReviewAction === 'archive') {
    const archived = await archiveImportReviewObjects(
      incomingBucket,
      body.objectPaths,
    );

    res.status(200).json({ archived, archivedCount: archived.length });
    return;
  }

  res
    .status(400)
    .json({ error: `Unsupported import review action: ${importReviewAction}.` });
};

const normalizeObjectPaths = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.startsWith(INCOMING_PREFIX))
    .filter((item) => IMAGE_EXTENSIONS.test(item))
    .filter((item) => !item.endsWith('.json'));
};

const getExplicitIncomingImages = async (incomingBucket, objectPaths) => {
  const uniquePaths = Array.from(new Set(objectPaths));
  const files = [];

  for (const objectPath of uniquePaths) {
    const file = incomingBucket.file(objectPath);
    // eslint-disable-next-line no-await-in-loop
    const [exists] = await file.exists();

    if (exists) {
      files.push(file);
    } else {
      files.push({
        missing: true,
        name: objectPath,
      });
    }
  }

  return files;
};

const processOneImage = async ({
  imageFile,
  incomingBucket,
  nextNumbersByCategory,
  photos,
  publicBucket,
}) => {
  const category = getCategoryFromObjectName(imageFile.name);

  if (!ALLOWED_CATEGORIES.has(category)) {
    await safeMoveToFailed(
      incomingBucket,
      imageFile.name,
      `${imageFile.name}.json`,
      `Invalid category: ${category || '(missing)'}`,
    );
    return {
      error: `Invalid category: ${category || '(missing)'}`,
      image: imageFile.name,
      status: 'failed',
    };
  }

  const sidecarName = `${imageFile.name}.json`;
  const [sidecarExists] = await incomingBucket.file(sidecarName).exists();

  if (!sidecarExists) {
    await safeMoveToFailed(
      incomingBucket,
      imageFile.name,
      sidecarName,
      'Missing sidecar JSON.',
    );
    return {
      error: 'Missing sidecar JSON.',
      image: imageFile.name,
      status: 'failed',
    };
  }

  const processingImageName = getProcessingName(imageFile.name);
  const processingJsonName = `${processingImageName}.json`;
  const incomingLiveVideoName = await findLiveVideoName(
    incomingBucket,
    imageFile.name,
  );
  const processingLiveVideoName = incomingLiveVideoName
    ? getProcessingName(incomingLiveVideoName)
    : '';
  let outputPhotoPath = '';
  let outputThumbnailPath = '';
  let outputVideoPath = '';
  let movedToProcessing = false;
  let liveVideoMovedToProcessing = false;
  let recordAdded = false;

  try {
    await movePair(
      incomingBucket,
      imageFile.name,
      sidecarName,
      processingImageName,
    );
    movedToProcessing = true;

    if (incomingLiveVideoName) {
      await moveObjectWithOptionalSidecar(
        incomingBucket,
        incomingLiveVideoName,
        processingLiveVideoName,
      );
      liveVideoMovedToProcessing = true;
    }

    const processingImageFile = incomingBucket.file(processingImageName);
    const processingJsonFile = incomingBucket.file(processingJsonName);
    const [imageBuffer] = await processingImageFile.download();
    const sidecar = await downloadJson(processingJsonFile, {});
    const exif = await extractExif(imageBuffer);
    const variant = await createJpegVariants(imageBuffer);
    const nextNumber = (nextNumbersByCategory[category] || 0) + 1;
    const id = `${category}-${padNumber(nextNumber)}`;

    nextNumbersByCategory[category] = nextNumber;
    outputPhotoPath = `photos/${category}/${id}.jpg`;
    outputThumbnailPath = `thumbnails/${category}/${id}.jpg`;

    await uploadJpeg(publicBucket, outputPhotoPath, variant.largeBuffer);
    await uploadJpeg(
      publicBucket,
      outputThumbnailPath,
      variant.thumbnailBuffer,
    );

    if (processingLiveVideoName) {
      const videoExtension =
        path.posix.extname(processingLiveVideoName).toLowerCase() || '.mov';

      outputVideoPath = `videos/${category}/${id}${videoExtension}`;
      await copyLiveVideoToPublic(
        incomingBucket.file(processingLiveVideoName),
        publicBucket,
        outputVideoPath,
      );
    }

    const record = {
      id,
      title: toCleanString(sidecar.title) || id,
      category,
      src: `/${outputPhotoPath}`,
      thumbnail: `/${outputThumbnailPath}`,
      description: toCleanString(sidecar.description),
      location: toCleanString(sidecar.location),
      date: toCleanString(sidecar.date),
      camera: exif.camera,
      lens: exif.lens,
      focalLength: exif.focalLength,
      aperture: exif.aperture,
      shutterSpeed: exif.shutterSpeed,
      iso: exif.iso,
      dateTaken: exif.dateTaken,
      width: variant.width,
      height: variant.height,
      ...(outputVideoPath
        ? {
            video: {
              type: 'live-photo',
              videoUrl: `/${outputVideoPath}`,
              s3Key: outputVideoPath,
            },
          }
        : {}),
    };

    photos.push(record);
    recordAdded = true;
    await savePhotosJson(publicBucket, photos);

    await movePair(
      incomingBucket,
      processingImageName,
      processingJsonName,
      getProcessedName(processingImageName).replace(
        /^processed\/processing\//,
        'processed/',
      ),
    );

    if (processingLiveVideoName) {
      await moveObjectWithOptionalSidecar(
        incomingBucket,
        processingLiveVideoName,
        getProcessedName(processingLiveVideoName).replace(
          /^processed\/processing\//,
          'processed/',
        ),
      );
    }

    return {
      id,
      image: imageFile.name,
      livePhoto: Boolean(outputVideoPath),
      status: 'processed',
    };
  } catch (error) {
    if (recordAdded) {
      photos.pop();
      nextNumbersByCategory[category] -= 1;
    }

    await Promise.allSettled([
      outputPhotoPath ? publicBucket.file(outputPhotoPath).delete() : undefined,
      outputThumbnailPath
        ? publicBucket.file(outputThumbnailPath).delete()
        : undefined,
      outputVideoPath ? publicBucket.file(outputVideoPath).delete() : undefined,
    ]);

    await safeMoveToFailed(
      incomingBucket,
      movedToProcessing ? processingImageName : imageFile.name,
      movedToProcessing ? processingJsonName : sidecarName,
      error instanceof Error ? error.message : 'Unknown processing error.',
    );

    if (incomingLiveVideoName || processingLiveVideoName) {
      await safeMoveObjectWithOptionalSidecarToFailed(
        incomingBucket,
        liveVideoMovedToProcessing
          ? processingLiveVideoName
          : incomingLiveVideoName,
      );
    }

    return {
      error:
        error instanceof Error ? error.message : 'Unknown processing error.',
      image: imageFile.name,
      status: 'failed',
    };
  }
};

exports.processIncoming = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized processing request.' });
    return;
  }

  const incomingBucketName =
    process.env.INCOMING_BUCKET || 'shane-photos-incoming';
  const publicBucketName = process.env.PUBLIC_BUCKET || 'shane-photos';
  const maxItems = Math.max(1, Number(process.env.MAX_ITEMS_PER_RUN) || 20);
  const incomingBucket = storage.bucket(incomingBucketName);
  const publicBucket = storage.bucket(publicBucketName);
  const body = getJsonBody(req);

  if (toCleanString(body.importReviewAction)) {
    await handleImportReviewAction({ body, incomingBucket, res });
    return;
  }

  if (toCleanString(body.cmsAction)) {
    await handleCmsMutation({ body, publicBucket, res });
    return;
  }

  if (toCleanString(body.processingJobsAction) || body.processingJobs) {
    await handleProcessingJobsMutation({ body, publicBucket, res });
    return;
  }

  const requestedObjectPaths = normalizeObjectPaths(body.objectPaths);
  const photos = await readPhotosJson(publicBucket);
  const categories = Array.from(ALLOWED_CATEGORIES);
  const nextNumbersByCategory = {};

  await Promise.all(
    categories.map(async (category) => {
      nextNumbersByCategory[category] = await getExistingMaxNumber(
        publicBucket,
        photos,
        category,
      );
    }),
  );

  const incomingImages =
    requestedObjectPaths.length > 0
      ? (
          await getExplicitIncomingImages(incomingBucket, requestedObjectPaths)
        ).slice(0, maxItems)
      : (await listIncomingImages(incomingBucket)).slice(0, maxItems);
  const results = [];

  for (const imageFile of incomingImages) {
    if (imageFile.missing) {
      results.push({
        error: 'Incoming object was not found.',
        image: imageFile.name,
        status: 'failed',
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    // Serial processing keeps category numbering stable in one function run.
    // eslint-disable-next-line no-await-in-loop
    const result = await processOneImage({
      imageFile,
      incomingBucket,
      nextNumbersByCategory,
      photos,
      publicBucket,
    });

    results.push(result);
  }

  res.status(200).json({
    failed: results.filter((result) => result.status === 'failed').length,
    mode: requestedObjectPaths.length > 0 ? 'objectPaths' : 'scan',
    processed: results.filter((result) => result.status === 'processed').length,
    results,
    scanned: incomingImages.length,
  });
};
