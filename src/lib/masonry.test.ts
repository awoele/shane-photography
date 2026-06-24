import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMasonryColumns, getMasonryColumnCount } from './masonry';
import type { Photo } from './photos';

const buildPhoto = (id: string, width = 1600, height = 1200): Photo => ({
  id,
  title: id,
  category: 'color',
  src: `https://example.com/${id}.jpg`,
  thumbnail: '',
  description: '',
  location: '',
  date: '',
  camera: '',
  lens: '',
  focalLength: '',
  aperture: '',
  shutterSpeed: '',
  iso: '',
  dateTaken: '',
  width,
  height,
});

describe('masonry layout helpers', () => {
  it('chooses enough columns to fill wide gallery rows', () => {
    assert.equal(getMasonryColumnCount(1920, 15), 6);
    assert.equal(getMasonryColumnCount(1400, 15), 5);
    assert.equal(getMasonryColumnCount(900, 15), 3);
  });

  it('never creates empty columns when there are fewer photos than slots', () => {
    assert.equal(getMasonryColumnCount(1920, 3), 3);

    const columns = buildMasonryColumns(
      [buildPhoto('one'), buildPhoto('two'), buildPhoto('three')],
      6,
    );

    assert.equal(columns.length, 3);
    assert.deepEqual(
      columns.map((column) => column.photos.map((photo) => photo.id)),
      [['one'], ['two'], ['three']],
    );
  });

  it('distributes all photos into non-empty columns', () => {
    const photos = Array.from({ length: 15 }, (_, index) =>
      buildPhoto(`photo-${index + 1}`, index % 2 === 0 ? 1200 : 900, 1200),
    );
    const columns = buildMasonryColumns(photos, 6);

    assert.equal(columns.length, 6);
    assert.equal(
      columns.reduce((total, column) => total + column.photos.length, 0),
      photos.length,
    );
    assert.ok(columns.every((column) => column.photos.length > 0));
  });
});
