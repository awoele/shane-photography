import type { NextApiRequest, NextApiResponse } from 'next';

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
] as const;

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

type CreateUploadUrlRequest = {
  adminPassword?: unknown;
  batchId?: unknown;
  batchIndex?: unknown;
  category?: unknown;
  contentType?: unknown;
  description?: unknown;
  filename?: unknown;
  location?: unknown;
  password?: unknown;
  title?: unknown;
};

type UploadFunctionResponse =
  | {
      metadataPath: string;
      objectPath: string;
      signedUrl: string;
    }
  | {
      error: string;
    };

type CreateUploadUrlResponse = UploadFunctionResponse;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

const toCleanString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const isAllowedCategory = (value: string): value is AllowedCategory =>
  ALLOWED_CATEGORIES.includes(value as AllowedCategory);

const getFunctionError = async (response: Response) => {
  try {
    const data = (await response.json()) as UploadFunctionResponse;

    if ('error' in data) {
      return data.error;
    }
  } catch (_error) {
    // Cloud Functions may return a non-JSON platform error.
  }

  return `Upload function failed with status ${response.status}.`;
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<CreateUploadUrlResponse>,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body = req.body as CreateUploadUrlRequest;
  const inputPassword = String(
    body.password ?? body.adminPassword ?? '',
  ).trim();
  const expectedPassword = String(
    process.env.ADMIN_UPLOAD_PASSWORD ?? '',
  ).trim();

  // eslint-disable-next-line no-console
  console.log('Upload password debug:', {
    expectedPasswordLength: expectedPassword.length,
    hasExpectedPassword: expectedPassword.length > 0,
    inputPasswordLength: inputPassword.length,
  });

  if (!expectedPassword) {
    res.status(500).json({ error: 'ADMIN_UPLOAD_PASSWORD is not configured' });
    return;
  }

  if (inputPassword !== expectedPassword) {
    res.status(401).json({ error: 'Invalid admin password.' });
    return;
  }

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

  if (!isAllowedCategory(category)) {
    res.status(400).json({ error: 'Invalid photo category.' });
    return;
  }

  const uploadFunctionUrl = process.env.UPLOAD_FUNCTION_URL;
  const uploadFunctionSecret = process.env.UPLOAD_FUNCTION_SECRET;

  if (!uploadFunctionUrl || !uploadFunctionSecret) {
    res.status(500).json({ error: 'Upload service is not configured.' });
    return;
  }

  try {
    const functionResponse = await fetch(uploadFunctionUrl, {
      body: JSON.stringify({
        batchId: toCleanString(body.batchId),
        batchIndex:
          typeof body.batchIndex === 'number' ? body.batchIndex : undefined,
        category,
        contentType,
        description: toCleanString(body.description),
        filename,
        location: toCleanString(body.location),
        title: toCleanString(body.title),
      }),
      headers: {
        Authorization: `Bearer ${uploadFunctionSecret}`,
        'Content-Type': 'application/json',
        'X-Upload-Function-Secret': uploadFunctionSecret,
      },
      method: 'POST',
    });

    if (!functionResponse.ok) {
      res
        .status(functionResponse.status === 401 ? 502 : functionResponse.status)
        .json({ error: await getFunctionError(functionResponse) });
      return;
    }

    const data = (await functionResponse.json()) as UploadFunctionResponse;

    if ('error' in data) {
      res.status(502).json({ error: data.error });
      return;
    }

    res.status(200).json(data);
  } catch (_error) {
    res.status(502).json({ error: 'Could not reach upload service.' });
  }
};

export default handler;
