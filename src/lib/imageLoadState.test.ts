import assert from 'node:assert/strict';
import test from 'node:test';

import { isRenderableImageComplete } from './imageLoadState';

test('isRenderableImageComplete accepts cached images with dimensions', () => {
  assert.equal(
    isRenderableImageComplete({
      complete: true,
      naturalWidth: 1200,
    }),
    true,
  );
});

test('isRenderableImageComplete rejects failed complete images without width', () => {
  assert.equal(
    isRenderableImageComplete({
      complete: true,
      naturalWidth: 0,
    }),
    false,
  );
});
