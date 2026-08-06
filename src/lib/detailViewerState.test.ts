import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDetailViewerNeighborIndex,
  resolveDetailViewerIndex,
  shouldReplaceDetailViewerUrl,
} from './detailViewerState';

const photos = [
  { id: 'photo-001' },
  { id: 'photo-002' },
  { id: 'photo-003' },
  { id: 'photo-004' },
];

test('resolveDetailViewerIndex starts the internal viewer on the routed photo', () => {
  assert.equal(resolveDetailViewerIndex(photos, 'photo-003', 0), 2);
  assert.equal(resolveDetailViewerIndex(photos, 'missing', 1), 1);
  assert.equal(resolveDetailViewerIndex(photos, 'missing', 99), 0);
});

test('getDetailViewerNeighborIndex wraps without relying on route navigation', () => {
  assert.equal(getDetailViewerNeighborIndex(0, photos.length, 'previous'), 3);
  assert.equal(getDetailViewerNeighborIndex(3, photos.length, 'next'), 0);
  assert.equal(getDetailViewerNeighborIndex(1, 1, 'next'), null);
});

test('shouldReplaceDetailViewerUrl syncs URL only after the internal photo changes', () => {
  assert.equal(
    shouldReplaceDetailViewerUrl({
      activePhotoId: 'photo-002',
      lastSyncedPhotoId: '',
      routedPhotoId: 'photo-001',
    }),
    true,
  );
  assert.equal(
    shouldReplaceDetailViewerUrl({
      activePhotoId: 'photo-002',
      lastSyncedPhotoId: 'photo-002',
      routedPhotoId: 'photo-001',
    }),
    false,
  );
  assert.equal(
    shouldReplaceDetailViewerUrl({
      activePhotoId: 'photo-001',
      lastSyncedPhotoId: '',
      routedPhotoId: 'photo-001',
    }),
    false,
  );
});
