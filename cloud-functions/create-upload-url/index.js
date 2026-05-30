const path = require('node:path');

const { Storage } = require('@google-cloud/storage');

const ALLOWED_CATEGORIES = [
  'portrait',
  'nature',
  'beauty',
  'cute',
  'travel',
  'street',
  'mark',
];

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const storage = new Storage();

const toCleanString = (value) =>
  typeof value === 'string' ? value.trim() : '';

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

  return '.jpg';
};

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

const isAuthorized = (req) => {
  const expectedSecret = process.env.UPLOAD_FUNCTION_SECRET;
  const authHeader = req.get('authorization') || '';
  const headerSecret = req.get('x-upload-function-secret') || '';

  return (
    expectedSecret &&
    (authHeader === `Bearer ${expectedSecret}` || headerSecret === expectedSecret)
  );
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
  const body = req.body || {};
  const filename = toCleanString(body.filename);
  const contentType = toCleanString(body.contentType).toLowerCase();
  const category = toCleanString(body.category).toLowerCase();

  if (!filename) {
    res.status(400).json({ error: 'Filename is required.' });
    return;
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ error: 'Only image files can be uploaded.' });
    return;
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'Invalid photo category.' });
    return;
  }

  try {
    const bucket = storage.bucket(bucketName);
    const safeFilename = sanitizeFilename(filename, contentType);
    const objectPath = `incoming/${category}/${createTimestamp()}-${safeFilename}`;
    const metadataPath = `${objectPath}.json`;
    const uploadedAt = new Date().toISOString();

    await bucket.file(metadataPath).save(
      JSON.stringify(
        {
          category,
          title: toCleanString(body.title),
          location: toCleanString(body.location),
          description: toCleanString(body.description),
          originalFilename: filename,
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
