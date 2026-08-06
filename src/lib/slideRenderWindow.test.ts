import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlideRenderWindow,
  getSlideRenderWindowLocalIndex,
  shouldRecenterSlideRenderWindow,
} from './slideRenderWindow';

test('getSlideRenderWindow keeps the active slide inside a small local window', () => {
  const window = getSlideRenderWindow({
    activeIndex: 486,
    radius: 7,
    total: 557,
  });

  assert.deepEqual(
    window.indexes,
    [479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493],
  );
  assert.equal(window.localActiveIndex, 7);
});

test('getSlideRenderWindow avoids hundreds of offscreen Swiper slides at the edges', () => {
  assert.deepEqual(
    getSlideRenderWindow({
      activeIndex: 1,
      radius: 7,
      total: 557,
    }),
    {
      end: 8,
      indexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      localActiveIndex: 1,
      start: 0,
    },
  );

  assert.deepEqual(
    getSlideRenderWindow({
      activeIndex: 555,
      radius: 7,
      total: 557,
    }),
    {
      end: 556,
      indexes: [548, 549, 550, 551, 552, 553, 554, 555, 556],
      localActiveIndex: 7,
      start: 548,
    },
  );
});

test('getSlideRenderWindow clamps invalid active indexes', () => {
  assert.deepEqual(
    getSlideRenderWindow({
      activeIndex: 999,
      radius: 2,
      total: 4,
    }),
    {
      end: 3,
      indexes: [1, 2, 3],
      localActiveIndex: 2,
      start: 1,
    },
  );
});

test('shouldRecenterSlideRenderWindow waits until the active slide nears an edge', () => {
  assert.equal(
    shouldRecenterSlideRenderWindow({
      activeIndex: 486,
      end: 493,
      margin: 3,
      start: 479,
    }),
    false,
  );
  assert.equal(
    shouldRecenterSlideRenderWindow({
      activeIndex: 491,
      end: 493,
      margin: 3,
      start: 479,
    }),
    true,
  );
  assert.equal(
    shouldRecenterSlideRenderWindow({
      activeIndex: 481,
      end: 493,
      margin: 3,
      start: 479,
    }),
    true,
  );
});

test('getSlideRenderWindowLocalIndex maps a global active slide into the current local window', () => {
  assert.equal(
    getSlideRenderWindowLocalIndex({
      end: 15,
      index: 8,
      start: 1,
    }),
    7,
  );
  assert.equal(
    getSlideRenderWindowLocalIndex({
      end: 15,
      index: 20,
      start: 1,
    }),
    null,
  );
});
