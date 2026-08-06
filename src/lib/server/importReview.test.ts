import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImportReviewSnapshot,
  getRecommendedImportObjectPaths,
} from './importReview';

test('createImportReviewSnapshot recommends only the latest complete duplicate', () => {
  const snapshot = createImportReviewSnapshot([
    {
      name: 'incoming/travel/20260629-100000-000-img-6427.jpeg',
      previewUrl: 'https://example.com/old.jpg',
      size: 10,
      updated: '2026-06-29T10:00:00Z',
    },
    {
      name: 'incoming/travel/20260629-100000-000-img-6427.jpeg.json',
      size: 1,
      updated: '2026-06-29T10:00:00Z',
    },
    {
      name: 'incoming/travel/20260629-110000-000-img-6427.jpeg',
      previewUrl: 'https://example.com/new.jpg',
      size: 11,
      updated: '2026-06-29T11:00:00Z',
    },
    {
      name: 'incoming/travel/20260629-110000-000-img-6427.jpeg.json',
      size: 1,
      updated: '2026-06-29T11:00:00Z',
    },
  ]);

  assert.equal(snapshot.summary.complete, 2);
  assert.equal(snapshot.summary.duplicates, 2);
  assert.equal(snapshot.summary.recommended, 1);
  assert.deepEqual(getRecommendedImportObjectPaths(snapshot), [
    'incoming/travel/20260629-110000-000-img-6427.jpeg',
  ]);
  assert.equal(
    snapshot.candidates[0]?.duplicateGroupKey,
    'travel/img-6427.jpeg',
  );
  assert.equal(snapshot.candidates[0]?.recommended, true);
  assert.equal(snapshot.candidates[1]?.recommended, false);
});

test('createImportReviewSnapshot marks orphan sidecars and missing sidecars', () => {
  const snapshot = createImportReviewSnapshot([
    {
      name: 'incoming/portrait/20260629-100000-000-img-6426.jpeg.json',
      size: 1,
      updated: '2026-06-29T10:00:00Z',
    },
    {
      name: 'incoming/nature/20260629-100000-000-r0062703.jpeg',
      size: 100,
      updated: '2026-06-29T10:01:00Z',
    },
  ]);

  assert.equal(snapshot.summary.complete, 0);
  assert.equal(snapshot.summary.orphanJson, 1);
  assert.equal(snapshot.summary.missingSidecar, 1);
  assert.deepEqual(getRecommendedImportObjectPaths(snapshot), []);
  assert.equal(snapshot.candidates[0]?.status, 'missing-sidecar');
  assert.equal(snapshot.candidates[1]?.status, 'orphan-json');
});

test('createImportReviewSnapshot ignores objects outside incoming', () => {
  const snapshot = createImportReviewSnapshot([
    {
      name: 'processed/travel/20260629-110000-000-img-6427.jpeg',
      size: 11,
      updated: '2026-06-29T11:00:00Z',
    },
    {
      name: 'incoming/travel/20260629-110000-000-img-6427.jpeg',
      size: 11,
      updated: '2026-06-29T11:00:00Z',
    },
    {
      name: 'incoming/travel/20260629-110000-000-img-6427.jpeg.json',
      size: 1,
      updated: '2026-06-29T11:00:00Z',
    },
  ]);

  assert.equal(snapshot.candidates.length, 1);
  assert.equal(
    snapshot.candidates[0]?.objectPath,
    'incoming/travel/20260629-110000-000-img-6427.jpeg',
  );
});
