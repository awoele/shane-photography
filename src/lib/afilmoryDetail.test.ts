import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAfilmoryDetailSections,
  getCircularPhotoNeighbors,
  getFilmstripImageToneClass,
  getFilmstripPhotos,
  getFilmstripPreviewDimensions,
  getFilmstripThumbnailWidth,
} from './afilmoryDetail';
import { createAfilmoryManifestItem } from './afilmoryManifest';
import type { Photo } from './photos';

const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: 'DSCF4792',
  title: 'Iron Flower Show',
  category: 'night-show',
  src: 'https://example.com/photos/DSCF4792.HIF',
  thumbnail: 'https://example.com/thumbs/DSCF4792.jpg',
  description: '',
  location: 'Huzhou',
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

describe('afilmory detail helpers', () => {
  it('creates Afilmory-style inspector sections for the photo detail page', () => {
    const sections = createAfilmoryDetailSections(buildPhoto());

    assert.deepEqual(
      sections.map((section) => section.title),
      [
        '基本信息',
        '拍摄参数',
        '标签',
        '影调分析',
        '直方图',
        '设备信息',
        '拍摄模式',
        '胶片模拟配方',
        '位置信息',
        '技术参数',
      ],
    );
    assert.deepEqual(sections[0]?.fields, [
      { label: '文件名', value: 'DSCF4792' },
      { label: '格式', value: 'HIF' },
      { label: '尺寸', value: '7728 x 5152' },
      { label: '文件大小', value: '—' },
      { label: '像素', value: '39 MP' },
      { label: '色彩空间', value: 'sRGB' },
      { label: '拍摄时间', value: '2025/8/30 20:15:05' },
      { label: '时区', value: 'UTC+8' },
      { label: '艺术家', value: 'Shane' },
      { label: '软件', value: '—' },
    ]);
    assert.equal(sections[1]?.layout, 'parameter-grid');
    assert.deepEqual(sections[1]?.fields, [
      { label: '焦距', value: '75mm' },
      { label: '光圈', value: 'f/1.4' },
      { label: '快门', value: '1/1000s' },
      { label: 'ISO', value: 'ISO 800' },
    ]);
    assert.deepEqual(sections[2]?.chips, ['Night Show', 'Huzhou']);
    assert.deepEqual(sections[3]?.fields, [
      { label: '影调类型', value: '低调' },
      { label: '亮度', value: '待分析' },
      { label: '对比度', value: '待分析' },
      { label: '阴影占比', value: '待分析' },
      { label: '高光占比', value: '待分析' },
    ]);
    assert.equal(sections[4]?.layout, 'histogram');
    assert.deepEqual(sections[5]?.fields, [
      { label: '相机', value: 'FUJIFILM X-T5' },
      { label: '镜头', value: 'XF75mmF1.2' },
    ]);
  });

  it('prefers Afilmory manifest metadata when building inspector sections', () => {
    const manifestItem = createAfilmoryManifestItem(buildPhoto());

    manifestItem.size = 10_900_000;
    manifestItem.toneAnalysis = {
      toneType: 'low-key',
      brightness: 12,
      contrast: 41,
      shadowRatio: 0.89,
      highlightRatio: 0.05,
    };
    manifestItem.location = {
      latitude: 30.123456,
      longitude: 120.987654,
      locationName: 'Huzhou',
    };
    manifestItem.exif = {
      ...(manifestItem.exif ?? {}),
      ExposureProgram: 'Manual',
      FujiRecipe: {
        DynamicRange: 'Wide',
        FilmMode: 'Classic Negative',
        GrainEffectRoughness: 'Weak',
      },
      MeteringMode: 'Multi-segment',
      Software: 'Digital Camera X-T5 Ver4.31',
      WhiteBalance: 'Auto',
    };

    const sections = createAfilmoryDetailSections(buildPhoto(), manifestItem);

    assert.deepEqual(sections[0]?.fields.slice(3, 10), [
      { label: '文件大小', value: '10.9MB' },
      { label: '像素', value: '39 MP' },
      { label: '色彩空间', value: 'sRGB' },
      { label: '拍摄时间', value: '2025/8/30 20:15:05' },
      { label: '时区', value: 'UTC+8' },
      { label: '艺术家', value: 'Shane' },
      { label: '软件', value: 'Digital Camera X-T5 Ver4.31' },
    ]);
    assert.deepEqual(sections[3]?.fields, [
      { label: '影调类型', value: '低调' },
      { label: '亮度', value: '12%' },
      { label: '对比度', value: '41%' },
      { label: '阴影占比', value: '89%' },
      { label: '高光占比', value: '5%' },
    ]);
    assert.deepEqual(sections[6]?.fields, [
      { label: '测光模式', value: 'Multi-segment' },
      { label: '曝光程序', value: 'Manual' },
      { label: '白平衡', value: 'Auto' },
    ]);
    assert.deepEqual(sections[7]?.fields, [
      { label: '胶片模拟', value: 'Classic Negative' },
      { label: '动态范围', value: 'Wide' },
      { label: '颗粒效果', value: 'Weak' },
    ]);
    assert.deepEqual(sections[8]?.fields, [
      { label: '地点', value: 'Huzhou' },
      { label: '坐标', value: '30.12346, 120.98765' },
    ]);
    assert.deepEqual(sections[9]?.fields.at(-1), {
      label: '摘要',
      value: manifestItem.digest,
    });
  });

  it('expands rich Afilmory EXIF details when future uploads include them', () => {
    const manifestItem = createAfilmoryManifestItem(buildPhoto());

    manifestItem.isHDR = true;
    manifestItem.thumbHash = 'abcd';
    manifestItem.video = {
      type: 'live-photo',
      videoUrl: 'https://example.com/live/DSCF4792.mp4',
      s3Key: 'live/DSCF4792.mp4',
    };
    manifestItem.exif = {
      ...(manifestItem.exif ?? {}),
      ApertureValue: 1.4,
      BrightnessValue: 1.2,
      ColorSpace: 'Display P3',
      ExposureCompensation: -0.3,
      ExposureMode: 'Manual',
      Flash: 'Off',
      FocalLengthIn35mmFormat: '113mm',
      FocalPlaneXResolution: 6241,
      FocalPlaneYResolution: 6241,
      FujiRecipe: {
        Clarity: 0,
        ColorChromeEffect: 'Strong',
        ColorChromeFxBlue: 'Weak',
        DynamicRange: 'DR400',
        FilmMode: 'Classic Chrome',
        GrainEffectRoughness: 'Weak',
        GrainEffectSize: 'Small',
        HighlightTone: '-1',
        NoiseReduction: '-4',
        Saturation: '+2',
        ShadowTone: '+1',
        Sharpness: '0',
        WhiteBalanceFineTune: 'Red +1 Blue -2',
      },
      GPSAltitude: 18,
      GPSAltitudeRef: 0,
      LensMake: 'FUJIFILM',
      LightSource: 'Daylight',
      MaxApertureValue: 1.4,
      Orientation: 1,
      Rating: 5,
      SceneCaptureType: 'Standard',
      SensingMethod: 'One-chip color area',
      ShutterSpeedValue: '1/1000',
    };

    const sections = createAfilmoryDetailSections(buildPhoto(), manifestItem);
    const basicValues = sections[0]?.fields.map((field) => field.value) ?? [];
    const shootingValues =
      sections[6]?.fields.map((field) => field.value) ?? [];
    const fujiValues = sections[7]?.fields.map((field) => field.value) ?? [];
    const locationValues =
      sections[8]?.fields.map((field) => field.value) ?? [];
    const technicalValues =
      sections[9]?.fields.map((field) => field.value) ?? [];

    assert.ok(basicValues.includes('Display P3'));
    assert.ok(basicValues.includes('HDR'));
    assert.ok(basicValues.includes('5'));
    assert.ok(basicValues.includes('实况照片'));
    assert.ok(shootingValues.includes('Manual'));
    assert.ok(shootingValues.includes('Standard'));
    assert.ok(shootingValues.includes('Off'));
    assert.ok(shootingValues.includes('Daylight'));
    assert.ok(shootingValues.includes('-0.3 EV'));
    assert.ok(fujiValues.includes('Classic Chrome'));
    assert.ok(fujiValues.includes('DR400'));
    assert.ok(fujiValues.includes('Strong'));
    assert.ok(fujiValues.includes('Red +1 Blue -2'));
    assert.ok(fujiValues.includes('-4'));
    assert.ok(locationValues.includes('18m'));
    assert.ok(technicalValues.includes('1'));
    assert.ok(technicalValues.includes('113mm'));
    assert.ok(technicalValues.includes('1.2 EV'));
    assert.ok(technicalValues.includes('6241 x 6241'));
  });

  it('returns circular previous and next photos', () => {
    const photos = ['one', 'two', 'three'].map((id) => buildPhoto({ id }));

    assert.equal(getCircularPhotoNeighbors(photos, 0).previous?.id, 'three');
    assert.equal(getCircularPhotoNeighbors(photos, 0).next?.id, 'two');
  });

  it('returns every photo for a continuously scrollable filmstrip', () => {
    const photos = Array.from({ length: 12 }, (_, index) =>
      buildPhoto({ id: `photo-${index + 1}` }),
    );

    assert.deepEqual(
      getFilmstripPhotos(photos, 6, 5).map((photo) => photo.id),
      photos.map((photo) => photo.id),
    );
    assert.deepEqual(
      getFilmstripPhotos(photos, 1, 5).map((photo) => photo.id),
      photos.map((photo) => photo.id),
    );
  });

  it('scales filmstrip thumbnails from the original photo ratio', () => {
    assert.equal(getFilmstripThumbnailWidth(buildPhoto()), 132);
    assert.equal(getFilmstripThumbnailWidth(buildPhoto(), 96), 144);
    assert.equal(
      getFilmstripThumbnailWidth(buildPhoto({ width: 1707, height: 2560 }), 96),
      64,
    );
    assert.equal(
      getFilmstripThumbnailWidth(buildPhoto({ width: 0, height: 0 }), 96),
      96,
    );
  });

  it('restores inactive filmstrip thumbnails to full color on hover', () => {
    const inactiveClass = getFilmstripImageToneClass(false);

    assert.match(inactiveClass, /\bgrayscale\b/);
    assert.match(inactiveClass, /\bgroup-hover:grayscale-0\b/);
    assert.match(inactiveClass, /\bgroup-hover:brightness-105\b/);
    assert.doesNotMatch(getFilmstripImageToneClass(true), /\bgrayscale\b/);
  });

  it('sizes filmstrip hover previews as larger proportional thumbnails', () => {
    assert.deepEqual(getFilmstripPreviewDimensions(buildPhoto()), {
      width: 240,
      height: 160,
    });
    assert.deepEqual(
      getFilmstripPreviewDimensions(buildPhoto({ width: 1705, height: 2560 })),
      {
        width: 107,
        height: 160,
      },
    );
    assert.deepEqual(
      getFilmstripPreviewDimensions(buildPhoto({ width: 0, height: 0 })),
      {
        width: 160,
        height: 160,
      },
    );
  });
});
