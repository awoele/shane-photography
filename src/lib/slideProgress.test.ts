import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlideProgressDisplayIndex,
  getSlideProgressIndex,
  getSlideProgressPercent,
  getSlideProgressVisualIndexFromSlidesGrid,
} from './slideProgress';

test('getSlideProgressIndex maps pointer positions to slide indexes', () => {
  assert.equal(
    getSlideProgressIndex({
      clientX: 100,
      left: 100,
      total: 10,
      width: 200,
    }),
    0,
  );
  assert.equal(
    getSlideProgressIndex({
      clientX: 300,
      left: 100,
      total: 10,
      width: 200,
    }),
    9,
  );
  assert.equal(
    getSlideProgressIndex({
      clientX: 211,
      left: 100,
      total: 10,
      width: 200,
    }),
    5,
  );
});

test('getSlideProgressIndex clamps outside the progress rail', () => {
  assert.equal(
    getSlideProgressIndex({
      clientX: -20,
      left: 100,
      total: 10,
      width: 200,
    }),
    0,
  );
  assert.equal(
    getSlideProgressIndex({
      clientX: 420,
      left: 100,
      total: 10,
      width: 200,
    }),
    9,
  );
});

test('getSlideProgressPercent returns a visual percent for the active slide', () => {
  assert.equal(getSlideProgressPercent({ index: 0, total: 10 }), 10);
  assert.equal(getSlideProgressPercent({ index: 4, total: 10 }), 50);
  assert.ok(
    Math.abs(getSlideProgressPercent({ index: 4.5, total: 10 }) - 55) <
      Number.EPSILON * 100,
  );
  assert.equal(getSlideProgressPercent({ index: 9, total: 10 }), 100);
  assert.equal(getSlideProgressPercent({ index: 0, total: 0 }), 0);
});

test('getSlideProgressVisualIndexFromSlidesGrid follows Swiper drag progress', () => {
  assert.equal(
    getSlideProgressVisualIndexFromSlidesGrid({
      slideStart: 20,
      slidesGrid: [0, 100, 200],
      total: 100,
      translate: -150,
    }),
    21.5,
  );
  assert.equal(
    getSlideProgressVisualIndexFromSlidesGrid({
      slideStart: 20,
      slidesGrid: [0, 100, 200],
      total: 100,
      translate: -260,
    }),
    22,
  );
  assert.equal(
    getSlideProgressVisualIndexFromSlidesGrid({
      slideStart: 20,
      slidesGrid: [0, 100, 200],
      total: 21,
      translate: 80,
    }),
    20,
  );
});

test('getSlideProgressDisplayIndex follows the visual slide during swipe transitions', () => {
  assert.equal(
    getSlideProgressDisplayIndex({
      activeIndex: 7,
      total: 557,
      visualActiveIndex: 8,
    }),
    8,
  );
  assert.equal(
    getSlideProgressDisplayIndex({
      activeIndex: 7,
      total: 557,
      visualActiveIndex: 999,
    }),
    556,
  );
  assert.equal(
    getSlideProgressDisplayIndex({
      activeIndex: 7,
      total: 0,
      visualActiveIndex: 8,
    }),
    0,
  );
});
