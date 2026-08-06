import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldPreventTopPull } from './mobileScrollGuard';

describe('mobile scroll guard', () => {
  it('prevents downward pull when the scroll target is already at the top', () => {
    assert.equal(
      shouldPreventTopPull({
        currentTouchY: 140,
        scrollTop: 0,
        startTouchY: 100,
      }),
      true,
    );
  });

  it('allows normal upward content scrolling', () => {
    assert.equal(
      shouldPreventTopPull({
        currentTouchY: 80,
        scrollTop: 0,
        startTouchY: 100,
      }),
      false,
    );
  });

  it('allows downward movement when the scroll target can still scroll up', () => {
    assert.equal(
      shouldPreventTopPull({
        currentTouchY: 140,
        scrollTop: 12,
        startTouchY: 100,
      }),
      false,
    );
  });
});
