import type { NextApiRequest, NextApiResponse } from 'next';

import { isSafeIncomingObjectPath } from '@/lib/uploadProxy';

type UploadChunkResponse =
  | {
      ok: true;
    }
  | {
      error: string;
    };

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

const readRequestBuffer = async (
  request: NextApiRequest,
  maxBytes = MAX_CHUNK_BYTES,
) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    request.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;

      if (receivedBytes > maxBytes) {
        reject(new Error('上传分片过大。'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

const getFunctionError = async (response: Response) => {
  try {
    const data = (await response.json()) as UploadChunkResponse;

    if ('error' in data) {
      return data.error;
    }
  } catch (_error) {
    // Cloud Functions may return a non-JSON platform error.
  }

  return `上传代理失败，状态码 ${response.status}。`;
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<UploadChunkResponse>,
) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: '请求方法不允许。' });
    return;
  }

  const inputPassword = getHeaderValue(
    request.headers['x-admin-upload-password'],
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

  const uploadFunctionUrl = process.env.UPLOAD_FUNCTION_URL;
  const uploadFunctionSecret = process.env.UPLOAD_FUNCTION_SECRET;

  if (!uploadFunctionUrl || !uploadFunctionSecret) {
    response.status(500).json({ error: '上传服务未配置。' });
    return;
  }

  const action = getHeaderValue(request.headers['x-upload-action']) || 'chunk';
  const objectPath = getHeaderValue(request.headers['x-upload-object-path']);

  if (!isSafeIncomingObjectPath(objectPath)) {
    response.status(400).json({ error: '上传对象路径无效。' });
    return;
  }

  let body: Buffer;

  try {
    body =
      action === 'complete'
        ? Buffer.alloc(0)
        : await readRequestBuffer(request);
  } catch (error) {
    response.status(413).json({
      error: error instanceof Error ? error.message : '上传分片过大。',
    });
    return;
  }

  try {
    const functionResponse = await fetch(uploadFunctionUrl, {
      body,
      headers: {
        Authorization: `Bearer ${uploadFunctionSecret}`,
        'Content-Type': 'application/octet-stream',
        'X-Upload-Action': action,
        'X-Upload-Chunk-Index': getHeaderValue(
          request.headers['x-upload-chunk-index'],
        ),
        'X-Upload-Content-Type': getHeaderValue(
          request.headers['x-upload-content-type'],
        ),
        'X-Upload-Function-Secret': uploadFunctionSecret,
        'X-Upload-Id': getHeaderValue(request.headers['x-upload-id']),
        'X-Upload-Object-Path': objectPath,
        'X-Upload-Total-Chunks': getHeaderValue(
          request.headers['x-upload-total-chunks'],
        ),
      },
      method: 'POST',
    });

    if (!functionResponse.ok) {
      response
        .status(functionResponse.status === 401 ? 502 : functionResponse.status)
        .json({ error: await getFunctionError(functionResponse) });
      return;
    }

    response.status(200).json({ ok: true });
  } catch (_error) {
    response.status(502).json({ error: '无法连接上传代理。' });
  }
};

export default handler;
