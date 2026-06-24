import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAfilmoryManifest,
  createAfilmoryPhotoLoader,
  createPhotoFromAfilmoryItem,
  getAfilmoryFeatureCapabilities,
} from './afilmoryManifest';
import type { Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: 'frame-001',
  title: 'Frame 001',
  category: 'travel',
  src: 'https://storage.googleapis.com/shane-photos/photos/frame-001.jpg',
  thumbnail: 'https://storage.googleapis.com/shane-photos/thumbs/frame-001.jpg',
  description: '',
  location: 'Tokyo',
  date: '',
  camera: 'FUJIFILM X-T5',
  lens: 'XF75mmF1.2',
  focalLength: '75mm',
  aperture: 'f/1.4',
  shutterSpeed: '1/1000s',
  iso: '800',
  dateTaken: '2025-08-30 20:15:05',
  width: 7728,
  height: 5152,
  ...overrides,
});

describe('Afilmory manifest architecture', () => {
  it('adapts the current photo records into an Afilmory-compatible manifest', () => {
    const manifest = createAfilmoryManifest([buildPhoto()]);
    const [photo] = manifest.data;

    assert.equal(manifest.version, 'v1');
    assert.equal(photo?.id, 'frame-001');
    assert.equal(photo?.originalUrl, buildPhoto().src);
    assert.equal(photo?.thumbnailUrl, buildPhoto().thumbnail);
    assert.equal(photo?.format, 'JPG');
    assert.equal(photo?.aspectRatio, 1.5);
    assert.equal(photo?.video, undefined);
    assert.deepEqual(photo?.tags, ['travel']);
    assert.equal(photo?.exif?.Make, 'FUJIFILM');
    assert.equal(photo?.exif?.Model, 'X-T5');
    assert.equal(photo?.exif?.LensModel, 'XF75mmF1.2');
    assert.equal(photo?.exif?.ISO, 800);
    assert.equal(photo?.toneAnalysis?.toneType, 'normal');
    assert.equal(photo?.location?.locationName, 'Tokyo');
    assert.deepEqual(manifest.cameras, [
      {
        make: 'FUJIFILM',
        model: 'X-T5',
        displayName: 'FUJIFILM X-T5',
      },
    ]);
    assert.deepEqual(manifest.lenses, [
      {
        displayName: 'XF75mmF1.2',
        model: 'XF75mmF1.2',
      },
    ]);
  });

  it('exposes Afilmory-style loader queries, facets, neighbors, and filters', () => {
    const manifest = createAfilmoryManifest([
      buildPhoto({
        id: 'travel-001',
        category: 'travel',
        location: 'Tokyo',
        title: 'Morning tower',
        dateTaken: '2025-08-30 20:15:05',
      }),
      buildPhoto({
        id: 'night-001',
        category: 'night',
        camera: 'RICOH IMAGING COMPANY, LTD. RICOH GR III',
        lens: '18.3mm F2.8',
        location: 'Shanghai',
        title: 'Night crossing',
        description: 'Street reflections after rain',
        dateTaken: '2026-02-01 21:00:00',
      }),
      buildPhoto({
        id: 'travel-002',
        category: 'travel',
        location: 'Kyoto',
        title: 'Quiet shrine',
        dateTaken: '2024-04-01 10:00:00',
      }),
    ]);
    const loader = createAfilmoryPhotoLoader(manifest);

    assert.deepEqual(loader.getAllTags(), ['night', 'travel']);
    assert.deepEqual(
      loader.getAllCameras().map((camera) => camera.displayName),
      ['FUJIFILM X-T5', 'RICOH GR III'],
    );
    assert.equal(loader.getPhoto('night-001')?.title, 'Night crossing');
    assert.equal(
      loader.getCircularNeighbors('travel-001').previous?.id,
      'travel-002',
    );
    assert.equal(
      loader.getCircularNeighbors('travel-001').next?.id,
      'night-001',
    );

    const filtered = loader.filterPhotos({
      cameras: ['RICOH GR III'],
      locations: ['Shanghai'],
      query: 'rain street',
      tags: ['night'],
    });

    assert.deepEqual(
      filtered.map((photo) => photo.id),
      ['night-001'],
    );

    assert.deepEqual(
      loader
        .filterPhotos({ sortOrder: 'asc', tags: ['travel'] })
        .map((photo) => photo.id),
      ['travel-002', 'travel-001'],
    );
  });

  it('creates the existing page view model from an Afilmory manifest item', () => {
    const [item] = createAfilmoryManifest([
      buildPhoto({
        category: 'color',
        location: 'Hong Kong',
      }),
    ]).data;

    assert.ok(item);
    const photo = createPhotoFromAfilmoryItem(item);

    assert.deepEqual(
      {
        id: photo.id,
        title: photo.title,
        category: photo.category,
        src: photo.src,
        thumbnail: photo.thumbnail,
        description: photo.description,
        location: photo.location,
        date: photo.date,
        camera: photo.camera,
        lens: photo.lens,
        focalLength: photo.focalLength,
        aperture: photo.aperture,
        shutterSpeed: photo.shutterSpeed,
        iso: photo.iso,
        dateTaken: photo.dateTaken,
        width: photo.width,
        height: photo.height,
      },
      {
        id: 'frame-001',
        title: 'Frame 001',
        category: 'color',
        src: buildPhoto().src,
        thumbnail: buildPhoto().thumbnail,
        description: '',
        location: 'Hong Kong',
        date: '2025-08-30 20:15:05',
        camera: 'FUJIFILM X-T5',
        lens: 'XF75mmF1.2',
        focalLength: '75mm',
        aperture: 'f/1.4',
        shutterSpeed: '1/1000s',
        iso: '800',
        dateTaken: '2025-08-30 20:15:05',
        width: 7728,
        height: 5152,
      },
    );
    assert.equal(photo.exif?.Software, undefined);
    assert.equal(photo.toneAnalysis?.toneType, 'normal');
    assert.deepEqual(photo.tags, ['color']);
  });

  it('carries Afilmory live photo video sources through the manifest', () => {
    const [item] = createAfilmoryManifest([
      buildPhoto({
        video: {
          type: 'live-photo',
          videoUrl:
            'https://storage.googleapis.com/shane-photos/live/frame-001.mov',
          s3Key: 'live/frame-001.mov',
        },
      }),
    ]).data;

    assert.deepEqual(item?.video, {
      type: 'live-photo',
      videoUrl:
        'https://storage.googleapis.com/shane-photos/live/frame-001.mov',
      s3Key: 'live/frame-001.mov',
    });
    assert.equal(getAfilmoryFeatureCapabilities(item!).hasLivePhoto, true);
  });

  it('carries Afilmory motion photo metadata through the manifest', () => {
    const [item] = createAfilmoryManifest([
      buildPhoto({
        video: {
          type: 'motion-photo',
          offset: 1024,
          size: 2048,
          presentationTimestamp: 123456,
        },
      }),
    ]).data;

    assert.deepEqual(item?.video, {
      type: 'motion-photo',
      offset: 1024,
      size: 2048,
      presentationTimestamp: 123456,
    });
    assert.equal(getAfilmoryFeatureCapabilities(item!).hasMotionPhoto, true);
  });

  it('reports core Afilmory capability flags for rich photo records', () => {
    const [item] = createAfilmoryManifest([
      buildPhoto({
        isHDR: true,
        rating: 5,
        thumbHash: 'd9e1',
        fujiRecipe: {
          DynamicRange: 'DR400',
          FilmMode: 'Classic Chrome',
          GrainEffectRoughness: 'Weak',
          ColorChromeEffect: 'Strong',
          ColorChromeFxBlue: 'Weak',
          WhiteBalance: 'Auto',
          HighlightTone: '-1',
          ShadowTone: '+1',
          Saturation: '+2',
          Sharpness: '0',
          NoiseReduction: '-4',
          Clarity: 0,
        },
      }),
    ]).data;

    assert.deepEqual(getAfilmoryFeatureCapabilities(item!), {
      hasFujiRecipe: true,
      hasHDR: true,
      hasLivePhoto: false,
      hasLocation: true,
      hasMotionPhoto: false,
      hasRating: true,
      hasThumbHash: true,
      hasToneAnalysis: true,
      hasVideo: false,
    });
  });
});
