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
  restoreCmsPhotos,
  retryProcessingJob,
  saveProcessingJobs,
  updateCmsPhoto,
  updateCmsSettings,
} from './photoCms';
import { fetchManagedManifest } from './photoCmsManifest';

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

const withCloudCms = async <T>(
  {
    overrides,
    photos,
  }: {
    overrides: unknown[];
    photos: unknown[];
  },
  run: () => Promise<T>,
) => {
  const previousFetch = globalThis.fetch;
  const previousCloud = process.env.PHOTO_CMS_CLOUD;
  const previousDataFile = process.env.PHOTO_CMS_DATA_FILE;
  const previousLocalOverrides = process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES;
  const previousProcessSecret = process.env.PROCESS_FUNCTION_SECRET;
  const previousProcessUrl = process.env.PROCESS_FUNCTION_URL;
  const previousVercel = process.env.VERCEL;

  process.env.PHOTO_CMS_CLOUD = 'true';
  process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES = 'false';
  process.env.PROCESS_FUNCTION_SECRET = 'test-secret';
  process.env.PROCESS_FUNCTION_URL = 'https://example.com/process';
  delete process.env.PHOTO_CMS_DATA_FILE;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/process')) {
      return new Response(JSON.stringify({ updated: 1 }), { status: 200 });
    }

    if (url.includes('photo-cms-overrides.json')) {
      return new Response(JSON.stringify(overrides), { status: 200 });
    }

    if (url.includes('photos.json')) {
      return new Response(JSON.stringify(photos), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unexpected URL' }), {
      status: 404,
    });
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = previousFetch;

    if (previousCloud === undefined) {
      delete process.env.PHOTO_CMS_CLOUD;
    } else {
      process.env.PHOTO_CMS_CLOUD = previousCloud;
    }

    if (previousDataFile === undefined) {
      delete process.env.PHOTO_CMS_DATA_FILE;
    } else {
      process.env.PHOTO_CMS_DATA_FILE = previousDataFile;
    }

    if (previousLocalOverrides === undefined) {
      delete process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES;
    } else {
      process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES = previousLocalOverrides;
    }

    if (previousProcessSecret === undefined) {
      delete process.env.PROCESS_FUNCTION_SECRET;
    } else {
      process.env.PROCESS_FUNCTION_SECRET = previousProcessSecret;
    }

    if (previousProcessUrl === undefined) {
      delete process.env.PROCESS_FUNCTION_URL;
    } else {
      process.env.PROCESS_FUNCTION_URL = previousProcessUrl;
    }

    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
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

test('cloud CMS merges remote photos with cloud overrides for admin lists and stats', async () => {
  await withCloudCms(
    {
      overrides: [
        { id: 'cloud-001', status: 'hidden', title: 'Hidden Cloud' },
        { category: 'travel', id: 'cloud-002', tags: ['Japan', 'Travel'] },
        { deleted: true, id: 'cloud-003', status: 'hidden' },
      ],
      photos: [
        buildPhoto('cloud-001', { category: 'portrait' }),
        buildPhoto('cloud-002', { category: 'portrait' }),
        buildPhoto('cloud-003', { category: 'night' }),
      ],
    },
    async () => {
      const allPhotos = await listCmsPhotos({ status: 'all' });
      const publicPhotos = await listCmsPhotos({ publishedOnly: true });
      const stats = await getCmsStats();

      assert.deepEqual(
        allPhotos.map((photo) => photo.id),
        ['cloud-001', 'cloud-002'],
      );
      assert.deepEqual(
        publicPhotos.map((photo) => photo.id),
        ['cloud-002'],
      );
      assert.equal(
        allPhotos.find((photo) => photo.id === 'cloud-001')?.title,
        'Hidden Cloud',
      );
      assert.equal(
        allPhotos.find((photo) => photo.id === 'cloud-002')?.category,
        'travel',
      );
      assert.deepEqual(
        allPhotos.find((photo) => photo.id === 'cloud-002')?.tags,
        ['japan', 'travel'],
      );
      assert.equal(stats.total, 2);
      assert.equal(stats.statusCounts.hidden, 1);
      assert.equal(stats.statusCounts.published, 1);
      assert.equal(stats.categoryCounts.travel, 1);
    },
  );
});

test('admin cloud CMS can include deleted photos with original category metadata', async () => {
  await withCloudCms(
    {
      overrides: [
        {
          category: 'alex-webb',
          deleted: true,
          id: 'portrait-160',
          status: 'hidden',
        },
      ],
      photos: [buildPhoto('portrait-160', { category: 'portrait' })],
    },
    async () => {
      const publicPhotos = await listCmsPhotos({ status: 'all' });
      const adminPhotos = await listCmsPhotos({
        includeDeleted: true,
        status: 'all',
      });

      assert.deepEqual(
        publicPhotos.map((photo) => photo.id),
        [],
      );
      assert.deepEqual(
        adminPhotos.map((photo) => photo.id),
        ['portrait-160'],
      );
      assert.equal(adminPhotos[0]?.category, 'alex-webb');
      assert.equal(adminPhotos[0]?.originalCategory, 'portrait');
      assert.equal(adminPhotos[0]?.deleted, true);
    },
  );
});

test('managed manifest excludes cloud-deleted remote photos', async () => {
  await withCloudCms(
    {
      overrides: [
        {
          category: 'alex-webb',
          deleted: true,
          id: 'portrait-160',
          status: 'hidden',
          title: 'Poetic 07',
        },
      ],
      photos: [
        buildPhoto('portrait-160', {
          category: 'portrait',
          title: 'Poetic 07',
        }),
        buildPhoto('alex-webb-001', {
          category: 'alex-webb',
          title: 'Alex Webb 01',
        }),
      ],
    },
    async () => {
      process.env.VERCEL = '1';

      const manifest = await fetchManagedManifest({ cacheBust: true });

      assert.deepEqual(
        manifest.data.map((photo) => photo.id),
        ['alex-webb-001'],
      );
    },
  );
});

test('listCmsPhotos can filter removed photos for recovery', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('visible-001'), status: 'published' },
      { ...buildPhoto('removed-001'), deleted: true, status: 'hidden' },
    ],
    async () => {
      const removedPhotos = await listCmsPhotos({
        includeDeleted: true,
        status: 'removed',
      });

      assert.deepEqual(
        removedPhotos.map((photo) => photo.id),
        ['removed-001'],
      );
    },
  );
});

test('sortOrder controls category ordering before timestamp fallback', async () => {
  await withCloudCms(
    {
      overrides: [
        { id: 'story-003', sortOrder: 1 },
        { id: 'story-001', sortOrder: 2 },
      ],
      photos: [
        buildPhoto('story-001', {
          category: 'kathy',
          dateTaken: '2026-01-03T10:00:00',
        }),
        buildPhoto('story-002', {
          category: 'kathy',
          dateTaken: '2026-01-02T10:00:00',
        }),
        buildPhoto('story-003', {
          category: 'kathy',
          dateTaken: '2026-01-01T10:00:00',
        }),
      ],
    },
    async () => {
      const photos = await listCmsPhotos({ category: 'kathy', status: 'all' });

      assert.deepEqual(
        photos.map((photo) => photo.id),
        ['story-003', 'story-001', 'story-002'],
      );
    },
  );
});

test('listCmsPhotos sorts a filtered category after applying the category filter', async () => {
  await withCloudCms(
    {
      overrides: [],
      photos: [
        buildPhoto('portrait-001', {
          category: 'portrait',
          dateTaken: '',
          sortOrder: 1,
        }),
        buildPhoto('travel-001', {
          category: 'travel',
          dateTaken: '2026-06-27T13:44:02',
          sortOrder: 6,
        }),
        buildPhoto('travel-002', {
          category: 'travel',
          dateTaken: '',
          sortOrder: 1,
        }),
        buildPhoto('portrait-002', {
          category: 'portrait',
          dateTaken: '2026-03-11T15:36:44',
          sortOrder: 101,
        }),
        buildPhoto('portrait-003', {
          category: 'portrait',
          dateTaken: '2026-03-11T11:12:25',
          sortOrder: 102,
        }),
        buildPhoto('color-001', {
          category: 'color',
          dateTaken: '2026-05-16T16:27:33',
        }),
      ],
    },
    async () => {
      const photos = await listCmsPhotos({
        category: 'portrait',
        status: 'all',
      });

      assert.deepEqual(
        photos.map((photo) => photo.id),
        ['portrait-001', 'portrait-002', 'portrait-003'],
      );
    },
  );
});

test('restoreCmsPhotos clears the deleted flag through cloud CMS', async () => {
  await withCloudCms(
    {
      overrides: [],
      photos: [buildPhoto('cloud-restore')],
    },
    async () => {
      let requestBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);

        if (url.includes('/process')) {
          requestBody =
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : undefined;

          return new Response(JSON.stringify({ updated: 1 }), { status: 200 });
        }

        if (url.includes('photo-cms-overrides.json')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (url.includes('photos.json')) {
          return new Response(JSON.stringify([buildPhoto('cloud-restore')]), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ error: 'Unexpected URL' }), {
          status: 404,
        });
      }) as typeof fetch;

      const result = await restoreCmsPhotos(['cloud-restore']);

      assert.equal(result.updated, 1);
      assert.deepEqual(requestBody, {
        cmsAction: 'restore',
        ids: ['cloud-restore'],
      });
    },
  );
});

test('Vercel uses cloud CMS even when an old local CMS file env var exists', async () => {
  await withCmsFile([buildPhoto('local-only')], async (filePath) => {
    await withCloudCms(
      {
        overrides: [],
        photos: [buildPhoto('cloud-only')],
      },
      async () => {
        process.env.PHOTO_CMS_CLOUD = '';
        process.env.PHOTO_CMS_DATA_FILE = filePath;
        process.env.VERCEL = '1';

        const photos = await listCmsPhotos({ status: 'all' });

        assert.deepEqual(
          photos.map((photo) => photo.id),
          ['cloud-only'],
        );
      },
    );
  });
});

test('bulk cloud mutations fail instead of reporting success without an update count', async () => {
  await withCloudCms(
    {
      overrides: [],
      photos: [buildPhoto('cloud-001')],
    },
    async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/process')) {
          return new Response(JSON.stringify({ processed: 0 }), {
            status: 200,
          });
        }

        if (url.includes('photo-cms-overrides.json')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (url.includes('photos.json')) {
          return new Response(JSON.stringify([buildPhoto('cloud-001')]), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ error: 'Unexpected URL' }), {
          status: 404,
        });
      }) as typeof fetch;

      await assert.rejects(
        bulkUpdateCmsPhotos({
          ids: ['cloud-001'],
          patch: { category: 'travel' },
        }),
        /updated count/,
      );
    },
  );
});

test('deleteCmsPhotos soft-removes selected records for recovery', async () => {
  await withCmsFile(
    [
      { ...buildPhoto('one'), status: 'published' },
      { ...buildPhoto('two'), status: 'published' },
      { ...buildPhoto('three'), status: 'hidden' },
    ],
    async () => {
      const result = await deleteCmsPhotos(['one', 'three']);
      const publicPhotos = await listCmsPhotos({ status: 'all' });
      const removedPhotos = await listCmsPhotos({
        includeDeleted: true,
        status: 'removed',
      });

      assert.equal(result.deleted, 2);
      assert.deepEqual(
        publicPhotos.map((photo) => photo.id),
        ['two'],
      );
      assert.deepEqual(
        removedPhotos.map((photo) => photo.id),
        ['one', 'three'],
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
