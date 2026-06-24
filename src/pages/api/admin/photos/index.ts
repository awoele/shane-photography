import type { NextApiRequest, NextApiResponse } from 'next';

import {
  type CmsPhoto,
  type CmsPhotoStatus,
  type CmsStats,
  getCmsStats,
  listCmsPhotos,
} from '@/lib/server/photoCms';

type AdminPhotosResponse =
  | {
      photos: CmsPhoto[];
      stats: CmsStats;
    }
  | {
      error: string;
    };

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getStatus = (value: string | string[] | undefined) => {
  const status = getQueryValue(value);

  return status === 'draft' || status === 'hidden' || status === 'published'
    ? (status as CmsPhotoStatus)
    : 'all';
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<AdminPhotosResponse>,
) => {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const photos = await listCmsPhotos({
      category: getQueryValue(request.query.category),
      query: getQueryValue(request.query.query),
      status: getStatus(request.query.status),
    });
    const stats = await getCmsStats();

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({ photos, stats });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not load managed photos.',
    });
  }
};

export default handler;
