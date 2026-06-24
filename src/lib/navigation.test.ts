import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhotoDetailHref,
  normalizeInternalReturnHref,
} from './navigation';

test('normalizeInternalReturnHref keeps only safe internal paths', () => {
  assert.equal(
    normalizeInternalReturnHref('/?sort=random&category=color&seed=123'),
    '/?sort=random&category=color&seed=123',
  );
  assert.equal(
    normalizeInternalReturnHref('%2Fslide%2F%3Fsort%3Drandom%26seed%3D123'),
    '/slide/?sort=random&seed=123',
  );
  assert.equal(normalizeInternalReturnHref('https://example.com'), '/');
  assert.equal(normalizeInternalReturnHref('//example.com'), '/');
});

test('buildPhotoDetailHref preserves a return target for detail navigation', () => {
  assert.equal(
    buildPhotoDetailHref('color-001', '/?sort=random&category=color&seed=123'),
    '/photos/color-001?from=%2F%3Fsort%3Drandom%26category%3Dcolor%26seed%3D123',
  );
  assert.equal(buildPhotoDetailHref('color-001'), '/photos/color-001');
});
