import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getOrderedGalleryPhotos } from './galleryOrdering';
import type { Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo>): Photo => ({
  aperture: '',
  camera: '',
  category: 'portrait',
  date: '2026-01-01',
  dateTaken: '2026-01-01T00:00:00',
  description: '',
  focalLength: '',
  height: 1200,
  id: 'photo-001',
  iso: '',
  lens: '',
  location: '',
  shutterSpeed: '',
  src: 'https://example.com/photo.jpg',
  thumbnail: 'https://example.com/thumb.jpg',
  title: 'Photo 001',
  width: 1800,
  ...overrides,
});

describe('gallery ordering', () => {
  it('sorts a selected latest category by managed sortOrder before timestamps', () => {
    const ordered = getOrderedGalleryPhotos({
      category: 'portrait',
      photos: [
        buildPhoto({
          category: 'travel',
          dateTaken: '2027-01-01T00:00:00',
          id: 'travel-001',
          title: 'Travel 001',
        }),
        buildPhoto({
          dateTaken: '2026-03-03T00:00:00',
          id: 'portrait-003',
          sortOrder: 3,
          title: 'Portrait 003',
        }),
        buildPhoto({
          dateTaken: '2026-01-01T00:00:00',
          id: 'portrait-001',
          sortOrder: 1,
          title: 'Portrait 001',
        }),
        buildPhoto({
          dateTaken: '2026-02-02T00:00:00',
          id: 'portrait-002',
          sortOrder: 2,
          title: 'Portrait 002',
        }),
      ],
      seed: 123,
      sortMode: 'latest',
    });

    assert.deepEqual(
      ordered.map((photo) => photo.id),
      ['portrait-001', 'portrait-002', 'portrait-003'],
    );
  });

  it('keeps random category ordering deterministic after filtering', () => {
    const photos = [
      buildPhoto({ category: 'travel', id: 'travel-001' }),
      buildPhoto({ id: 'portrait-001' }),
      buildPhoto({ id: 'portrait-002' }),
      buildPhoto({ id: 'portrait-003' }),
    ];

    const first = getOrderedGalleryPhotos({
      category: 'portrait',
      photos,
      seed: 456,
      sortMode: 'random',
    });
    const second = getOrderedGalleryPhotos({
      category: 'portrait',
      photos,
      seed: 456,
      sortMode: 'random',
    });

    assert.deepEqual(
      first.map((photo) => photo.id),
      second.map((photo) => photo.id),
    );
    assert.deepEqual(
      first.map((photo) => photo.category),
      ['portrait', 'portrait', 'portrait'],
    );
  });

  it('applies managed ordering to latest view across all categories', () => {
    const ordered = getOrderedGalleryPhotos({
      category: 'all',
      photos: [
        buildPhoto({
          category: 'travel',
          dateTaken: '2027-01-01T00:00:00',
          id: 'travel-001',
        }),
        buildPhoto({
          dateTaken: '2026-03-03T00:00:00',
          id: 'portrait-003',
          sortOrder: 3,
        }),
        buildPhoto({
          dateTaken: '2026-01-01T00:00:00',
          id: 'portrait-001',
          sortOrder: 1,
        }),
        buildPhoto({
          dateTaken: '2026-02-02T00:00:00',
          id: 'portrait-002',
          sortOrder: 2,
        }),
      ],
      seed: 123,
      sortMode: 'latest',
    });

    assert.deepEqual(
      ordered.map((photo) => photo.id),
      ['travel-001', 'portrait-001', 'portrait-002', 'portrait-003'],
    );
  });
});
