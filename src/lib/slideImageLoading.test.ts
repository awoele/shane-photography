import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlideImageLoading,
  shouldRenderSlideImage,
} from './slideImageLoading';

test('getSlideImageLoading eagerly loads only the active card and closest neighbors', () => {
  assert.equal(getSlideImageLoading(0), 'eager');
  assert.equal(getSlideImageLoading(2), 'eager');
  assert.equal(getSlideImageLoading(-2), 'eager');
});

test('getSlideImageLoading lazily loads cards beyond the nearest neighbors', () => {
  assert.equal(getSlideImageLoading(3), 'lazy');
  assert.equal(getSlideImageLoading(-3), 'lazy');
});

test('shouldRenderSlideImage keeps far-away slide cards image-free', () => {
  assert.equal(shouldRenderSlideImage(0), true);
  assert.equal(shouldRenderSlideImage(4), true);
  assert.equal(shouldRenderSlideImage(-4), true);
  assert.equal(shouldRenderSlideImage(5), false);
  assert.equal(shouldRenderSlideImage(-5), false);
});
