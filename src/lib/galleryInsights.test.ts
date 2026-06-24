import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGalleryInsights,
  filterPhotosForGallery,
} from './galleryInsights';
import type { Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo>): Photo => ({
  id: 'base',
  title: 'Untitled',
  category: 'street',
  src: 'https://example.com/photo.jpg',
  thumbnail: 'https://example.com/thumb.jpg',
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
  width: 1200,
  height: 800,
  ...overrides,
});

describe('gallery insights', () => {
  const photos = [
    buildPhoto({
      id: 'ricoh-night',
      title: 'Night crossing',
      category: 'night',
      camera: 'RICOH IMAGING COMPANY, LTD. RICOH GR III',
      lens: '18.3mm F2.8',
      location: 'Shanghai',
      description: 'Street reflections after rain',
      dateTaken: '2026-02-01 21:00:00',
    }),
    buildPhoto({
      id: 'sony-color',
      title: 'Tram color study',
      category: 'color',
      camera: 'Sony A7C',
      lens: 'FE 40mm F2.5 G',
      location: 'Hong Kong',
      description: 'Layered city color',
      dateTaken: '2026-03-04 13:10:00',
    }),
    buildPhoto({
      id: 'ricoh-color',
      title: 'Pocket light',
      category: 'color',
      camera: 'RICOH IMAGING COMPANY, LTD. RICOH GR III',
      lens: '18.3mm F2.8',
      location: 'Shanghai',
      description: 'Compact camera diary',
      dateTaken: '2026-01-01 08:30:00',
    }),
  ];

  it('summarizes the photo archive into Afilmory-style facets', () => {
    const insights = createGalleryInsights(photos);

    assert.equal(insights.totalPhotos, 3);
    assert.equal(insights.cameraCount, 2);
    assert.equal(insights.lensCount, 2);
    assert.equal(insights.locationCount, 2);
    assert.deepEqual(insights.categories.slice(0, 2), [
      { value: 'color', label: 'Color', count: 2 },
      { value: 'night', label: 'Night', count: 1 },
    ]);
    assert.deepEqual(insights.cameras[0], {
      value: 'RICOH GR III',
      label: 'RICOH GR III',
      count: 2,
    });
  });

  it('filters photos by category, camera, location, and free text query', () => {
    const filtered = filterPhotosForGallery(photos, {
      camera: 'RICOH GR III',
      category: 'color',
      lens: '',
      location: 'Shanghai',
      query: 'pocket diary',
    });

    assert.deepEqual(
      filtered.map((photo) => photo.id),
      ['ricoh-color'],
    );
  });

  it('matches free text across metadata without requiring exact order', () => {
    const filtered = filterPhotosForGallery(photos, {
      camera: '',
      category: 'all',
      lens: '',
      location: '',
      query: 'city tram',
    });

    assert.deepEqual(
      filtered.map((photo) => photo.id),
      ['sony-color'],
    );
  });
});
