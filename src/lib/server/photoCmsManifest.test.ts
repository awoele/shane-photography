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

const withCmsFile = async <T>(records: unknown[], run: () => Promise<T>) => {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-cms-manifest-'));
  const filePath = path.join(root, 'photo-cms.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
  const previousPath = process.env.PHOTO_CMS_DATA_FILE;
  process.env.PHOTO_CMS_DATA_FILE = filePath;

  try {
    return await run();
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
