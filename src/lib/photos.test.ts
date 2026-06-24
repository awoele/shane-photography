import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fetchPhotos, getPhotoMetadataGroups, type Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo>): Photo => ({
  id: 'frame-001',
  title: 'Frame 001',
  category: 'night',
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

describe('photo metadata groups', () => {
  it('groups capture, camera, exposure, and notes fields for the archive panel', () => {
    const groups = getPhotoMetadataGroups(
      buildPhoto({
        title: 'Rain after dark',
        location: 'Shanghai',
        camera: 'RICOH IMAGING COMPANY, LTD. RICOH GR III',
        lens: '18.3mm F2.8',
        focalLength: '18.3mm',
        aperture: 'f/2.8',
        shutterSpeed: '1/80s',
        iso: '400',
        dateTaken: '2026-02-01 21:00:00',
        description: 'A wet pavement frame.',
      }),
    );

    assert.deepEqual(
      groups.map((group) => group.title),
      ['Capture', 'Camera', 'Exposure', 'Notes'],
    );
    assert.deepEqual(groups[0]?.fields.slice(0, 2), [
      { label: 'Title', value: 'Rain after dark' },
      { label: 'Time', value: '2026-02-01 21:00:00' },
    ]);
    assert.deepEqual(groups[1]?.fields, [
      { label: 'Body', value: 'RICOH GR III' },
      { label: 'Lens', value: '18.3mm F2.8' },
    ]);
    assert.deepEqual(groups[2]?.fields, [
      { label: 'Focal Length', value: '18.3mm' },
      { label: 'Aperture', value: 'f/2.8' },
      { label: 'Shutter Speed', value: '1/80s' },
      { label: 'ISO', value: 'ISO 400' },
    ]);
  });

  it('omits the notes group when the photo has no description', () => {
    const groups = getPhotoMetadataGroups(buildPhoto({ description: '' }));

    assert.deepEqual(
      groups.map((group) => group.title),
      ['Capture', 'Camera', 'Exposure'],
    );
  });
});

describe('photo JSON normalization', () => {
  const withMockedPhotoJson = async <T>(
    records: Array<Record<string, unknown>>,
    callback: () => Promise<T>,
  ) => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(JSON.stringify(records), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      });

    try {
      return await callback();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };

  it('does not infer live photo video from ordinary image src fields', async () => {
    await withMockedPhotoJson(
      [
        {
          id: 'frame-001',
          title: 'Frame 001',
          category: 'night',
          src: '/photos/frame-001.jpg',
          thumbnail: '/thumbs/frame-001.jpg',
          width: 1200,
          height: 800,
        },
      ],
      async () => {
        const [photo] = await fetchPhotos();

        assert.equal(photo?.video, undefined);
      },
    );
  });

  it('normalizes explicit live photo video fields', async () => {
    await withMockedPhotoJson(
      [
        {
          id: 'frame-001',
          title: 'Frame 001',
          category: 'night',
          src: '/photos/frame-001.jpg',
          thumbnail: '/thumbs/frame-001.jpg',
          livePhotoVideoUrl: '/live/frame-001.mp4',
          width: 1200,
          height: 800,
        },
      ],
      async () => {
        const [photo] = await fetchPhotos();

        assert.deepEqual(photo?.video, {
          type: 'live-photo',
          videoUrl:
            'https://storage.googleapis.com/shane-photos/live/frame-001.mp4',
          s3Key: 'live/frame-001.mp4',
        });
      },
    );
  });

  it('normalizes rich Afilmory manifest-style metadata for future uploads', async () => {
    await withMockedPhotoJson(
      [
        {
          id: 'DSCF9001',
          title: 'Future frame',
          tags: ['travel', 'night'],
          originalUrl: '/photos/future/DSCF9001.JPG',
          thumbnailUrl: '/thumbs/future/DSCF9001.JPG',
          width: 6000,
          height: 4000,
          size: 12_345_678,
          digest: 'abc12345',
          s3Key: 'photos/future/DSCF9001.JPG',
          lastModified: '2026-06-22T12:34:56.000Z',
          thumbHash: 'abcd',
          isHDR: true,
          toneAnalysis: {
            toneType: 'high-contrast',
            brightness: 61,
            contrast: 73,
            shadowRatio: 0.42,
            highlightRatio: 0.19,
          },
          location: {
            latitude: 31.2304,
            longitude: 121.4737,
            city: 'Shanghai',
            country: 'China',
            locationName: 'The Bund',
          },
          exif: {
            Make: 'FUJIFILM',
            Model: 'X-T5',
            LensMake: 'FUJIFILM',
            LensModel: 'XF 35mm F1.4 R',
            FocalLength: '35mm',
            FNumber: 1.4,
            ExposureTime: '1/250',
            ISO: 320,
            DateTimeOriginal: '2026-06-22T12:34:56.000Z',
            Software: 'Digital Camera X-T5 Ver4.31',
            Artist: 'Shane',
            Rating: 5,
            FujiRecipe: {
              FilmMode: 'Classic Chrome',
              DynamicRange: 'DR400',
              HighlightTone: '-1',
              ShadowTone: '+1',
              Saturation: '+2',
              Sharpness: '0',
              NoiseReduction: '-4',
              Clarity: 0,
              ColorChromeEffect: 'Strong',
              ColorChromeFxBlue: 'Weak',
              WhiteBalanceFineTune: 'Red +1 Blue -2',
            },
          },
        },
      ],
      async () => {
        const [photo] = await fetchPhotos();

        assert.equal(
          photo?.src,
          'https://storage.googleapis.com/shane-photos/photos/future/DSCF9001.JPG',
        );
        assert.equal(
          photo?.thumbnail,
          'https://storage.googleapis.com/shane-photos/thumbs/future/DSCF9001.JPG',
        );
        assert.equal(photo?.category, 'travel');
        assert.deepEqual(photo?.tags, ['travel', 'night']);
        assert.equal(photo?.fileSize, 12_345_678);
        assert.equal(photo?.digest, 'abc12345');
        assert.equal(photo?.s3Key, 'photos/future/DSCF9001.JPG');
        assert.equal(photo?.lastModified, '2026-06-22T12:34:56.000Z');
        assert.equal(photo?.isHDR, true);
        assert.equal(photo?.thumbHash, 'abcd');
        assert.equal(photo?.rating, 5);
        assert.equal(photo?.location, 'The Bund');
        assert.deepEqual(photo?.manifestLocation, {
          latitude: 31.2304,
          longitude: 121.4737,
          city: 'Shanghai',
          country: 'China',
          locationName: 'The Bund',
        });
        assert.equal(photo?.toneAnalysis?.toneType, 'high-contrast');
        assert.equal(photo?.exif?.Software, 'Digital Camera X-T5 Ver4.31');
        assert.equal(photo?.exif?.FujiRecipe?.FilmMode, 'Classic Chrome');
      },
    );
  });
});
