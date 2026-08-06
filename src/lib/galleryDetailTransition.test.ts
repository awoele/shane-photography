import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGalleryDetailTransitionPayload,
  GALLERY_DETAIL_TRANSITION_DURATION_MS,
  getContainedImageRect,
  readGalleryDetailTransitionPayload,
} from './galleryDetailTransition';

test('gallery detail transition stores a fresh visible source rectangle', () => {
  const payload = createGalleryDetailTransitionPayload({
    imageSrc: '/photos/portrait-001-thumb.jpg',
    now: 1000,
    photoId: 'portrait-001',
    rect: {
      height: 300,
      left: 20,
      top: 40,
      width: 200,
    },
  });

  assert.deepEqual(payload, {
    createdAt: 1000,
    imageSrc: '/photos/portrait-001-thumb.jpg',
    photoId: 'portrait-001',
    rect: {
      height: 300,
      left: 20,
      top: 40,
      width: 200,
    },
  });
});

test('gallery detail transition rejects stale or mismatched payloads', () => {
  const payload = JSON.stringify({
    createdAt: 1000,
    imageSrc: '/photos/portrait-001-thumb.jpg',
    photoId: 'portrait-001',
    rect: {
      height: 300,
      left: 20,
      top: 40,
      width: 200,
    },
  });

  assert.equal(
    readGalleryDetailTransitionPayload(payload, 'portrait-002', 1100),
    null,
  );
  assert.equal(
    readGalleryDetailTransitionPayload(payload, 'portrait-001', 6000),
    null,
  );
});

test('contained image rect preserves the photo aspect inside the detail stage', () => {
  assert.deepEqual(
    getContainedImageRect({
      containerRect: {
        height: 900,
        left: 0,
        top: 0,
        width: 1200,
      },
      imageHeight: 1800,
      imageWidth: 1440,
    }),
    {
      height: 900,
      left: 240,
      top: 0,
      width: 720,
    },
  );

  assert.deepEqual(
    getContainedImageRect({
      containerRect: {
        height: 900,
        left: 0,
        top: 0,
        width: 1200,
      },
      imageHeight: 1200,
      imageWidth: 1800,
    }),
    {
      height: 800,
      left: 0,
      top: 50,
      width: 1200,
    },
  );
});

test('gallery detail transition keeps the thumbnail visible long enough to read as a zoom', () => {
  assert.equal(GALLERY_DETAIL_TRANSITION_DURATION_MS, 280);
});
