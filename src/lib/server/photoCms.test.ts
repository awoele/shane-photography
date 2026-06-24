import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Photo } from '../photos';
import {
  bulkUpdateCmsPhotos,
  createCmsPhoto,
  deleteCmsPhotos,
  getCmsSettings,
  getCmsStats,
  listCmsPhotos,
  listProcessingJobs,
  loadCmsPhotos,
  refreshManifestCache,
  retryProcessingJob,
  saveProcessingJobs,
  updateCmsPhoto,
  updateCmsSettings,
} from './photoCms';

const buildPhoto = (id: string, patch: Partial<Photo> = {}): Photo => ({
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
  thumbnail: `https://example.com/thumbs/${id}.jpg`,
  title: id,
  width: 1800,
  ...patch,
});

const withCmsFile = async <T>(
  records: unknown[],
  run: (filePath: string) => Promise<T>,
) => {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-cms-'));
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

test('loadCmsPhotos normalizes stored photos and hides non-published records from public lists', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('draft-001'), status: 'draft' },
      { ...buildPhoto('published-001'), status: 'published' },
      { ...buildPhoto('hidden-001'), status: 'hidden' },
    ],
    async () => {
      const allPhotos = await loadCmsPhotos();
      const publicPhotos = await listCmsPhotos({ publishedOnly: true });

      assert.equal(allPhotos.length, 3);
      assert.deepEqual(
        publicPhotos.map((photo) => photo.id),
        ['published-001'],
      );
    },
  );
});

test('updateCmsPhoto persists editable fields without losing photo source data', async () => {
  await withCmsFile(
    [{ ...buildPhoto('portrait-001'), status: 'published' }],
    async () => {
      const updated = await updateCmsPhoto('portrait-001', {
        category: 'travel',
        status: 'hidden',
        tags: ['travel', 'japan'],
        title: 'Tokyo Walk',
      });

      assert.equal(updated.title, 'Tokyo Walk');
      assert.equal(updated.category, 'travel');
      assert.equal(updated.status, 'hidden');
      assert.equal(updated.src, 'https://example.com/photos/portrait-001.jpg');

      const saved = await loadCmsPhotos();
      assert.deepEqual(saved[0]?.tags, ['travel', 'japan']);
    },
  );
});

test('bulkUpdateCmsPhotos applies category and status changes to selected records', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('one'), status: 'published' },
      { ...buildPhoto('two'), status: 'published' },
      { ...buildPhoto('three'), status: 'published' },
    ],
    async () => {
      const result = await bulkUpdateCmsPhotos({
        ids: ['one', 'three'],
        patch: {
          category: 'night',
          status: 'hidden',
        },
      });
      const saved = await loadCmsPhotos();

      assert.equal(result.updated, 2);
      assert.equal(
        saved.find((photo) => photo.id === 'one')?.category,
        'night',
      );
      assert.equal(
        saved.find((photo) => photo.id === 'two')?.category,
        'portrait',
      );
      assert.equal(
        saved.find((photo) => photo.id === 'three')?.status,
        'hidden',
      );
    },
  );
});

test('getCmsStats summarizes categories and workflow statuses', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('one'), category: 'portrait', status: 'published' },
      { ...buildPhoto('two'), category: 'travel', status: 'hidden' },
      { ...buildPhoto('three'), category: 'travel', status: 'draft' },
    ],
    async () => {
      const stats = await getCmsStats();

      assert.equal(stats.total, 3);
      assert.equal(stats.statusCounts.published, 1);
      assert.equal(stats.statusCounts.hidden, 1);
      assert.equal(stats.statusCounts.draft, 1);
      assert.equal(stats.categoryCounts.travel, 2);
    },
  );
});

test('deleteCmsPhotos removes selected records from the library', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('one'), status: 'published' },
      { ...buildPhoto('two'), status: 'published' },
      { ...buildPhoto('three'), status: 'hidden' },
    ],
    async () => {
      const result = await deleteCmsPhotos(['one', 'three']);
      const saved = await loadCmsPhotos();

      assert.equal(result.deleted, 2);
      assert.deepEqual(
        saved.map((photo) => photo.id),
        ['two'],
      );
    },
  );
});

test('createCmsPhoto registers an uploaded image as a draft photo', async () => {
  await withCmsFile([], async () => {
    const created = await createCmsPhoto({
      category: 'travel',
      height: 1200,
      id: 'travel-upload',
      src: '/uploads/travel-upload.jpg',
      thumbnail: '/uploads/travel-upload.jpg',
      title: 'Travel Upload',
      width: 1800,
    });
    const saved = await loadCmsPhotos();

    assert.equal(created.status, 'draft');
    assert.equal(created.featured, false);
    assert.equal(saved[0]?.id, 'travel-upload');
  });
});

test('processing queue retries failed jobs without losing thumbnail details', async () => {
  await withCmsFile([], async () => {
    await saveProcessingJobs([
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        error: 'EXIF parse failed',
        exifStatus: 'failed',
        filename: 'broken.jpg',
        id: 'job-001',
        livePhotoStatus: 'skipped',
        progress: 100,
        stage: 'Failed',
        status: 'failed',
        thumbnail: '/uploads/broken.jpg',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const retried = await retryProcessingJob('job-001');
    const jobs = await listProcessingJobs();

    assert.equal(retried.status, 'queued');
    assert.equal(retried.error, '');
    assert.equal(jobs[0]?.thumbnail, '/uploads/broken.jpg');
  });
});

test('settings persist storage and manifest refresh metadata', async () => {
  await withCmsFile([], async () => {
    const settings = await updateCmsSettings({
      defaultPublishStatus: 'draft',
      manifestCacheEnabled: false,
      storageBucket: 'shane-photo-test',
    });
    const refreshed = await refreshManifestCache();
    const saved = await getCmsSettings();

    assert.equal(settings.storageBucket, 'shane-photo-test');
    assert.equal(saved.defaultPublishStatus, 'draft');
    assert.equal(saved.manifestCacheEnabled, false);
    assert.equal(refreshed.manifestCacheVersion, saved.manifestCacheVersion);
    assert.match(saved.lastManifestRefreshAt, /^20/);
  });
});
