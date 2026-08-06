import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHomeSearchOptions,
  filterHomePhotos,
  type HomeSearchState,
} from './homeSearch';
import type { Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo>): Photo => ({
  id: 'photo-001',
  title: 'Photo 001',
  category: 'travel',
  src: 'https://example.com/photo.jpg',
  thumbnail: 'https://example.com/photo-thumb.jpg',
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
  width: 1600,
  height: 1200,
  ...overrides,
});

const emptyState: HomeSearchState = {
  query: '',
  selectedTags: [],
  tagMode: 'any',
};

describe('home search helpers', () => {
  it('filters photos by title, location, camera, and tags', () => {
    const photos = [
      buildPhoto({
        id: 'tokyo-night',
        title: 'Tokyo night crossing',
        location: 'Tokyo',
        camera: 'FUJIFILM X-T5',
        tags: ['street', 'night'],
      }),
      buildPhoto({
        id: 'quiet-portrait',
        title: 'Quiet portrait',
        category: 'portrait',
        location: 'Shanghai',
        camera: 'RICOH GR III',
        tags: ['portrait'],
      }),
    ];

    assert.deepEqual(
      filterHomePhotos(photos, { ...emptyState, query: 'x-t5 night' }).map(
        (photo) => photo.id,
      ),
      ['tokyo-night'],
    );
  });

  it('supports any-tag and all-tag filtering', () => {
    const photos = [
      buildPhoto({ id: 'street-night', tags: ['street', 'night'] }),
      buildPhoto({ id: 'street-day', tags: ['street', 'day'] }),
      buildPhoto({ id: 'portrait-night', tags: ['portrait', 'night'] }),
    ];

    assert.deepEqual(
      filterHomePhotos(photos, {
        ...emptyState,
        selectedTags: ['street', 'night'],
        tagMode: 'any',
      }).map((photo) => photo.id),
      ['street-night', 'street-day', 'portrait-night'],
    );
    assert.deepEqual(
      filterHomePhotos(photos, {
        ...emptyState,
        selectedTags: ['street', 'night'],
        tagMode: 'all',
      }).map((photo) => photo.id),
      ['street-night'],
    );
  });

  it('builds deduplicated search options with result counts', () => {
    const options = buildHomeSearchOptions([
      buildPhoto({
        id: 'one',
        category: 'travel',
        location: 'Tokyo',
        tags: ['night', 'travel'],
      }),
      buildPhoto({
        id: 'two',
        category: 'travel',
        location: 'Tokyo',
        tags: ['travel'],
      }),
    ]);

    assert.deepEqual(
      options.map((option) => [option.value, option.kind, option.count]),
      [
        ['travel', 'category', 2],
        ['Tokyo', 'location', 2],
        ['night', 'tag', 1],
      ],
    );
  });
});
