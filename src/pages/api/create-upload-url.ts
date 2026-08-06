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
  'video/mp4',
  'video/quicktime',
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
  livePhotoPairKey?: unknown;
  location?: unknown;
  password?: unknown;
  role?: unknown;
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

const sanitizePathSegment = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'photo';

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

  return `上传服务失败，状态码 ${response.status}。`;
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<CreateUploadUrlResponse>,
) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: '请求方法不允许。' });
    return;
  }

  const body = request.body as CreateUploadUrlRequest;
  const inputPassword = String(
    body.password ?? body.adminPassword ?? '',
  ).trim();
  const expectedPassword = String(
    process.env.ADMIN_UPLOAD_PASSWORD ?? '',
  ).trim();

  if (!expectedPassword) {
    response.status(500).json({ error: '后台上传密码未配置。' });
    return;
  }

  if (inputPassword !== expectedPassword) {
    response.status(401).json({ error: '后台密码不正确。' });
    return;
  }

  const filename = toCleanString(body.filename);
  const contentType = toCleanString(body.contentType).toLowerCase();
  const category = toCleanString(body.category).toLowerCase();
  const rawLivePhotoPairKey = toCleanString(body.livePhotoPairKey);

  if (!filename) {
    response.status(400).json({ error: '缺少文件名。' });
    return;
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    response.status(400).json({
      error: '只能上传图片或 Live Photo 视频文件。',
    });
    return;
  }

  if (!isAllowedCategory(category)) {
    response.status(400).json({ error: '照片分类无效。' });
    return;
  }

  const uploadFunctionUrl = process.env.UPLOAD_FUNCTION_URL;
  const uploadFunctionSecret = process.env.UPLOAD_FUNCTION_SECRET;

  if (!uploadFunctionUrl || !uploadFunctionSecret) {
    response.status(500).json({ error: '上传服务未配置。' });
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
        livePhotoPairKey: rawLivePhotoPairKey
          ? sanitizePathSegment(rawLivePhotoPairKey)
          : '',
        location: toCleanString(body.location),
        role: toCleanString(body.role),
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
      response
        .status(functionResponse.status === 401 ? 502 : functionResponse.status)
        .json({ error: await getFunctionError(functionResponse) });
      return;
    }

    const data = (await functionResponse.json()) as UploadFunctionResponse;

    if ('error' in data) {
      response.status(502).json({ error: data.error });
      return;
    }

    response.status(200).json(data);
  } catch (_error) {
    response.status(502).json({ error: '无法连接上传服务。' });
  }
};

export default handler;
