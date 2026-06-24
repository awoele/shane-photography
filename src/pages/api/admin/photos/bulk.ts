import type { NextApiRequest, NextApiResponse } from 'next';

import {
  bulkUpdateCmsPhotos,
  type CmsBulkUpdateInput,
  type CmsPhotoPatch,
  type CmsPhotoStatus,
  deleteCmsPhotos,
} from '@/lib/server/photoCms';

type BulkResponse =
  | {
      deleted?: number;
      updated: number;
    }
  | {
      error: string;
    };

const toPatch = (value: unknown): CmsPhotoPatch => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const { status } = record;
  const nextStatus =
    status === 'draft' || status === 'hidden' || status === 'published'
      ? (status as CmsPhotoStatus)
      : undefined;

  return {
    ...(typeof record.category === 'string'
      ? { category: record.category }
      : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
  };
};

const toInput = (body: unknown): CmsBulkUpdateInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const ids = Array.isArray(record.ids)
    ? record.ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (ids.length === 0) {
    return null;
  }

  return {
    ids,
    patch: toPatch(record.patch),
  };
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<BulkResponse>,
) => {
  if (request.method !== 'PATCH' && request.method !== 'DELETE') {
    response.setHeader('Allow', 'PATCH, DELETE');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const input = toInput(request.body);

  if (!input) {
    response.status(400).json({ error: 'Photo ids are required.' });
    return;
  }

  try {
    if (request.method === 'DELETE') {
      const result = await deleteCmsPhotos(input.ids);

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json({ deleted: result.deleted, updated: 0 });
      return;
    }

    const result = await bulkUpdateCmsPhotos(input);

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json(result);
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error ? error.message : 'Could not update photos.',
    });
  }
};

export default handler;
