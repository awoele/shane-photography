import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLIC_GALLERY_CACHE_CONTROL } from './cacheHeaders';

test('PUBLIC_GALLERY_CACHE_CONTROL prevents stale gallery HTML after CMS uploads', () => {
  assert.equal(PUBLIC_GALLERY_CACHE_CONTROL, 'no-store, max-age=0');
});
