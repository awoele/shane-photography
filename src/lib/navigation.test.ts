import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhotoDetailHref,
  createGalleryScrollSnapshot,
  GALLERY_SCROLL_STORAGE_KEY,
  normalizeInternalReturnHref,
  readGalleryScrollSnapshot,
  readGalleryWidthSnapshot,
  shouldHardNavigateAfterClientRouteFailure,
  shouldUseBrowserHistoryForReturn,
} from './navigation';

test('normalizeInternalReturnHref keeps only safe internal paths', () => {
  assert.equal(
    normalizeInternalReturnHref('/?sort=random&category=color&seed=123'),
    '/?sort=random&category=color&seed=123',
  );
  assert.equal(
    normalizeInternalReturnHref('%2Fslide%2F%3Fsort%3Drandom%26seed%3D123'),
    '/slide/?sort=random&seed=123',
  );
  assert.equal(normalizeInternalReturnHref('https://example.com'), '/');
  assert.equal(normalizeInternalReturnHref('//example.com'), '/');
});

test('buildPhotoDetailHref preserves a return target for detail navigation', () => {
  assert.equal(
    buildPhotoDetailHref('color-001', '/?sort=random&category=color&seed=123'),
    '/photos/color-001?from=%2F%3Fsort%3Drandom%26category%3Dcolor%26seed%3D123',
  );
  assert.equal(buildPhotoDetailHref('color-001'), '/photos/color-001');
});

test('shouldHardNavigateAfterClientRouteFailure ignores cancelled swipe navigations', () => {
  assert.equal(
    shouldHardNavigateAfterClientRouteFailure({ cancelled: true }),
    false,
  );
  assert.equal(
    shouldHardNavigateAfterClientRouteFailure(
      new Error('Cancel rendering route'),
    ),
    false,
  );
  assert.equal(
    shouldHardNavigateAfterClientRouteFailure(new Error('Network failed')),
    true,
  );
});

test('shouldUseBrowserHistoryForReturn only trusts an existing Next history entry', () => {
  assert.equal(
    shouldUseBrowserHistoryForReturn({
      historyLength: 2,
      historyState: { idx: 1 },
    }),
    true,
  );
  assert.equal(
    shouldUseBrowserHistoryForReturn({
      historyLength: 1,
      historyState: { idx: 1 },
    }),
    false,
  );
  assert.equal(
    shouldUseBrowserHistoryForReturn({
      historyLength: 2,
      historyState: { idx: 0 },
    }),
    false,
  );
  assert.equal(
    shouldUseBrowserHistoryForReturn({
      historyLength: 2,
      historyState: { url: '/photos/color-001' },
    }),
    false,
  );
});

test('gallery scroll snapshots restore only the matching safe gallery path', () => {
  const snapshot = createGalleryScrollSnapshot(
    '/?sort=random&category=portrait',
    1280.4,
    1000,
  );

  assert.equal(GALLERY_SCROLL_STORAGE_KEY, 'afilmory:gallery-scroll');
  assert.equal(
    readGalleryScrollSnapshot(
      snapshot,
      '/?sort=random&category=portrait',
      2000,
    ),
    1280,
  );
  assert.equal(
    readGalleryScrollSnapshot(snapshot, '/?sort=random&category=color', 2000),
    null,
  );
  assert.equal(
    readGalleryScrollSnapshot(snapshot, 'https://example.com', 2000),
    null,
  );
  assert.equal(readGalleryScrollSnapshot(snapshot, '/', 900_000), null);
});

test('gallery snapshots can restore the measured gallery width before resize observers run', () => {
  const snapshot = createGalleryScrollSnapshot(
    '/?sort=random&category=portrait',
    1280,
    1000,
    390.6,
  );

  assert.equal(
    readGalleryWidthSnapshot(snapshot, '/?sort=random&category=portrait', 2000),
    391,
  );
  assert.equal(
    readGalleryWidthSnapshot(snapshot, '/?sort=random&category=color', 2000),
    null,
  );
});
