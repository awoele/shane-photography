import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSlideLandscapeRequestFresh,
  shouldAutoRedirectLandscapeToSlide,
  shouldAutoRedirectLandscapeToSlideAfterRequest,
} from './slideOrientation';

test('shouldAutoRedirectLandscapeToSlide only redirects the gallery home page', () => {
  assert.equal(shouldAutoRedirectLandscapeToSlide('/'), true);
  assert.equal(shouldAutoRedirectLandscapeToSlide('/slide'), false);
  assert.equal(
    shouldAutoRedirectLandscapeToSlide('/photos/portrait-001'),
    false,
  );
  assert.equal(shouldAutoRedirectLandscapeToSlide('/admin'), false);
});

test('shouldAutoRedirectLandscapeToSlideAfterRequest requires an explicit slide request', () => {
  assert.equal(
    shouldAutoRedirectLandscapeToSlideAfterRequest({
      hasLandscapeRequest: false,
      pathname: '/',
    }),
    false,
  );
  assert.equal(
    shouldAutoRedirectLandscapeToSlideAfterRequest({
      hasLandscapeRequest: true,
      pathname: '/',
    }),
    true,
  );
  assert.equal(
    shouldAutoRedirectLandscapeToSlideAfterRequest({
      hasLandscapeRequest: true,
      pathname: '/photos/portrait-001',
    }),
    false,
  );
});

test('isSlideLandscapeRequestFresh expires stale landscape requests', () => {
  assert.equal(isSlideLandscapeRequestFresh('1000', 5000), true);
  assert.equal(isSlideLandscapeRequestFresh('1000', 20000), false);
  assert.equal(isSlideLandscapeRequestFresh(null, 5000), false);
  assert.equal(isSlideLandscapeRequestFresh('not-a-time', 5000), false);
});
