import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDetailImageState,
  resolveDetailImageStateForRender,
} from './detailImageState';

test('resolveDetailImageStateForRender never reuses the previous photo source', () => {
  const previous = createDetailImageState({
    placeholderSrc: '/thumbs/one.jpg',
    sourceReady: true,
    src: '/photos/one.jpg',
  });

  const next = resolveDetailImageStateForRender({
    current: previous,
    placeholderSrc: '/thumbs/two.jpg',
    sourceReady: false,
    src: '/photos/two.jpg',
  });

  assert.equal(next.source, '/photos/two.jpg');
  assert.equal(next.displaySrc, '/thumbs/two.jpg');
  assert.equal(next.loading, true);
});

test('createDetailImageState shows the full image immediately when ready', () => {
  const state = createDetailImageState({
    placeholderSrc: '/thumbs/one.jpg',
    sourceReady: true,
    src: '/photos/one.jpg',
  });

  assert.equal(state.displaySrc, '/photos/one.jpg');
  assert.equal(state.progress, 100);
  assert.equal(state.loading, false);
});
