import assert from 'node:assert/strict';
import test from 'node:test';

import { getSlideScrollLockCleanupPlan } from './slideScrollLock';

test('getSlideScrollLockCleanupPlan does not touch the slide page', () => {
  assert.deepEqual(
    getSlideScrollLockCleanupPlan({
      pathname: '/slide',
      body: {
        overflow: 'hidden',
        overscrollBehavior: 'none',
        position: 'fixed',
        touchAction: 'none',
      },
      root: {
        overflow: 'hidden',
        overscrollBehavior: 'none',
        position: 'fixed',
        touchAction: 'none',
      },
    }),
    {
      body: [],
      root: [],
    },
  );
});

test('getSlideScrollLockCleanupPlan clears stale slide locks on ordinary pages', () => {
  assert.deepEqual(
    getSlideScrollLockCleanupPlan({
      pathname: '/',
      body: {
        overflow: 'hidden',
        overscrollBehavior: 'none',
        position: 'fixed',
        touchAction: 'none',
      },
      root: {
        overflow: 'hidden',
        overscrollBehavior: 'none',
        position: 'fixed',
        touchAction: 'none',
      },
    }),
    {
      body: [
        'height',
        'left',
        'overflow',
        'overscrollBehavior',
        'position',
        'right',
        'touchAction',
        'top',
        'width',
      ],
      root: [
        '--slide-viewport-height',
        'height',
        'left',
        'overflow',
        'overscrollBehavior',
        'position',
        'right',
        'touchAction',
        'top',
        'width',
      ],
    },
  );
});

test('getSlideScrollLockCleanupPlan clears a lone stale body overflow lock on ordinary pages', () => {
  assert.deepEqual(
    getSlideScrollLockCleanupPlan({
      pathname: '/',
      body: {
        overflow: 'hidden',
        overscrollBehavior: '',
        position: '',
        touchAction: '',
      },
      root: {
        overflow: '',
        overscrollBehavior: '',
        position: '',
        touchAction: '',
      },
    }),
    {
      body: ['overflow'],
      root: [],
    },
  );
});

test('getSlideScrollLockCleanupPlan leaves unlocked document styles alone', () => {
  assert.deepEqual(
    getSlideScrollLockCleanupPlan({
      pathname: '/',
      body: {
        overflow: '',
        overscrollBehavior: '',
        position: '',
        touchAction: '',
      },
      root: {
        overflow: '',
        overscrollBehavior: '',
        position: '',
        touchAction: '',
      },
    }),
    {
      body: [],
      root: [],
    },
  );
});
