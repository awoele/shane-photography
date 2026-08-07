import type { NextApiRequest, NextApiResponse } from 'next';

import { listProcessingJobs, saveProcessingJobs } from '@/lib/server/photoCms';

type ProcessIncomingRequest = {
  adminPassword?: unknown;
  objectPaths?: unknown;
  password?: unknown;
};

type ProcessIncomingResponse =
  | {
      detail?: unknown;
      error?: string;
      failed?: number;
      processed?: number;
      scanned?: number;
      status?: number;
    }
  | Record<string, unknown>;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const PROCESS_CHUNK_SIZE = 20;

type ProcessingFunctionResult = {
  error: string;
  image: string;
  livePhoto: boolean;
  status: 'failed' | 'processed';
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 300,
};

const readResponseDetail = async (response: Response) => {
  const text = await response.text();

  if (!text) {
    return '';
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return text;
  }
};

const normalizeObjectPaths = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.startsWith('incoming/'))
    .filter((item) => IMAGE_EXTENSIONS.test(item))
    .filter((item) => !item.endsWith('.json'));
};

const getFilenameFromObjectPath = (objectPath: string) =>
  objectPath.split('/').pop() || objectPath;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const chunkObjectPaths = (objectPaths: string[]) => {
  if (objectPaths.length === 0) {
    return [objectPaths];
  }

  const chunks: string[][] = [];

  for (let index = 0; index < objectPaths.length; index += PROCESS_CHUNK_SIZE) {
    chunks.push(objectPaths.slice(index, index + PROCESS_CHUNK_SIZE));
  }

  return chunks;
};

const readProcessingResults = (detail: unknown): ProcessingFunctionResult[] => {
  if (!isRecord(detail) || !Array.isArray(detail.results)) {
    return [];
  }

  return detail.results
    .filter(isRecord)
    .map((item): ProcessingFunctionResult => {
      const status: ProcessingFunctionResult['status'] =
        item.status === 'failed' ? 'failed' : 'processed';

      return {
        error: typeof item.error === 'string' ? item.error : '',
        image: typeof item.image === 'string' ? item.image : '',
        livePhoto: item.livePhoto === true,
        status,
      };
    })
    .filter((item) => item.image);
};

const markJobs = async (
  objectPaths: string[],
  patch: {
    error: string;
    exifStatus: 'completed' | 'failed' | 'pending';
    livePhotoStatus: 'completed' | 'failed' | 'pending' | 'skipped';
    progress: number;
    stage: string;
    status: 'completed' | 'failed' | 'processing';
  },
) => {
  const jobs = await listProcessingJobs();
  const now = new Date().toISOString();
  const pathSet = new Set(objectPaths);
  const knownPaths = new Set(
    jobs.map((job) => job.objectPath).filter((item): item is string => !!item),
  );
  const mergedJobs = [
    ...jobs.map((job) =>
      job.objectPath && pathSet.has(job.objectPath)
        ? {
            ...job,
            ...patch,
            updatedAt: now,
          }
        : job,
    ),
  ];

  objectPaths
    .filter((objectPath) => !knownPaths.has(objectPath))
    .forEach((objectPath) => {
      mergedJobs.push({
        ...patch,
        createdAt: now,
        filename: getFilenameFromObjectPath(objectPath),
        id: objectPath,
        objectPath,
        thumbnail: '',
        updatedAt: now,
      });
    });

  await saveProcessingJobs(mergedJobs);
};

const markJobsFromProcessingDetail = async (
  objectPaths: string[],
  detail: unknown,
) => {
  const results = readProcessingResults(detail);

  if (results.length === 0) {
    await markJobs(objectPaths, {
      error: '',
      exifStatus: 'completed',
      livePhotoStatus: 'completed',
      progress: 100,
      stage: 'Completed',
      status: 'completed',
    });
    return;
  }

  const failedResults = results.filter((result) => result.status === 'failed');
  const completedWithLive = results
    .filter((result) => result.status === 'processed' && result.livePhoto)
    .map((result) => result.image);
  const completedWithoutLive = results
    .filter((result) => result.status === 'processed' && !result.livePhoto)
    .map((result) => result.image);
  const knownPaths = new Set(results.map((result) => result.image));
  const unknownCompleted = objectPaths.filter((item) => !knownPaths.has(item));

  if (completedWithLive.length > 0) {
    await markJobs(completedWithLive, {
      error: '',
      exifStatus: 'completed',
      livePhotoStatus: 'completed',
      progress: 100,
      stage: 'Completed',
      status: 'completed',
    });
  }

  if (completedWithoutLive.length > 0) {
    await markJobs(completedWithoutLive, {
      error: '',
      exifStatus: 'completed',
      livePhotoStatus: 'skipped',
      progress: 100,
      stage: 'Completed',
      status: 'completed',
    });
  }

  for (const result of failedResults) {
    // eslint-disable-next-line no-await-in-loop
    await markJobs([result.image], {
      error: result.error || '处理失败。',
      exifStatus: 'failed',
      livePhotoStatus: 'failed',
      progress: 100,
      stage: 'Failed',
      status: 'failed',
    });
  }

  if (unknownCompleted.length > 0) {
    await markJobs(unknownCompleted, {
      error: '',
      exifStatus: 'completed',
      livePhotoStatus: 'completed',
      progress: 100,
      stage: 'Completed',
      status: 'completed',
    });
  }
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<ProcessIncomingResponse>,
) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: '请求方法不允许。' });
    return;
  }

  const body = request.body as ProcessIncomingRequest;
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

  const objectPaths = normalizeObjectPaths(body.objectPaths);

  const processFunctionUrl = String(
    process.env.PROCESS_FUNCTION_URL ?? '',
  ).trim();
  const processFunctionSecret = String(
    process.env.PROCESS_FUNCTION_SECRET ??
      process.env.UPLOAD_FUNCTION_SECRET ??
      '',
  ).trim();

  if (!processFunctionUrl || !processFunctionSecret) {
    response.status(500).json({
      error: '处理服务地址或密钥未配置。',
    });
    return;
  }

  try {
    await markJobs(objectPaths, {
      error: '',
      exifStatus: 'pending',
      livePhotoStatus: 'pending',
      progress: 45,
      stage: 'Processing metadata',
      status: 'processing',
    });

    const chunks = chunkObjectPaths(objectPaths);
    const details: unknown[] = [];

    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      const functionResponse = await fetch(processFunctionUrl, {
        body: JSON.stringify({
          objectPaths: chunk,
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-process-function-secret': processFunctionSecret,
        },
        method: 'POST',
      });

      // eslint-disable-next-line no-await-in-loop
      const detail = await readResponseDetail(functionResponse);

      if (!functionResponse.ok) {
        // eslint-disable-next-line no-await-in-loop
        await markJobs(chunk, {
          error:
            typeof detail === 'string' ? detail : '处理服务返回了非 200 响应。',
          exifStatus: 'failed',
          livePhotoStatus: 'failed',
          progress: 100,
          stage: 'Failed',
          status: 'failed',
        });
        response.status(502).json({
          detail,
          error: '处理服务返回了非 200 响应。',
          status: functionResponse.status,
        });
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await markJobsFromProcessingDetail(chunk, detail);
      details.push(detail);
    }

    if (details.length === 1) {
      const [detail] = details;

      response
        .status(200)
        .json(
          typeof detail === 'object' && detail !== null
            ? (detail as Record<string, unknown>)
            : { detail },
        );
      return;
    }

    const records = details.filter(isRecord);
    const results = records.flatMap((detail) =>
      Array.isArray(detail.results) ? detail.results : [],
    );

    response.status(200).json({
      batches: details.length,
      failed: records.reduce((sum, detail) => sum + toCount(detail.failed), 0),
      mode: 'batched-objectPaths',
      processed: records.reduce(
        (sum, detail) => sum + toCount(detail.processed),
        0,
      ),
      results,
      scanned: records.reduce(
        (sum, detail) => sum + toCount(detail.scanned),
        0,
      ),
    });
  } catch (error) {
    await markJobs(objectPaths, {
      error: error instanceof Error ? error.message : '未知错误。',
      exifStatus: 'failed',
      livePhotoStatus: 'failed',
      progress: 100,
      stage: 'Failed',
      status: 'failed',
    });
    response.status(502).json({
      detail: error instanceof Error ? error.message : '未知错误。',
      error: '无法连接照片处理服务。',
      status: 502,
    });
  }
};

export default handler;
