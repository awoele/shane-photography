import type { NextApiRequest, NextApiResponse } from 'next';

import {
  bulkUpdateCmsPhotos,
  type CmsBulkSequenceInput,
  type CmsBulkUpdateInput,
  type CmsPhotoPatch,
  type CmsPhotoStatus,
  deleteCmsPhotos,
  restoreCmsPhotos,
  sequenceCmsPhotos,
} from '@/lib/server/photoCms';

type BulkResponse =
  | {
      deleted?: number;
      updated: number;
    }
  | {
      error: string;
    };

type BulkAction = 'patch' | 'restore' | 'sequence';

const toPatch = (value: unknown): CmsPhotoPatch => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const { status } = record;
  const sortOrder =
    typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
      ? record.sortOrder
      : undefined;
  const nextStatus =
    status === 'draft' || status === 'hidden' || status === 'published'
      ? (status as CmsPhotoStatus)
      : undefined;

  return {
    ...(typeof record.category === 'string'
      ? { category: record.category }
      : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
  };
};

const toAction = (value: unknown): BulkAction =>
  value === 'restore' || value === 'sequence' ? value : 'patch';

const toNumberInput = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const toInput = (
  body: unknown,
):
  | (CmsBulkUpdateInput & {
      action: BulkAction;
      sequence: CmsBulkSequenceInput;
    })
  | null => {
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
    action: toAction(record.action),
    ids,
    patch: toPatch(record.patch),
    sequence: {
      ids,
      sortStart: toNumberInput(record.sortStart),
      titlePrefix:
        typeof record.titlePrefix === 'string'
          ? record.titlePrefix.trim()
          : undefined,
      titleStart: toNumberInput(record.titleStart),
    },
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

    if (input.action === 'restore') {
      const result = await restoreCmsPhotos(input.ids);

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json(result);
      return;
    }

    if (input.action === 'sequence') {
      const result = await sequenceCmsPhotos(input.sequence);

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json(result);
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
