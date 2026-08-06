import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Photo } from '../photos';
import { fetchManagedManifest, fetchManagedPhotoSet } from './photoCmsManifest';

const buildPhoto = (
  id: string,
  status: 'draft' | 'hidden' | 'published',
): Photo & { status: string } => ({
  aperture: '',
  camera: '',
  category: 'portrait',
  date: '2026-01-01',
  dateTaken: '2026-01-01T10:00:00',
  description: '',
  focalLength: '',
  height: 1200,
  id,
  iso: '',
  lens: '',
  location: '',
  shutterSpeed: '',
  src: `https://example.com/photos/${id}.jpg`,
  status,
  thumbnail: `https://example.com/thumbs/${id}.jpg`,
  title: id,
  width: 1800,
});

const withCmsFile = async <T>(
  records: unknown[],
  run: (filePath: string) => Promise<T>,
) => {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-cms-manifest-'));
  const filePath = path.join(root, 'photo-cms.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
  const previousPath = process.env.PHOTO_CMS_DATA_FILE;
  process.env.PHOTO_CMS_DATA_FILE = filePath;

  try {
    return await run(filePath);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PHOTO_CMS_DATA_FILE;
    } else {
      process.env.PHOTO_CMS_DATA_FILE = previousPath;
    }

    await rm(root, { force: true, recursive: true });
  }
};

test('fetchManagedManifest only exposes published CMS photos', async () => {
  await withCmsFile(
    [
      buildPhoto('draft-001', 'draft'),
      buildPhoto('published-001', 'published'),
      buildPhoto('hidden-001', 'hidden'),
    ],
    async () => {
      const manifest = await fetchManagedManifest();

      assert.deepEqual(
        manifest.data.map((photo) => photo.id),
        ['published-001'],
      );
    },
  );
});

test('fetchManagedPhotoSet returns public view models and loader data from CMS', async () => {
  await withCmsFile([buildPhoto('published-002', 'published')], async () => {
    const photoSet = await fetchManagedPhotoSet();

    assert.equal(photoSet.photos.length, 1);
    assert.equal(
      photoSet.loader.getPhoto('published-002')?.id,
      'published-002',
    );
    assert.equal(
      photoSet.manifest.data[0]?.originalUrl,
      photoSet.photos[0]?.src,
    );
  });
});

test('fetchManagedPhotoSet reuses the public manifest cache until cacheBust', async () => {
  await withCmsFile(
    [buildPhoto('published-003', 'published')],
    async (filePath) => {
      const first = await fetchManagedPhotoSet();

      await writeFile(
        filePath,
        JSON.stringify([buildPhoto('published-004', 'published')], null, 2),
        'utf8',
      );

      const cached = await fetchManagedPhotoSet();
      const refreshed = await fetchManagedPhotoSet({ cacheBust: true });

      assert.deepEqual(
        first.photos.map((photo) => photo.id),
        ['published-003'],
      );
      assert.deepEqual(
        cached.photos.map((photo) => photo.id),
        ['published-003'],
      );
      assert.deepEqual(
        refreshed.photos.map((photo) => photo.id),
        ['published-004'],
      );
    },
  );
});

test('fetchManagedManifest uses the cloud CMS list without fetching photos twice', async () => {
  const previousCloud = process.env.PHOTO_CMS_CLOUD;
  const previousFetch = globalThis.fetch;
  const previousLocalOverrides = process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES;
  const previousVercel = process.env.VERCEL;
  let photosJsonFetches = 0;

  process.env.PHOTO_CMS_CLOUD = 'true';
  process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES = 'false';
  process.env.VERCEL = '1';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('photo-cms-overrides')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (url.includes('photos.json')) {
      photosJsonFetches += 1;

      return new Response(
        JSON.stringify([buildPhoto('published-005', 'published')]),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ error: 'Unexpected URL' }), {
      status: 404,
    });
  }) as typeof fetch;

  try {
    const manifest = await fetchManagedManifest({ cacheBust: true });

    assert.deepEqual(
      manifest.data.map((photo) => photo.id),
      ['published-005'],
    );
    assert.equal(photosJsonFetches, 1);
  } finally {
    globalThis.fetch = previousFetch;

    if (previousCloud === undefined) {
      delete process.env.PHOTO_CMS_CLOUD;
    } else {
      process.env.PHOTO_CMS_CLOUD = previousCloud;
    }

    if (previousLocalOverrides === undefined) {
      delete process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES;
    } else {
      process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES = previousLocalOverrides;
    }

    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  }
});
