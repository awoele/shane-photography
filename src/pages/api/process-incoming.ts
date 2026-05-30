import type { NextApiRequest, NextApiResponse } from 'next';

type ProcessIncomingRequest = {
  adminPassword?: unknown;
  objectPaths?: unknown;
  password?: unknown;
};

type ProcessIncomingResponse =
  | {
      detail?: unknown;
      error?: string;
      status?: number;
    }
  | Record<string, unknown>;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
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
    .filter((item) => !item.endsWith('.json'));
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<ProcessIncomingResponse>,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body = req.body as ProcessIncomingRequest;
  const inputPassword = String(
    body.password ?? body.adminPassword ?? '',
  ).trim();
  const expectedPassword = String(
    process.env.ADMIN_UPLOAD_PASSWORD ?? '',
  ).trim();

  // eslint-disable-next-line no-console
  console.log('Process incoming password debug:', {
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

  const processFunctionUrl = String(
    process.env.PROCESS_FUNCTION_URL ?? '',
  ).trim();
  const processFunctionSecret = String(
    process.env.PROCESS_FUNCTION_SECRET ?? '',
  ).trim();

  if (!processFunctionUrl || !processFunctionSecret) {
    res.status(500).json({
      error:
        'PROCESS_FUNCTION_URL or PROCESS_FUNCTION_SECRET is not configured.',
    });
    return;
  }

  try {
    const objectPaths = normalizeObjectPaths(body.objectPaths);
    const functionResponse = await fetch(processFunctionUrl, {
      body: JSON.stringify({
        objectPaths,
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-process-function-secret': processFunctionSecret,
      },
      method: 'POST',
    });

    const detail = await readResponseDetail(functionResponse);

    if (!functionResponse.ok) {
      res.status(502).json({
        detail,
        error: 'process-incoming returned a non-200 response.',
        status: functionResponse.status,
      });
      return;
    }

    res
      .status(200)
      .json(
        typeof detail === 'object' && detail !== null
          ? (detail as Record<string, unknown>)
          : { detail },
      );
  } catch (error) {
    res.status(502).json({
      detail: error instanceof Error ? error.message : 'Unknown error.',
      error: 'Could not reach process-incoming function.',
      status: 502,
    });
  }
};

export default handler;
