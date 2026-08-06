import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySavedSortOrderToPhotos,
  getVerticalSortPointerTarget,
  movePhotoIdBeforeTarget,
} from './adminPhotoSort';

test('movePhotoIdBeforeTarget moves an item forward', () => {
  assert.deepEqual(
    movePhotoIdBeforeTarget({
      activeId: 'd',
      ids: ['a', 'b', 'c', 'd'],
      targetId: 'b',
    }),
    ['a', 'd', 'b', 'c'],
  );
});

test('movePhotoIdBeforeTarget moves an item backward', () => {
  assert.deepEqual(
    movePhotoIdBeforeTarget({
      activeId: 'a',
      ids: ['a', 'b', 'c', 'd'],
      targetId: 'd',
    }),
    ['b', 'c', 'a', 'd'],
  );
});

test('movePhotoIdBeforeTarget can insert after the target', () => {
  assert.deepEqual(
    movePhotoIdBeforeTarget({
      activeId: 'a',
      ids: ['a', 'b', 'c', 'd'],
      placement: 'after',
      targetId: 'd',
    }),
    ['b', 'c', 'd', 'a'],
  );
});

test('movePhotoIdBeforeTarget keeps order when ids are missing', () => {
  const ids = ['a', 'b', 'c'];

  assert.equal(
    movePhotoIdBeforeTarget({
      activeId: 'x',
      ids,
      targetId: 'b',
    }),
    ids,
  );
});

test('getVerticalSortPointerTarget picks before or after from row midpoint', () => {
  assert.deepEqual(
    getVerticalSortPointerTarget({
      pointerY: 75,
      rows: [{ bottom: 100, id: 'a', top: 0 }],
    }),
    { placement: 'after', targetId: 'a' },
  );

  assert.deepEqual(
    getVerticalSortPointerTarget({
      pointerY: 25,
      rows: [{ bottom: 100, id: 'a', top: 0 }],
    }),
    { placement: 'before', targetId: 'a' },
  );
});

test('getVerticalSortPointerTarget supports fast movement outside visible row bounds', () => {
  const rows = [
    { bottom: 100, id: 'a', top: 0 },
    { bottom: 220, id: 'b', top: 120 },
    { bottom: 340, id: 'c', top: 240 },
  ];

  assert.deepEqual(getVerticalSortPointerTarget({ pointerY: -80, rows }), {
    placement: 'before',
    targetId: 'a',
  });

  assert.deepEqual(getVerticalSortPointerTarget({ pointerY: 500, rows }), {
    placement: 'after',
    targetId: 'c',
  });
});

test('applySavedSortOrderToPhotos updates only the saved sequence ids', () => {
  assert.deepEqual(
    applySavedSortOrderToPhotos({
      ids: ['c', 'a'],
      photos: [
        { id: 'a', sortOrder: 9, title: 'A' },
        { id: 'b', sortOrder: 3, title: 'B' },
        { id: 'c', title: 'C' },
      ],
      sortStart: 1,
    }),
    [
      { id: 'a', sortOrder: 2, title: 'A' },
      { id: 'b', sortOrder: 3, title: 'B' },
      { id: 'c', sortOrder: 1, title: 'C' },
    ],
  );
});
