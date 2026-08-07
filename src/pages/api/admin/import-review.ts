import type { NextApiRequest, NextApiResponse } from 'next';

import {
  createImportReviewSnapshot,
  type ImportReviewObject,
  type ImportReviewSnapshot,
} from '@/lib/server/importReview';

type ImportReviewResponse =
  | {
      archived?: string[];
      deleted?: string[];
      snapshot?: ImportReviewSnapshot;
    }
  | {
      detail?: unknown;
      error: string;
      status?: number;
    };

type FunctionListResponse = {
  error?: string;
  objects?: ImportReviewObject[];
};

type FunctionArchiveResponse = {
  archived?: string[];
  archivedCount?: number;
  error?: string;
};

type FunctionDeleteResponse = {
  deleted?: string[];
  deletedCount?: number;
  error?: string;
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

const getProcessFunctionConfig = () => {
  const processFunctionUrl = String(
    process.env.PROCESS_FUNCTION_URL ?? '',
  ).trim();
  const processFunctionSecret = String(
    process.env.PROCESS_FUNCTION_SECRET ??
      process.env.UPLOAD_FUNCTION_SECRET ??
      '',
  ).trim();

  return { processFunctionSecret, processFunctionUrl };
};

const callProcessFunction = async <ResponseBody>(
  body: Record<string, unknown>,
) => {
  const { processFunctionSecret, processFunctionUrl } =
    getProcessFunctionConfig();

  if (!processFunctionUrl || !processFunctionSecret) {
    throw new Error('处理服务地址或密钥未配置。');
  }

  const response = await fetch(processFunctionUrl, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-process-function-secret': processFunctionSecret,
    },
    method: 'POST',
  });
  const detail = await readResponseDetail(response);

  if (!response.ok) {
    return {
      detail,
      ok: false as const,
      status: response.status,
    };
  }

  return {
    body: detail as ResponseBody,
    ok: true as const,
  };
};

const fetchSnapshot = async () => {
  const result = await callProcessFunction<FunctionListResponse>({
    importReviewAction: 'list',
  });

  if (!result.ok) {
    return result;
  }

  if (result.body.error) {
    return {
      detail: result.body,
      ok: false as const,
      status: 502,
    };
  }

  return {
    ok: true as const,
    snapshot: createImportReviewSnapshot(result.body.objects ?? []),
  };
};

const normalizeArchivePaths = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.startsWith('incoming/'))
        .filter((item) => !item.includes('..')),
    ),
  );
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<ImportReviewResponse>,
) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: '请求方法不允许。' });
    return;
  }

  try {
    if (request.method === 'GET') {
      const result = await fetchSnapshot();

      if (!result.ok) {
        response.status(result.status ?? 502).json({
          detail: result.detail,
          error: '无法加载待导入确认。',
          status: result.status,
        });
        return;
      }

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json({ snapshot: result.snapshot });
      return;
    }

    const body =
      request.body && typeof request.body === 'object' ? request.body : {};
    const record = body as Record<string, unknown>;
    const action =
      typeof record.action === 'string' ? record.action.trim() : '';

    if (action !== 'archive' && action !== 'delete') {
      response.status(400).json({ error: '不支持的导入确认操作。' });
      return;
    }

    const objectPaths = normalizeArchivePaths(record.objectPaths);

    if (objectPaths.length === 0) {
      response.status(400).json({ error: '缺少对象路径。' });
      return;
    }

    const archiveResult = await callProcessFunction<
      FunctionArchiveResponse & FunctionDeleteResponse
    >({
      importReviewAction: action,
      objectPaths,
    });

    if (!archiveResult.ok) {
      response.status(archiveResult.status ?? 502).json({
        detail: archiveResult.detail,
        error:
          action === 'delete' ? '无法删除已上传对象。' : '无法归档待导入对象。',
        status: archiveResult.status,
      });
      return;
    }

    if (archiveResult.body.error) {
      response.status(502).json({
        detail: archiveResult.body,
        error: archiveResult.body.error,
        status: 502,
      });
      return;
    }

    const snapshotResult = await fetchSnapshot();

    if (!snapshotResult.ok) {
      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json({
        ...(action === 'delete'
          ? { deleted: archiveResult.body.deleted ?? [] }
          : { archived: archiveResult.body.archived ?? [] }),
      });
      return;
    }

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({
      ...(action === 'delete'
        ? { deleted: archiveResult.body.deleted ?? [] }
        : { archived: archiveResult.body.archived ?? [] }),
      snapshot: snapshotResult.snapshot,
    });
  } catch (error) {
    response.status(502).json({
      detail: error instanceof Error ? error.message : '未知错误。',
      error: '无法连接导入确认服务。',
      status: 502,
    });
  }
};

export default handler;
