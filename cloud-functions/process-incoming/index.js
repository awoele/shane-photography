const path = require('node:path');

const { Storage } = require('@google-cloud/storage');
const exifr = require('exifr');
const sharp = require('sharp');

const INCOMING_PREFIX = 'incoming/';
const PROCESSING_PREFIX = 'processing/';
const PROCESSED_PREFIX = 'processed/';
const FAILED_PREFIX = 'failed/';
const PHOTOS_JSON_PATH = 'data/photos.json';
const LARGE_SIZE = 2560;
const THUMBNAIL_SIZE = 800;
const MAX_INPUT_PIXELS = 500_000_000;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

const ALLOWED_CATEGORIES = new Set([
  'portrait',
  'nature',
  'beauty',
  'cute',
  'travel',
  'street',
  'mark',
]);

const storage = new Storage();

const toCleanString = (value) =>
  typeof value === 'string' ? value.trim() : '';

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
    (authHeader === `Bearer ${expectedSecret}` || headerSecret === expectedSecret)
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
  await publicBucket.file(PHOTOS_JSON_PATH).save(
    JSON.stringify(photos, null, 2),
    {
      cacheControl: 'public, max-age=60',
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    },
  );
};

const getExistingMaxNumber = async (publicBucket, photos, category) => {
  const idPattern = new RegExp(`^${category}-(\\d+)$`);
  const filePattern = new RegExp(`^photos/${category}/${category}-(\\d+)\\.jpg$`);
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
    const exif = (await exifr.parse(buffer, {
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
  let outputPhotoPath = '';
  let outputThumbnailPath = '';
  let movedToProcessing = false;
  let recordAdded = false;

  try {
    await movePair(
      incomingBucket,
      imageFile.name,
      sidecarName,
      processingImageName,
    );
    movedToProcessing = true;

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
    await uploadJpeg(publicBucket, outputThumbnailPath, variant.thumbnailBuffer);

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

    return {
      id,
      image: imageFile.name,
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
    ]);

    await safeMoveToFailed(
      incomingBucket,
      movedToProcessing ? processingImageName : imageFile.name,
      movedToProcessing ? processingJsonName : sidecarName,
      error instanceof Error ? error.message : 'Unknown processing error.',
    );

    return {
      error: error instanceof Error ? error.message : 'Unknown processing error.',
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

  const incomingImages = (await listIncomingImages(incomingBucket)).slice(
    0,
    maxItems,
  );
  const results = [];

  for (const imageFile of incomingImages) {
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
    processed: results.filter((result) => result.status === 'processed').length,
    results,
    scanned: incomingImages.length,
  });
};
