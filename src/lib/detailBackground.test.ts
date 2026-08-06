import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPreviousDetailBackgroundState,
  createDetailBackgroundState,
  resolveDetailBackgroundState,
} from './detailBackground';

test('resolveDetailBackgroundState keeps the old background while a new background becomes current', () => {
  const state = createDetailBackgroundState('/photos/one.jpg');

  const next = resolveDetailBackgroundState(state, '/photos/two.jpg');

  assert.equal(next.currentSrc, '/photos/two.jpg');
  assert.equal(next.previousSrc, '/photos/one.jpg');
  assert.equal(next.version, 1);
});

test('resolveDetailBackgroundState keeps a fully covering previous layer during transitions', () => {
  const state = resolveDetailBackgroundState(
    createDetailBackgroundState('/photos/one.jpg'),
    '/photos/two.jpg',
  );

  assert.equal(state.previousOpacity, 1);
  assert.equal(state.currentOpacity, 1);
});

test('resolveDetailBackgroundState ignores unchanged or empty sources', () => {
  const state = createDetailBackgroundState('/photos/one.jpg');

  assert.equal(resolveDetailBackgroundState(state, '/photos/one.jpg'), state);
  assert.equal(resolveDetailBackgroundState(state, ''), state);
});

test('clearPreviousDetailBackgroundState only clears the matching transition version', () => {
  const state = resolveDetailBackgroundState(
    createDetailBackgroundState('/photos/one.jpg'),
    '/photos/two.jpg',
  );

  assert.equal(
    clearPreviousDetailBackgroundState(state, state.version - 1).previousSrc,
    '/photos/one.jpg',
  );
  assert.equal(
    clearPreviousDetailBackgroundState(state, state.version).previousSrc,
    '',
  );
});
