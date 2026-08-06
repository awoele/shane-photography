import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBoundedDetailSwipeOffset,
  getDetailSwipeCommitOffset,
  getDetailSwipeTarget,
  shouldHoldDetailSwipeHandoff,
} from './detailSwipe';

test('getDetailSwipeTarget chooses next and previous photos from horizontal swipes', () => {
  assert.equal(
    getDetailSwipeTarget({
      deltaX: -96,
      deltaY: 12,
      elapsed: 220,
      hasNext: true,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    'next',
  );

  assert.equal(
    getDetailSwipeTarget({
      deltaX: 92,
      deltaY: 8,
      elapsed: 260,
      hasNext: true,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    'previous',
  );
});

test('getDetailSwipeTarget ignores vertical gestures and missing siblings', () => {
  assert.equal(
    getDetailSwipeTarget({
      deltaX: -90,
      deltaY: -110,
      elapsed: 220,
      hasNext: true,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    null,
  );

  assert.equal(
    getDetailSwipeTarget({
      deltaX: -96,
      deltaY: 0,
      elapsed: 220,
      hasNext: false,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    null,
  );
});

test('getBoundedDetailSwipeOffset keeps real siblings direct and resists empty edges', () => {
  assert.equal(
    getBoundedDetailSwipeOffset({
      deltaX: -120,
      hasNext: true,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    -120,
  );

  assert.equal(
    getBoundedDetailSwipeOffset({
      deltaX: -120,
      hasNext: false,
      hasPrevious: true,
      viewportWidth: 390,
    }),
    -36,
  );
});

test('getDetailSwipeCommitOffset moves the current strip toward the requested sibling', () => {
  assert.equal(
    getDetailSwipeCommitOffset({
      target: 'next',
      viewportWidth: 390,
    }),
    -390,
  );

  assert.equal(
    getDetailSwipeCommitOffset({
      target: 'previous',
      viewportWidth: 390,
    }),
    390,
  );
});

test('shouldHoldDetailSwipeHandoff keeps the swipe layer until the routed photo paints', () => {
  assert.equal(
    shouldHoldDetailSwipeHandoff({
      currentPhotoId: 'photo-002',
      handoffPhotoId: 'photo-002',
      isImagePainted: false,
    }),
    true,
  );

  assert.equal(
    shouldHoldDetailSwipeHandoff({
      currentPhotoId: 'photo-002',
      handoffPhotoId: 'photo-002',
      isImagePainted: true,
    }),
    false,
  );

  assert.equal(
    shouldHoldDetailSwipeHandoff({
      currentPhotoId: 'photo-001',
      handoffPhotoId: 'photo-002',
      isImagePainted: false,
    }),
    false,
  );
});
