import type { NextApiRequest, NextApiResponse } from 'next';

import {
  addProcessingJob,
  type CmsProcessingJob,
  listProcessingJobs,
  retryProcessingJob,
} from '@/lib/server/photoCms';

type ProcessingResponse =
  | {
      job?: CmsProcessingJob;
      jobs?: CmsProcessingJob[];
    }
  | {
      error: string;
    };

const toStringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<ProcessingResponse>,
) => {
  if (!['GET', 'POST'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: '请求方法不允许。' });
    return;
  }

  try {
    if (request.method === 'GET') {
      const jobs = await listProcessingJobs();

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json({ jobs });
      return;
    }

    const body =
      request.body && typeof request.body === 'object' ? request.body : {};
    const record = body as Record<string, unknown>;
    const action = toStringValue(record.action);

    if (action === 'retry') {
      const job = await retryProcessingJob(toStringValue(record.id));

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json({ job });
      return;
    }

    const id = toStringValue(record.id);
    const filename = toStringValue(record.filename);

    if (!id || !filename) {
      response.status(400).json({ error: '缺少任务 ID 或文件名。' });
      return;
    }

    const job = await addProcessingJob({
      filename,
      id,
      objectPath: toStringValue(record.objectPath),
      stage: toStringValue(record.stage) || 'Uploaded',
      status: 'queued',
      thumbnail: toStringValue(record.thumbnail),
    });

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({ job });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : '无法更新处理队列。',
    });
  }
};

export default handler;
