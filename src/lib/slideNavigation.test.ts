import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSlideCurrentHref,
  buildSlideProofHref,
  guardSlideProofNavigationEvent,
} from './slideNavigation';

test('buildSlideProofHref preserves random gallery state for proof view', () => {
  assert.equal(
    buildSlideProofHref({
      category: 'portrait',
      randomSeed: 123,
      sortMode: 'random',
    }),
    '/?sort=random&category=portrait&seed=123',
  );
});

test('buildSlideProofHref omits empty category and latest seed', () => {
  assert.equal(
    buildSlideProofHref({
      category: '',
      randomSeed: 123,
      sortMode: 'latest',
    }),
    '/?sort=latest',
  );
});

test('buildSlideCurrentHref keeps the active slide id inside the slide route', () => {
  assert.equal(
    buildSlideCurrentHref({
      activePhotoId: 'travel-001',
      proofHref: '/?sort=random&category=travel&seed=456',
    }),
    '/slide?sort=random&category=travel&seed=456&id=travel-001',
  );
});

test('guardSlideProofNavigationEvent isolates normal proof clicks from slide controls', () => {
  let prevented = false;
  let stopped = false;

  const shouldHandle = guardSlideProofNavigationEvent({
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
    shiftKey: false,
    stopPropagation: () => {
      stopped = true;
    },
  });

  assert.equal(shouldHandle, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('guardSlideProofNavigationEvent preserves modified proof clicks', () => {
  let prevented = false;
  let stopped = false;

  const shouldHandle = guardSlideProofNavigationEvent({
    altKey: false,
    button: 0,
    ctrlKey: true,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
    shiftKey: false,
    stopPropagation: () => {
      stopped = true;
    },
  });

  assert.equal(shouldHandle, false);
  assert.equal(prevented, false);
  assert.equal(stopped, false);
});
