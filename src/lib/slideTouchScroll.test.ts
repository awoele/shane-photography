import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlideTouchScrollLeft,
  shouldLetSlideTrackUseNativeMomentum,
  shouldPreventSlideDocumentTouchMove,
} from './slideTouchScroll';

test('getSlideTouchScrollLeft moves the slide rail opposite to the finger drag', () => {
  assert.equal(
    getSlideTouchScrollLeft({
      currentTouchX: 120,
      maxScrollLeft: 1000,
      startScrollLeft: 400,
      startTouchX: 80,
    }),
    360,
  );

  assert.equal(
    getSlideTouchScrollLeft({
      currentTouchX: 40,
      maxScrollLeft: 1000,
      startScrollLeft: 400,
      startTouchX: 80,
    }),
    440,
  );
});

test('getSlideTouchScrollLeft clamps to the available rail bounds', () => {
  assert.equal(
    getSlideTouchScrollLeft({
      currentTouchX: 400,
      maxScrollLeft: 1000,
      startScrollLeft: 20,
      startTouchX: 20,
    }),
    0,
  );

  assert.equal(
    getSlideTouchScrollLeft({
      currentTouchX: 20,
      maxScrollLeft: 1000,
      startScrollLeft: 960,
      startTouchX: 400,
    }),
    1000,
  );
});

test('shouldPreventSlideDocumentTouchMove blocks browser defaults while the slide rail owns horizontal swipes', () => {
  assert.equal(
    shouldPreventSlideDocumentTouchMove({
      currentTouchX: 40,
      currentTouchY: 102,
      startTouchX: 120,
      startTouchY: 100,
      targetIsSlideTrack: true,
    }),
    true,
  );
});

test('shouldLetSlideTrackUseNativeMomentum keeps horizontal slide swipes native', () => {
  assert.equal(
    shouldLetSlideTrackUseNativeMomentum({
      currentTouchX: 40,
      currentTouchY: 103,
      startTouchX: 120,
      startTouchY: 100,
      targetIsSlideTrack: true,
    }),
    true,
  );

  assert.equal(
    shouldLetSlideTrackUseNativeMomentum({
      currentTouchX: 103,
      currentTouchY: 138,
      startTouchX: 100,
      startTouchY: 100,
      targetIsSlideTrack: true,
    }),
    false,
  );
});

test('shouldPreventSlideDocumentTouchMove blocks vertical pulls on the slide rail', () => {
  assert.equal(
    shouldPreventSlideDocumentTouchMove({
      currentTouchX: 103,
      currentTouchY: 138,
      startTouchX: 100,
      startTouchY: 100,
      targetIsSlideTrack: true,
    }),
    true,
  );
});

test('shouldPreventSlideDocumentTouchMove blocks off-rail movement before browsers can refresh', () => {
  assert.equal(
    shouldPreventSlideDocumentTouchMove({
      currentTouchX: 101,
      currentTouchY: 124,
      startTouchX: 100,
      startTouchY: 100,
      targetIsSlideTrack: false,
    }),
    true,
  );

  assert.equal(
    shouldPreventSlideDocumentTouchMove({
      currentTouchX: 132,
      currentTouchY: 112,
      startTouchX: 100,
      startTouchY: 100,
      targetIsSlideTrack: false,
    }),
    true,
  );

  assert.equal(
    shouldPreventSlideDocumentTouchMove({
      currentTouchX: 100.5,
      currentTouchY: 100.5,
      startTouchX: 100,
      startTouchY: 100,
      targetIsSlideTrack: false,
    }),
    false,
  );
});
