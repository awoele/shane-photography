import assert from 'node:assert/strict';
import test from 'node:test';

import { getSlideWheelOffset } from './slideWheel';

test('getSlideWheelOffset advances for downward desktop wheel movement', () => {
  assert.equal(getSlideWheelOffset({ deltaY: 28 }), 1);
});

test('getSlideWheelOffset reverses for upward desktop wheel movement', () => {
  assert.equal(getSlideWheelOffset({ deltaY: -28 }), -1);
});

test('getSlideWheelOffset ignores tiny trackpad noise', () => {
  assert.equal(getSlideWheelOffset({ deltaY: 8 }), 0);
});

test('getSlideWheelOffset uses the dominant wheel axis', () => {
  assert.equal(getSlideWheelOffset({ deltaX: 35, deltaY: 8 }), 1);
  assert.equal(getSlideWheelOffset({ deltaX: -35, deltaY: 8 }), -1);
});

test('getSlideWheelOffset normalizes line-based wheel deltas', () => {
  assert.equal(getSlideWheelOffset({ deltaMode: 1, deltaY: 2 }), 1);
});
