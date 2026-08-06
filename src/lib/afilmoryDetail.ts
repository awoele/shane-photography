import type {
  AfilmoryPhotoManifestItem,
  AfilmoryToneAnalysis,
  AfilmoryToneType,
} from './afilmoryTypes';
import {
  EMPTY_VALUE,
  formatCameraName,
  formatCategoryLabel,
  formatIso,
  getDisplayDate,
  type Photo,
} from './photos';

export type AfilmoryDetailField = {
  label: string;
  value: string;
};

export type AfilmoryDetailSectionLayout =
  | 'fields'
  | 'parameter-grid'
  | 'chips'
  | 'tone-grid'
  | 'histogram';

export type AfilmoryDetailSection = {
  title: string;
  fields: AfilmoryDetailField[];
  chips?: string[];
  layout?: AfilmoryDetailSectionLayout;
  message?: string;
};

export type PhotoNeighbors = {
  previous: Photo | null;
  next: Photo | null;
};

export const DEFAULT_FILMSTRIP_THUMBNAIL_HEIGHT = 80;
export const ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT =
  DEFAULT_FILMSTRIP_THUMBNAIL_HEIGHT;

const displayValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }

  const text = String(value).trim();

  return text || EMPTY_VALUE;
};

const formatDimensions = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const width = manifestItem?.width ?? photo.width;
  const height = manifestItem?.height ?? photo.height;

  if (width <= 0 || height <= 0) {
    return EMPTY_VALUE;
  }

  return `${width} x ${height}`;
};

const formatMegapixels = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const width = manifestItem?.width ?? photo.width;
  const height = manifestItem?.height ?? photo.height;

  if (width <= 0 || height <= 0) {
    return EMPTY_VALUE;
  }

  return `${Math.floor((width * height) / 1_000_000)} MP`;
};

const getPhotoFormat = (
  src: string,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  if (manifestItem?.format) {
    return manifestItem.format;
  }

  const path = (() => {
    try {
      return new URL(src).pathname;
    } catch {
      return src;
    }
  })();

  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();

  return extension || EMPTY_VALUE;
};

const formatAfilmoryDate = (value: string) => {
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](.*))?$/);

  if (!match) {
    return value;
  }

  const [, year, month, day, time] = match;

  return `${year}/${Number(month)}/${Number(day)}${time ? ` ${time}` : ''}`;
};

const getGreatestCommonDivisor = (first: number, second: number): number =>
  second === 0
    ? Math.abs(first)
    : getGreatestCommonDivisor(second, first % second);

const formatAspectRatio = (photo: Photo) => {
  if (photo.width <= 0 || photo.height <= 0) {
    return EMPTY_VALUE;
  }

  const divisor = getGreatestCommonDivisor(photo.width, photo.height);

  return `${photo.width / divisor}:${photo.height / divisor}`;
};

const toneTypeLabels: Record<AfilmoryToneType, string> = {
  'high-contrast': '高反差',
  'high-key': '高调',
  'low-key': '低调',
  normal: '中调',
};

const getToneType = (
  photo: Photo,
  toneAnalysis?: AfilmoryToneAnalysis | null,
) => {
  if (toneAnalysis) {
    return toneTypeLabels[toneAnalysis.toneType];
  }

  const searchableText =
    `${photo.category} ${photo.title} ${photo.description}`.toLowerCase();

  if (/(night|dark|noir|low|shadow)/.test(searchableText)) {
    return '低调';
  }

  if (/(snow|bright|white|light|high)/.test(searchableText)) {
    return '高调';
  }

  return '中调';
};

const formatFileSize = (size: number | undefined) => {
  if (!size || size <= 0) {
    return EMPTY_VALUE;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(precision)}${units[unitIndex]}`;
};

const formatApertureValue = (
  aperture: number | undefined,
  fallback: string,
) => {
  if (!aperture) {
    return displayValue(fallback);
  }

  return `f/${aperture}`;
};

const formatCoordinate = (manifestItem?: AfilmoryPhotoManifestItem) => {
  const latitude = manifestItem?.location?.latitude;
  const longitude = manifestItem?.location?.longitude;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return EMPTY_VALUE;
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

const formatVideoType = (manifestItem?: AfilmoryPhotoManifestItem) => {
  if (manifestItem?.video?.type === 'live-photo') {
    return '实况照片';
  }

  if (manifestItem?.video?.type === 'motion-photo') {
    return '动态照片';
  }

  return EMPTY_VALUE;
};

const formatEv = (value: number | string | undefined) => {
  if (value === undefined || value === '') {
    return EMPTY_VALUE;
  }

  const text = String(value).trim();

  return /\bev\b/i.test(text) ? text : `${text} EV`;
};

const formatAltitude = (manifestItem?: AfilmoryPhotoManifestItem) => {
  const altitude = manifestItem?.exif?.GPSAltitude;

  if (altitude === undefined || altitude === '') {
    return EMPTY_VALUE;
  }

  const altitudeRef = manifestItem?.exif?.GPSAltitudeRef;
  const isBelowSeaLevel =
    altitudeRef === 1 ||
    (typeof altitudeRef === 'string' && /below|1/i.test(altitudeRef));

  return `${isBelowSeaLevel ? '-' : ''}${altitude}m`;
};

const formatFocalPlaneResolution = (
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const xResolution = manifestItem?.exif?.FocalPlaneXResolution;
  const yResolution = manifestItem?.exif?.FocalPlaneYResolution;

  if (!xResolution && !yResolution) {
    return EMPTY_VALUE;
  }

  return `${displayValue(xResolution)} x ${displayValue(yResolution)}`;
};

const formatCameraValue = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const manifestCamera = [manifestItem?.exif?.Make, manifestItem?.exif?.Model]
    .filter(Boolean)
    .join(' ');

  return displayValue(formatCameraName(manifestCamera || photo.camera));
};

const formatLensValue = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const manifestLens = [
    manifestItem?.exif?.LensMake,
    manifestItem?.exif?.LensModel,
  ]
    .filter(Boolean)
    .join(' ');

  return displayValue(manifestLens || photo.lens);
};

const formatToneMetric = (value: number | undefined, asRatio = false) => {
  if (typeof value !== 'number') {
    return '待分析';
  }

  return `${Math.round(asRatio ? value * 100 : value)}%`;
};

const optionalField = (
  label: string,
  value: number | string | null | undefined,
) => {
  const formattedValue = displayValue(value);

  return formattedValue === EMPTY_VALUE
    ? []
    : [{ label, value: formattedValue }];
};

const getToneFields = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
) => {
  const toneAnalysis = manifestItem?.toneAnalysis;

  return [
    {
      label: '影调类型',
      value: getToneType(photo, toneAnalysis),
    },
    {
      label: '亮度',
      value: formatToneMetric(toneAnalysis?.brightness),
    },
    {
      label: '对比度',
      value: formatToneMetric(toneAnalysis?.contrast),
    },
    {
      label: '阴影占比',
      value: formatToneMetric(toneAnalysis?.shadowRatio, true),
    },
    {
      label: '高光占比',
      value: formatToneMetric(toneAnalysis?.highlightRatio, true),
    },
  ];
};

export const createAfilmoryDetailSections = (
  photo: Photo,
  manifestItem?: AfilmoryPhotoManifestItem,
): AfilmoryDetailSection[] => {
  const exif = manifestItem?.exif;
  const categoryLabel = photo.category
    ? formatCategoryLabel(photo.category)
    : '';
  const manifestTags = manifestItem?.tags.map(formatCategoryLabel) ?? [];
  const locationLabel =
    manifestItem?.location?.locationName ??
    manifestItem?.location?.city ??
    manifestItem?.location?.country ??
    photo.location;
  const tagChips = Array.from(
    new Set([...manifestTags, categoryLabel, locationLabel].filter(Boolean)),
  );

  const sections: AfilmoryDetailSection[] = [
    {
      title: '基本信息',
      fields: [
        { label: '文件名', value: displayValue(manifestItem?.id ?? photo.id) },
        { label: '格式', value: getPhotoFormat(photo.src, manifestItem) },
        { label: '尺寸', value: formatDimensions(photo, manifestItem) },
        { label: '文件大小', value: formatFileSize(manifestItem?.size) },
        { label: '像素', value: formatMegapixels(photo, manifestItem) },
        { label: '色彩空间', value: displayValue(exif?.ColorSpace ?? 'sRGB') },
        {
          label: '拍摄时间',
          value: displayValue(
            formatAfilmoryDate(
              exif?.DateTimeOriginal ??
                manifestItem?.dateTaken ??
                getDisplayDate(photo),
            ),
          ),
        },
        {
          label: '时区',
          value: displayValue(exif?.tz ?? exif?.zone ?? 'UTC+8'),
        },
        { label: '艺术家', value: displayValue(exif?.Artist ?? 'Shane') },
        { label: '软件', value: displayValue(exif?.Software) },
        ...(manifestItem?.isHDR ? [{ label: 'HDR', value: 'HDR' }] : []),
        ...optionalField('评分', exif?.Rating),
        ...(manifestItem?.video
          ? [{ label: '动态媒体', value: formatVideoType(manifestItem) }]
          : []),
        ...optionalField('ThumbHash', manifestItem?.thumbHash),
      ],
    },
    {
      title: '拍摄参数',
      layout: 'parameter-grid',
      fields: [
        {
          label: '焦距',
          value: displayValue(exif?.FocalLength ?? photo.focalLength),
        },
        {
          label: '光圈',
          value: formatApertureValue(exif?.FNumber, photo.aperture),
        },
        {
          label: '快门',
          value: displayValue(
            exif?.ExposureTime ?? exif?.ShutterSpeed ?? photo.shutterSpeed,
          ),
        },
        {
          label: 'ISO',
          value: displayValue(
            exif?.ISO ? `ISO ${exif.ISO}` : formatIso(photo.iso),
          ),
        },
      ],
    },
  ];

  if (tagChips.length > 0) {
    sections.push({
      title: '标签',
      layout: 'chips',
      fields: [],
      chips: tagChips,
    });
  }

  sections.push(
    {
      title: '影调分析',
      layout: 'tone-grid',
      fields: getToneFields(photo, manifestItem),
    },
    {
      title: '直方图',
      layout: 'histogram',
      fields: [],
      message: '图片加载后分析',
    },
    {
      title: '设备信息',
      fields: [
        { label: '相机', value: formatCameraValue(photo, manifestItem) },
        { label: '镜头', value: formatLensValue(photo, manifestItem) },
      ],
    },
    {
      title: '拍摄模式',
      fields: [
        { label: '测光模式', value: displayValue(exif?.MeteringMode) },
        { label: '曝光程序', value: displayValue(exif?.ExposureProgram) },
        { label: '白平衡', value: displayValue(exif?.WhiteBalance) },
        ...optionalField('曝光模式', exif?.ExposureMode),
        ...optionalField('场景类型', exif?.SceneCaptureType),
        ...optionalField('闪光灯', exif?.Flash),
        ...optionalField('光源', exif?.LightSource),
        ...(formatEv(exif?.ExposureCompensation) === EMPTY_VALUE
          ? []
          : [
              {
                label: '曝光补偿',
                value: formatEv(exif?.ExposureCompensation),
              },
            ]),
        ...optionalField('最大光圈', exif?.MaxApertureValue),
      ],
    },
    {
      title: '胶片模拟配方',
      fields: [
        { label: '胶片模拟', value: displayValue(exif?.FujiRecipe?.FilmMode) },
        {
          label: '动态范围',
          value: displayValue(exif?.FujiRecipe?.DynamicRange),
        },
        {
          label: '颗粒效果',
          value: displayValue(exif?.FujiRecipe?.GrainEffectRoughness),
        },
        ...optionalField('颗粒尺寸', exif?.FujiRecipe?.GrainEffectSize),
        ...optionalField('彩色效果', exif?.FujiRecipe?.ColorChromeEffect),
        ...optionalField('蓝色彩色效果', exif?.FujiRecipe?.ColorChromeFxBlue),
        ...optionalField('白平衡', exif?.FujiRecipe?.WhiteBalance),
        ...optionalField('白平衡微调', exif?.FujiRecipe?.WhiteBalanceFineTune),
        ...optionalField('高光', exif?.FujiRecipe?.HighlightTone),
        ...optionalField('阴影', exif?.FujiRecipe?.ShadowTone),
        ...optionalField('色彩', exif?.FujiRecipe?.Saturation),
        ...optionalField('锐度', exif?.FujiRecipe?.Sharpness),
        ...optionalField('降噪', exif?.FujiRecipe?.NoiseReduction),
        ...optionalField('清晰度', exif?.FujiRecipe?.Clarity),
        ...optionalField('色温', exif?.FujiRecipe?.ColorTemperature),
        ...optionalField('动态范围设置', exif?.FujiRecipe?.DynamicRangeSetting),
      ],
    },
    {
      title: '位置信息',
      fields: [
        { label: '地点', value: displayValue(locationLabel) },
        { label: '坐标', value: formatCoordinate(manifestItem) },
        ...(formatAltitude(manifestItem) === EMPTY_VALUE
          ? []
          : [{ label: '海拔', value: formatAltitude(manifestItem) }]),
      ],
    },
    {
      title: '技术参数',
      fields: [
        {
          label: '原始宽度',
          value:
            (manifestItem?.width ?? photo.width) > 0
              ? String(manifestItem?.width ?? photo.width)
              : EMPTY_VALUE,
        },
        {
          label: '原始高度',
          value:
            (manifestItem?.height ?? photo.height) > 0
              ? String(manifestItem?.height ?? photo.height)
              : EMPTY_VALUE,
        },
        { label: '长宽比', value: formatAspectRatio(photo) },
        { label: '源文件', value: displayValue(manifestItem?.s3Key ?? '可用') },
        ...optionalField('方向', exif?.Orientation),
        ...optionalField('等效焦距', exif?.FocalLengthIn35mmFormat),
        ...(formatEv(exif?.BrightnessValue) === EMPTY_VALUE
          ? []
          : [{ label: '亮度值', value: formatEv(exif?.BrightnessValue) }]),
        ...optionalField('快门速度值', exif?.ShutterSpeedValue),
        ...(formatEv(exif?.ApertureValue) === EMPTY_VALUE
          ? []
          : [{ label: '光圈值', value: formatEv(exif?.ApertureValue) }]),
        ...optionalField('感光方法', exif?.SensingMethod),
        ...(formatFocalPlaneResolution(manifestItem) === EMPTY_VALUE
          ? []
          : [
              {
                label: '焦平面分辨率',
                value: formatFocalPlaneResolution(manifestItem),
              },
            ]),
        ...(manifestItem?.digest
          ? [{ label: '摘要', value: manifestItem.digest }]
          : []),
      ],
    },
  );

  if (photo.description) {
    sections.push({
      title: '备注',
      fields: [{ label: '描述', value: photo.description }],
    });
  }

  return sections;
};

export const getCircularPhotoNeighbors = (
  photos: Photo[],
  activeIndex: number,
): PhotoNeighbors => {
  if (photos.length <= 1) {
    return {
      previous: null,
      next: null,
    };
  }

  const normalizedIndex =
    activeIndex >= 0 && activeIndex < photos.length ? activeIndex : 0;

  return {
    previous:
      photos[(normalizedIndex - 1 + photos.length) % photos.length] ?? null,
    next: photos[(normalizedIndex + 1) % photos.length] ?? null,
  };
};

export const getFilmstripPhotos = (
  photos: Photo[],
  _activeIndex: number,
  _limit = 15,
) => photos;

export const getFilmstripThumbnailWidth = (
  photo: Photo,
  height = DEFAULT_FILMSTRIP_THUMBNAIL_HEIGHT,
) => {
  if (photo.width <= 0 || photo.height <= 0) {
    return height;
  }

  return Math.max(48, Math.round((photo.width / photo.height) * height));
};

export const getFilmstripImageToneClass = (isActive: boolean) =>
  isActive
    ? 'opacity-100 brightness-100'
    : 'contrast-95 brightness-[0.76] grayscale group-hover:grayscale-0 group-hover:brightness-105 group-hover:contrast-100';

export const getFilmstripPreviewDimensions = (
  photo: Photo,
  maxWidth = 240,
  maxHeight = 160,
) => {
  if (photo.width <= 0 || photo.height <= 0) {
    return {
      width: maxHeight,
      height: maxHeight,
    };
  }

  const aspectRatio = photo.width / photo.height;
  let width = Math.round(maxHeight * aspectRatio);
  let height = maxHeight;

  if (width > maxWidth) {
    width = maxWidth;
    height = Math.round(maxWidth / aspectRatio);
  }

  return { width, height };
};
