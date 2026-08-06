import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SLIDE_ACTIVE_SCALE,
  SLIDE_ACTIVE_SCALE_MOBILE,
  SLIDE_CARD_TRANSFORM_DURATION_MS,
  SLIDE_RESISTANCE_RATIO,
  SLIDE_SCROLL_DURATION_MS,
  SLIDE_TOUCH_THRESHOLD_PX,
} from './slideMotion';

test('slide motion uses a lighter faster feel without increasing rendered slides', () => {
  assert.equal(SLIDE_SCROLL_DURATION_MS, 170);
  assert.equal(SLIDE_CARD_TRANSFORM_DURATION_MS, 95);
  assert.equal(SLIDE_TOUCH_THRESHOLD_PX, 1);
  assert.equal(SLIDE_RESISTANCE_RATIO, 0.48);
  assert.equal(SLIDE_ACTIVE_SCALE, 1.04);
  assert.equal(SLIDE_ACTIVE_SCALE_MOBILE, 1.03);
});
