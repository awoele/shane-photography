import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPreviousDetailImageDisplay,
  createDetailImageState,
  resolveDetailImageStateForRender,
} from './detailImageState';

test('resolveDetailImageStateForRender keeps the current display while the next photo loads', () => {
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
  assert.equal(next.displaySrc, '/photos/one.jpg');
  assert.equal(next.previousDisplaySrc, '');
  assert.equal(next.loading, true);
});

test('resolveDetailImageStateForRender keeps the old display underneath a newly ready photo', () => {
  const previous = createDetailImageState({
    placeholderSrc: '/thumbs/one.jpg',
    sourceReady: true,
    src: '/photos/one.jpg',
  });

  const loadingNext = resolveDetailImageStateForRender({
    current: previous,
    placeholderSrc: '/thumbs/two.jpg',
    sourceReady: false,
    src: '/photos/two.jpg',
  });

  const readyNext = resolveDetailImageStateForRender({
    current: loadingNext,
    placeholderSrc: '/thumbs/two.jpg',
    sourceReady: true,
    src: '/photos/two.jpg',
  });

  assert.equal(readyNext.source, '/photos/two.jpg');
  assert.equal(readyNext.displaySrc, '/photos/two.jpg');
  assert.equal(readyNext.previousDisplaySrc, '/photos/one.jpg');
  assert.equal(readyNext.loading, false);
});

test('clearPreviousDetailImageDisplay removes only the painted transition layer', () => {
  const state = resolveDetailImageStateForRender({
    current: createDetailImageState({
      placeholderSrc: '/thumbs/one.jpg',
      sourceReady: true,
      src: '/photos/one.jpg',
    }),
    placeholderSrc: '/thumbs/two.jpg',
    sourceReady: true,
    src: '/photos/two.jpg',
  });

  const staleClear = clearPreviousDetailImageDisplay(
    state,
    '/photos/three.jpg',
  );
  const matchingClear = clearPreviousDetailImageDisplay(
    state,
    '/photos/two.jpg',
  );

  assert.equal(staleClear.previousDisplaySrc, '/photos/one.jpg');
  assert.equal(matchingClear.previousDisplaySrc, '');
});

test('createDetailImageState renders the full image immediately while loading', () => {
  const state = createDetailImageState({
    placeholderSrc: '/thumbs/one.jpg',
    sourceReady: false,
    src: '/photos/one.jpg',
  });

  assert.equal(state.displaySrc, '/photos/one.jpg');
  assert.equal(state.progress, 0);
  assert.equal(state.loading, true);
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
