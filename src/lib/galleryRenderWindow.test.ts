import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGalleryLoadRootMargin,
  getGalleryRenderBatchSize,
  getInitialGalleryRenderLimit,
  getNextGalleryRenderLimit,
  shouldRenderGalleryLoadSentinel,
} from './galleryRenderWindow';

test('getInitialGalleryRenderLimit keeps mobile proof pages light', () => {
  assert.equal(getInitialGalleryRenderLimit(390, 569), 24);
  assert.equal(getInitialGalleryRenderLimit(768, 569), 48);
  assert.equal(getInitialGalleryRenderLimit(1440, 569), 96);
});

test('getGalleryRenderBatchSize loads more photos in controlled batches', () => {
  assert.equal(getGalleryRenderBatchSize(390), 16);
  assert.equal(getGalleryRenderBatchSize(1024), 48);
});

test('getGalleryLoadRootMargin avoids eager multi-batch mobile loading', () => {
  assert.equal(getGalleryLoadRootMargin(390), '420px 0px');
  assert.equal(getGalleryLoadRootMargin(1024), '720px 0px');
});

test('getNextGalleryRenderLimit never exceeds the available photo count', () => {
  assert.equal(
    getNextGalleryRenderLimit({
      containerWidth: 390,
      currentLimit: 24,
      photoCount: 569,
    }),
    40,
  );
  assert.equal(
    getNextGalleryRenderLimit({
      containerWidth: 1440,
      currentLimit: 540,
      photoCount: 569,
    }),
    569,
  );
});

test('shouldRenderGalleryLoadSentinel shows only while more photos remain', () => {
  assert.equal(shouldRenderGalleryLoadSentinel(24, 569), true);
  assert.equal(shouldRenderGalleryLoadSentinel(569, 569), false);
});
