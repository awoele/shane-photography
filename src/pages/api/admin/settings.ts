import type { NextApiRequest, NextApiResponse } from 'next';

import {
  type CmsPhotoStatus,
  type CmsSettings,
  getCmsSettings,
  refreshManifestCache,
  updateCmsSettings,
} from '@/lib/server/photoCms';

type SettingsResponse =
  | {
      settings: CmsSettings;
    }
  | {
      error: string;
    };

const isStatus = (value: unknown): value is CmsPhotoStatus =>
  value === 'draft' || value === 'hidden' || value === 'published';

const toPatch = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;

  return {
    ...(isStatus(record.defaultPublishStatus)
      ? { defaultPublishStatus: record.defaultPublishStatus }
      : {}),
    ...(typeof record.manifestCacheEnabled === 'boolean'
      ? { manifestCacheEnabled: record.manifestCacheEnabled }
      : {}),
    ...(typeof record.storageBucket === 'string'
      ? { storageBucket: record.storageBucket }
      : {}),
  };
};

const handler = async (
  request: NextApiRequest,
  response: NextApiResponse<SettingsResponse>,
) => {
  if (!['GET', 'PATCH', 'POST'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, PATCH, POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    let settings: CmsSettings;

    if (request.method === 'PATCH') {
      settings = await updateCmsSettings(toPatch(request.body));
    } else if (request.method === 'POST') {
      settings = await refreshManifestCache();
    } else {
      settings = await getCmsSettings();
    }

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({ settings });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error ? error.message : 'Could not update settings.',
    });
  }
};

export default handler;
