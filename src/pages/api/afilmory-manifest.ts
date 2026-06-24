import type { NextApiRequest, NextApiResponse } from 'next';

import type { AfilmoryManifest } from '@/lib/afilmoryTypes';

type ErrorResponse = {
  error: string;
};

const handler = async (
  _request: NextApiRequest,
  response: NextApiResponse<AfilmoryManifest | ErrorResponse>,
) => {
  try {
    const { fetchManagedManifest } = await import(
      '@/lib/server/photoCmsManifest'
    );
    const manifest = await fetchManagedManifest({ cacheBust: true });

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json(manifest);
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not build Afilmory manifest.',
    });
  }
};

export default handler;
