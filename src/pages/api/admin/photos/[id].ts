import type { NextApiRequest, NextApiResponse } from 'next';

import {
  type CmsPhoto,
  type CmsPhotoPatch,
  type CmsPhotoStatus,
  deleteCmsPhotos,
  updateCmsPhoto,
} from '@/lib/server/photoCms';

type UpdatePhotoResponse =
  | {
      photo: CmsPhoto;
    }
  | {
      error: string;
    }
  | {
      deleted: number;
    };

const toPatch = (body: unknown): CmsPhotoPatch => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;
  const { status } = record;
  let sortOrder: number | undefined;

  if (
    typeof record.sortOrder === 'number' &&
    Number.isFinite(record.sortOrder)
  ) {
    sortOrder = record.sortOrder;
  } else if (typeof record.sortOrder === 'string') {
    sortOrder = Number.parseInt(record.sortOrder, 10);
  }

  const nextStatus =
    status === 'draft' || status === 'hidden' || status === 'published'
      ? (status as CmsPhotoStatus)
      : undefined;

  return {
    ...(typeof record.category === 'string'
      ? { category: record.category }
      : {}),
    ...(typeof record.date === 'string' ? { date: record.date } : {}),
    ...(typeof record.dateTaken === 'string'
      ? { dateTaken: record.dateTaken }
      : {}),
    ...(typeof record.description === 'string'
      ? { description: record.description }
      : {}),
    ...(typeof record.featured === 'boolean'
      ? { featured: record.featured }
      : {}),
    ...(typeof record.location === 'string'
      ? { location: record.location }
      : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(sortOrder !== undefined && Number.isFinite(sortOrder)
      ? { sortOrder }
      : {}),
    ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
  };
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<UpdatePhotoResponse>,
) => {
  if (request.method !== 'PATCH' && request.method !== 'DELETE') {
    response.setHeader('Allow', 'PATCH, DELETE');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const rawId = request.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    response.status(400).json({ error: 'Photo id is required.' });
    return;
  }

  try {
    if (request.method === 'DELETE') {
      const result = await deleteCmsPhotos([id]);

      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.status(200).json(result);
      return;
    }

    const photo = await updateCmsPhoto(id, toPatch(request.body));

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({ photo });
  } catch (error) {
    response.status(404).json({
      error: error instanceof Error ? error.message : 'Could not update photo.',
    });
  }
};

export default handler;
