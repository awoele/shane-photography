const path = require('node:path');

const { Storage } = require('@google-cloud/storage');

const ALLOWED_CATEGORIES = [
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
];

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
]);

const storage = new Storage();
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_COMPOSE_SOURCES = 32;

const toCleanString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const toPositiveInteger = (value) => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : '';
};

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

const extensionFromContentType = (contentType) => {
  if (contentType === 'image/jpeg') {
    return '.jpg';
  }

  if (contentType === 'image/png') {
    return '.png';
  }

  if (contentType === 'image/webp') {
    return '.webp';
  }

  if (contentType === 'image/heic') {
    return '.heic';
  }

  if (contentType === 'image/heif') {
    return '.heif';
  }

  if (contentType === 'video/quicktime') {
    return '.mov';
  }

  if (contentType === 'video/mp4') {
    return '.mp4';
  }

  return '.jpg';
};

const sanitizeBaseName = (value, fallback = 'photo') =>
  (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;

const sanitizeFilename = (filename, contentType) => {
  const basename = path.basename((filename || 'photo').replace(/\\/g, '/'));
  const originalExtension = path.extname(basename).toLowerCase();
  const safeExtension = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
    '.mov',
    '.mp4',
  ].includes(originalExtension)
    ? originalExtension
    : extensionFromContentType(contentType);

  const nameWithoutExtension =
    originalExtension && basename.endsWith(originalExtension)
      ? basename.slice(0, -originalExtension.length)
      : basename;

  const safeName =
    nameWithoutExtension
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'photo';

  return `${safeName}${safeExtension}`;
};

const createObjectPath = ({
  batchId,
  category,
  contentType,
  filename,
  livePhotoPairKey,
}) => {
  const safeFilename = sanitizeFilename(filename, contentType);
  const extension = path.extname(safeFilename) || extensionFromContentType(contentType);

  if (livePhotoPairKey) {
    const cleanPairKey = sanitizeBaseName(livePhotoPairKey);
    const cleanBatchId = batchId
      ? sanitizeBaseName(batchId)
      : createTimestamp();

    return `incoming/${category}/${cleanBatchId}-${cleanPairKey}${extension}`;
  }

  return `incoming/${category}/${createTimestamp()}-${safeFilename}`;
};

const isAuthorized = (req) => {
  const expectedSecret = process.env.UPLOAD_FUNCTION_SECRET;
  const authHeader = req.get('authorization') || '';
  const headerSecret = req.get('x-upload-function-secret') || '';

  return (
    expectedSecret &&
    (authHeader === `Bearer ${expectedSecret}` || headerSecret === expectedSecret)
  );
};

const getHeader = (req, name) => toCleanString(req.get(name));

const isSafeIncomingObjectPath = (value) =>
  /^incoming\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(value) &&
  !value.includes('..') &&
  !value.endsWith('.json');

const sanitizeUploadId = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

const readRawBody = (req) => {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  return Buffer.alloc(0);
};

const deleteFilesQuietly = async (bucket, objectNames) => {
  await Promise.all(
    objectNames.map((objectName) =>
      bucket
        .file(objectName)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined),
    ),
  );
};

const composeObjectParts = async ({
  bucket,
  contentType,
  objectPath,
  sourceNames,
  uploadId,
}) => {
  let currentSourceNames = sourceNames;
  const intermediateNames = [];
  let level = 0;

  while (currentSourceNames.length > MAX_COMPOSE_SOURCES) {
    const nextSourceNames = [];

    for (let index = 0; index < currentSourceNames.length; index += MAX_COMPOSE_SOURCES) {
      const group = currentSourceNames.slice(index, index + MAX_COMPOSE_SOURCES);
      const intermediateName = `incoming-chunks/${uploadId}/compose-${level}-${String(
        nextSourceNames.length,
      ).padStart(4, '0')}`;

      await bucket.combine(
        group.map((sourceName) => bucket.file(sourceName)),
        bucket.file(intermediateName),
      );

      nextSourceNames.push(intermediateName);
      intermediateNames.push(intermediateName);
    }

    currentSourceNames = nextSourceNames;
    level += 1;
  }

  await bucket.combine(
    currentSourceNames.map((sourceName) => bucket.file(sourceName)),
    bucket.file(objectPath),
  );
  await bucket.file(objectPath).setMetadata({
    contentType,
  });
  await deleteFilesQuietly(bucket, [...sourceNames, ...intermediateNames]);
};

const handleChunkedUpload = async (req, res, bucketName) => {
  const action = getHeader(req, 'x-upload-action') || 'chunk';
  const objectPath = getHeader(req, 'x-upload-object-path');
  const uploadId = sanitizeUploadId(getHeader(req, 'x-upload-id'));
  const contentType = getHeader(req, 'x-upload-content-type').toLowerCase();
  const chunkIndex = Number(getHeader(req, 'x-upload-chunk-index'));
  const totalChunks = Number(getHeader(req, 'x-upload-total-chunks'));

  if (!isSafeIncomingObjectPath(objectPath)) {
    res.status(400).json({ error: 'Invalid upload object path.' });
    return true;
  }

  if (!uploadId) {
    res.status(400).json({ error: 'Upload ID is required.' });
    return true;
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ error: 'Invalid upload content type.' });
    return true;
  }

  if (
    !Number.isInteger(totalChunks) ||
    totalChunks <= 0 ||
    totalChunks > 256
  ) {
    res.status(400).json({ error: 'Invalid upload chunk count.' });
    return true;
  }

  const bucket = storage.bucket(bucketName);

  if (action === 'complete') {
    const sourceNames = Array.from({ length: totalChunks }, (_, index) =>
      `incoming-chunks/${uploadId}/part-${String(index).padStart(6, '0')}`,
    );

    try {
      await composeObjectParts({
        bucket,
        contentType,
        objectPath,
        sourceNames,
        uploadId,
      });

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Could not complete chunked upload.', error);
      res.status(500).json({ error: 'Could not complete chunked upload.' });
    }

    return true;
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
    res.status(400).json({ error: 'Invalid upload chunk index.' });
    return true;
  }

  const body = readRawBody(req);

  if (body.length === 0 || body.length > MAX_CHUNK_BYTES) {
    res.status(413).json({ error: 'Upload chunk is empty or too large.' });
    return true;
  }

  const chunkName = `incoming-chunks/${uploadId}/part-${String(chunkIndex).padStart(
    6,
    '0',
  )}`;

  try {
    await bucket.file(chunkName).save(body, {
      contentType: 'application/octet-stream',
      resumable: false,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Could not save upload chunk.', error);
    res.status(500).json({ error: 'Could not save upload chunk.' });
  }

  return true;
};

exports.createUploadUrl = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized upload function request.' });
    return;
  }

  const bucketName = process.env.INCOMING_BUCKET || 'shane-photos-incoming';

  if (getHeader(req, 'x-upload-action')) {
    await handleChunkedUpload(req, res, bucketName);
    return;
  }

  const body = req.body || {};
  const filename = toCleanString(body.filename);
  const contentType = toCleanString(body.contentType).toLowerCase();
  const category = toCleanString(body.category).toLowerCase();

  if (!filename) {
    res.status(400).json({ error: 'Filename is required.' });
    return;
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ error: 'Only image and Live Photo video files can be uploaded.' });
    return;
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'Invalid photo category.' });
    return;
  }

  try {
    const bucket = storage.bucket(bucketName);
    const objectPath = createObjectPath({
      batchId: toCleanString(body.batchId),
      category,
      contentType,
      filename,
      livePhotoPairKey: toCleanString(body.livePhotoPairKey),
    });
    const metadataPath = `${objectPath}.json`;
    const uploadedAt = new Date().toISOString();

    await bucket.file(metadataPath).save(
      JSON.stringify(
        {
          batchId: toCleanString(body.batchId),
          batchIndex: toPositiveInteger(body.batchIndex),
          category,
          title: toCleanString(body.title),
          location: toCleanString(body.location),
          description: toCleanString(body.description),
          livePhotoPairKey: toCleanString(body.livePhotoPairKey),
          originalFilename: filename,
          role: toCleanString(body.role),
          uploadedAt,
        },
        null,
        2,
      ),
      {
        contentType: 'application/json; charset=utf-8',
        resumable: false,
      },
    );

    const [signedUrl] = await bucket.file(objectPath).getSignedUrl({
      action: 'write',
      contentType,
      expires: Date.now() + 15 * 60 * 1000,
      version: 'v4',
    });

    res.status(200).json({
      metadataPath,
      objectPath,
      signedUrl,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Could not create upload URL.' });
  }
};
