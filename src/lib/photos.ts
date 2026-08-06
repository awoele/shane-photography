import type {
  AfilmoryFujiRecipe,
  AfilmoryLocationInfo,
  AfilmoryPickedExif,
  AfilmoryToneAnalysis,
  AfilmoryToneType,
  AfilmoryVideoSource,
} from './afilmoryTypes';

export const STORAGE_BASE_URL = 'https://storage.googleapis.com/shane-photos';
export const PHOTOS_JSON_URL = `${STORAGE_BASE_URL}/data/photos.json`;

export type PhotoFujiRecipe = AfilmoryFujiRecipe;
export type PhotoVideoSource = AfilmoryVideoSource;

export type Photo = {
  id: string;
  title: string;
  category: string;
  originalCategory?: string;
  src: string;
  thumbnail: string;
  description: string;
  location: string;
  date: string;
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  dateTaken: string;
  width: number;
  height: number;
  digest?: string;
  exif?: AfilmoryPickedExif | null;
  fileSize?: number;
  format?: string;
  fujiRecipe?: PhotoFujiRecipe;
  isHDR?: boolean;
  lastModified?: string;
  manifestLocation?: AfilmoryLocationInfo | null;
  rating?: number;
  s3Key?: string;
  sortOrder?: number;
  tags?: string[];
  thumbHash?: string;
  toneAnalysis?: AfilmoryToneAnalysis | null;
  video?: PhotoVideoSource;
};

export type PhotoSortMode = 'random' | 'latest';

type RawPhoto = Partial<Record<keyof Photo, unknown>> & Record<string, unknown>;

type FetchPhotosOptions = {
  cacheBust?: boolean;
};

const toText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }

  const text = value.trim();

  if (['undefined', 'null', 'nan'].includes(text.toLowerCase())) {
    return '';
  }

  return text;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toOptionalNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const toPositiveNumber = (value: unknown) => {
  const parsed = toOptionalNumber(value);

  return parsed && parsed > 0 ? parsed : undefined;
};

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on', 'hdr'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const pickFirst = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
};

const normalizeTags = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(toText)
        .filter(Boolean)
        .map((tag) => tag.toLowerCase()),
    ),
  );
};

const toneTypes = new Set<AfilmoryToneType>([
  'high-contrast',
  'high-key',
  'low-key',
  'normal',
]);

const normalizeToneAnalysis = (
  value: unknown,
): AfilmoryToneAnalysis | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const toneType = toText(value.toneType) as AfilmoryToneType;

  if (!toneTypes.has(toneType)) {
    return undefined;
  }

  return {
    toneType,
    brightness: toOptionalNumber(value.brightness) ?? 0,
    contrast: toOptionalNumber(value.contrast) ?? 0,
    shadowRatio: toOptionalNumber(value.shadowRatio) ?? 0,
    highlightRatio: toOptionalNumber(value.highlightRatio) ?? 0,
  };
};

const normalizeLocationInfo = (
  value: unknown,
): AfilmoryLocationInfo | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const location: AfilmoryLocationInfo = {};
  const latitude = toOptionalNumber(value.latitude);
  const longitude = toOptionalNumber(value.longitude);
  const country = toText(value.country);
  const city = toText(value.city);
  const locationName = toText(value.locationName);

  if (latitude !== undefined) {
    location.latitude = latitude;
  }

  if (longitude !== undefined) {
    location.longitude = longitude;
  }

  if (country) {
    location.country = country;
  }

  if (city) {
    location.city = city;
  }

  if (locationName) {
    location.locationName = locationName;
  }

  return Object.keys(location).length > 0 ? location : undefined;
};

const getAssetKeyFromUrl = (url: string) => {
  try {
    const key = new URL(url).pathname.replace(/^\/+/, '') || url;

    return key.startsWith('shane-photos/')
      ? key.slice('shane-photos/'.length)
      : key;
  } catch {
    return url.replace(/^\/+/, '') || url;
  }
};

export const resolveAssetUrl = (value: unknown) => {
  const path = toText(value);

  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${STORAGE_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

const normalizeLivePhotoVideo = (
  record: Record<string, unknown>,
  { allowGenericSourceKeys = false }: { allowGenericSourceKeys?: boolean } = {},
): PhotoVideoSource | undefined => {
  const videoUrl = resolveAssetUrl(
    pickFirst(record, [
      'videoUrl',
      'livePhotoVideoUrl',
      'livePhotoVideo',
      'liveVideoUrl',
      'livePhotoUrl',
      ...(allowGenericSourceKeys ? ['url', 'src'] : []),
    ]),
  );

  if (!videoUrl) {
    return undefined;
  }

  return {
    type: 'live-photo',
    videoUrl,
    s3Key:
      toText(
        pickFirst(record, [
          's3Key',
          'key',
          'videoS3Key',
          's3VideoKey',
          'livePhotoVideoS3Key',
        ]),
      ) || getAssetKeyFromUrl(videoUrl),
  };
};

const normalizeMotionPhotoVideo = (
  record: Record<string, unknown>,
): PhotoVideoSource | undefined => {
  const offset = toPositiveNumber(
    pickFirst(record, [
      'offset',
      'motionPhotoOffset',
      'MotionPhotoOffset',
      'microVideoOffset',
      'MicroVideoOffset',
    ]),
  );

  if (!offset) {
    return undefined;
  }

  const size = toPositiveNumber(
    pickFirst(record, ['size', 'motionPhotoSize', 'MotionPhotoSize']),
  );
  const presentationTimestamp = toOptionalNumber(
    pickFirst(record, [
      'presentationTimestamp',
      'motionPhotoPresentationTimestamp',
      'MotionPhotoPresentationTimestampUs',
      'microVideoPresentationTimestamp',
      'MicroVideoPresentationTimestampUs',
    ]),
  );

  return {
    type: 'motion-photo',
    offset,
    ...(size ? { size } : {}),
    ...(presentationTimestamp !== undefined ? { presentationTimestamp } : {}),
  };
};

const normalizePhotoVideo = (
  record: Record<string, unknown>,
): PhotoVideoSource | undefined => {
  const exifRecord = isRecord(record.exif) ? record.exif : {};
  const rootRecord = {
    ...exifRecord,
    ...record,
  };
  const nestedVideo = record.video;

  if (isRecord(nestedVideo)) {
    const nestedType = toText(nestedVideo.type).toLowerCase();

    if (nestedType === 'motion-photo') {
      return normalizeMotionPhotoVideo(nestedVideo);
    }

    return (
      normalizeLivePhotoVideo(nestedVideo, { allowGenericSourceKeys: true }) ??
      normalizeMotionPhotoVideo(nestedVideo)
    );
  }

  if (typeof nestedVideo === 'string') {
    return normalizeLivePhotoVideo({ videoUrl: nestedVideo });
  }

  return (
    normalizeLivePhotoVideo(rootRecord) ?? normalizeMotionPhotoVideo(rootRecord)
  );
};

const normalizeFujiRecipe = (value: unknown): PhotoFujiRecipe | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const recipe: PhotoFujiRecipe = {};
  const setText = (target: keyof PhotoFujiRecipe, keys: string[]) => {
    const text = toText(pickFirst(value, keys));

    if (text) {
      (recipe as Record<string, string | number | undefined>)[target] = text;
    }
  };

  setText('FilmMode', ['FilmMode', 'filmMode', 'filmSimulation']);
  setText('GrainEffectRoughness', [
    'GrainEffectRoughness',
    'grainEffectRoughness',
    'grainEffect',
  ]);
  setText('GrainEffectSize', ['GrainEffectSize', 'grainEffectSize']);
  setText('ColorChromeEffect', ['ColorChromeEffect', 'colorChromeEffect']);
  setText('ColorChromeFxBlue', ['ColorChromeFxBlue', 'colorChromeFxBlue']);
  setText('WhiteBalance', ['WhiteBalance', 'whiteBalance']);
  setText('WhiteBalanceFineTune', [
    'WhiteBalanceFineTune',
    'whiteBalanceFineTune',
  ]);
  setText('DynamicRange', ['DynamicRange', 'dynamicRange']);
  setText('HighlightTone', ['HighlightTone', 'highlightTone', 'highlight']);
  setText('ShadowTone', ['ShadowTone', 'shadowTone', 'shadow']);
  setText('Saturation', ['Saturation', 'saturation', 'color']);
  setText('Sharpness', ['Sharpness', 'sharpness']);
  setText('NoiseReduction', ['NoiseReduction', 'noiseReduction']);
  setText('ColorTemperature', ['ColorTemperature', 'colorTemperature']);
  setText('DynamicRangeSetting', [
    'DynamicRangeSetting',
    'dynamicRangeSetting',
  ]);

  const clarity = toOptionalNumber(pickFirst(value, ['Clarity', 'clarity']));

  if (clarity !== undefined) {
    recipe.Clarity = clarity;
  }

  const developmentDynamicRange = toOptionalNumber(
    pickFirst(value, ['DevelopmentDynamicRange', 'developmentDynamicRange']),
  );

  if (developmentDynamicRange !== undefined) {
    recipe.DevelopmentDynamicRange = developmentDynamicRange;
  }

  return Object.keys(recipe).length > 0 ? recipe : undefined;
};

const normalizePickedExif = (
  value: unknown,
): AfilmoryPickedExif | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const exif = Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null && item !== '',
    ),
  ) as AfilmoryPickedExif;

  const fujiRecipe = normalizeFujiRecipe(exif.FujiRecipe);

  if (fujiRecipe) {
    exif.FujiRecipe = fujiRecipe;
  }

  return Object.keys(exif).length > 0 ? exif : undefined;
};

export const formatCategoryLabel = (category: string) =>
  category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

export const formatIso = (iso: string) => {
  if (!iso) {
    return '';
  }

  return iso.toLowerCase().startsWith('iso') ? iso : `ISO ${iso}`;
};

export const formatCameraName = (camera: string) => {
  if (/ricoh/i.test(camera) && /\bgr\s*iii\b/i.test(camera)) {
    return 'RICOH GR III';
  }

  return camera;
};

export const EMPTY_VALUE = '\u2014';

export const getDisplayDate = (photo: Photo) => photo.dateTaken || photo.date;

const displayValue = (value: string, fallback = EMPTY_VALUE) =>
  value || fallback;

export type PhotoMetadataField = {
  label: string;
  value: string;
};

export type PhotoMetadataGroup = {
  title: string;
  fields: PhotoMetadataField[];
};

const parsePhotoDate = (value: string) => {
  if (!value) {
    return 0;
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const timestamp = Date.parse(normalized);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getPhotoTitle = (photo: Photo) =>
  displayValue(photo.title || photo.id);

export const getPhotoTime = (photo: Photo) =>
  displayValue(photo.dateTaken || photo.date);

export const getPhotoMetadataGroups = (photo: Photo): PhotoMetadataGroup[] => {
  const groups: PhotoMetadataGroup[] = [
    {
      title: 'Capture',
      fields: [
        {
          label: 'Title',
          value: getPhotoTitle(photo),
        },
        {
          label: 'Time',
          value: getPhotoTime(photo),
        },
        {
          label: 'Category',
          value: displayValue(photo.category),
        },
        {
          label: 'Location',
          value: displayValue(photo.location),
        },
      ],
    },
    {
      title: 'Camera',
      fields: [
        {
          label: 'Body',
          value: displayValue(formatCameraName(photo.camera)),
        },
        {
          label: 'Lens',
          value: displayValue(photo.lens),
        },
      ],
    },
    {
      title: 'Exposure',
      fields: [
        {
          label: 'Focal Length',
          value: displayValue(photo.focalLength),
        },
        {
          label: 'Aperture',
          value: displayValue(photo.aperture),
        },
        {
          label: 'Shutter Speed',
          value: displayValue(photo.shutterSpeed),
        },
        {
          label: 'ISO',
          value: displayValue(formatIso(photo.iso)),
        },
      ],
    },
  ];

  if (photo.description) {
    groups.push({
      title: 'Notes',
      fields: [
        {
          label: 'Description',
          value: photo.description,
        },
      ],
    });
  }

  return groups;
};

export const getPhotoPanelFields = (photo: Photo) =>
  getPhotoMetadataGroups(photo).flatMap((group) => group.fields);

export const getPhotoTimestamp = (photo: Photo) =>
  parsePhotoDate(photo.dateTaken || photo.date);

export const getPhotoSortOrder = (photo: Photo) =>
  typeof photo.sortOrder === 'number' && Number.isFinite(photo.sortOrder)
    ? photo.sortOrder
    : undefined;

export const comparePhotosByManagedOrder = (first: Photo, second: Photo) => {
  if (first.category === second.category) {
    const firstOrder = getPhotoSortOrder(first);
    const secondOrder = getPhotoSortOrder(second);

    if (firstOrder !== undefined && secondOrder !== undefined) {
      return firstOrder - secondOrder || first.id.localeCompare(second.id);
    }

    if (firstOrder !== undefined) {
      return -1;
    }

    if (secondOrder !== undefined) {
      return 1;
    }
  }

  return (
    getPhotoTimestamp(second) - getPhotoTimestamp(first) ||
    first.id.localeCompare(second.id)
  );
};

export const createSeededRandom = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
};

export const shufflePhotos = (photos: Photo[], seed: number) => {
  const shuffled = [...photos];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    const currentPhoto = shuffled[index];
    const targetPhoto = shuffled[targetIndex];

    if (currentPhoto && targetPhoto) {
      shuffled[index] = targetPhoto;
      shuffled[targetIndex] = currentPhoto;
    }
  }

  return shuffled;
};

const normalizePhoto = (item: unknown): Photo => {
  const record = item && typeof item === 'object' ? (item as RawPhoto) : {};
  const id = toText(record.id);
  const tags = normalizeTags(record.tags);
  const category = toText(record.category).toLowerCase() || tags[0] || '';
  const exif = normalizePickedExif(record.exif);
  const manifestLocation = normalizeLocationInfo(
    pickFirst(record, ['location', 'locationInfo']),
  );
  const location =
    toText(record.location) ||
    manifestLocation?.locationName ||
    manifestLocation?.city ||
    manifestLocation?.country ||
    '';
  const exifRecord = isRecord(record.exif) ? record.exif : {};
  const fujiRecipe = normalizeFujiRecipe(
    pickFirst(record, ['fujiRecipe', 'FujiRecipe']) ??
      pickFirst(exifRecord, ['FujiRecipe', 'fujiRecipe']),
  );
  const isHDR = toBoolean(
    pickFirst(record, ['isHDR', 'hdr', 'HDR']) ??
      pickFirst(exifRecord, ['isHDR', 'hdr', 'HDR']),
  );
  const rating = toPositiveNumber(
    pickFirst(record, ['rating', 'Rating']) ??
      pickFirst(exifRecord, ['rating', 'Rating']),
  );
  const sortOrder = toOptionalNumber(record.sortOrder);
  const thumbHash = toText(pickFirst(record, ['thumbHash', 'thumbhash']));
  const video = normalizePhotoVideo(record);
  const toneAnalysis = normalizeToneAnalysis(record.toneAnalysis);
  const fileSize = toPositiveNumber(pickFirst(record, ['size', 'fileSize']));
  const format = toText(record.format).toUpperCase();
  const lastModified = toText(record.lastModified);
  const s3Key = toText(record.s3Key);
  const digest = toText(record.digest);

  return {
    id,
    title: toText(record.title) || id,
    category,
    originalCategory: toText(record.originalCategory) || category,
    src: resolveAssetUrl(record.src ?? record.originalUrl),
    thumbnail: resolveAssetUrl(record.thumbnail ?? record.thumbnailUrl),
    description: toText(record.description),
    location,
    date: toText(record.date),
    camera: toText(record.camera),
    lens: toText(record.lens),
    focalLength: toText(record.focalLength),
    aperture: toText(record.aperture),
    shutterSpeed: toText(record.shutterSpeed),
    iso: toText(record.iso),
    dateTaken: toText(record.dateTaken ?? exif?.DateTimeOriginal),
    width: toNumber(record.width ?? exif?.ImageWidth),
    height: toNumber(record.height ?? exif?.ImageHeight),
    ...(digest ? { digest } : {}),
    ...(exif ? { exif } : {}),
    ...(fileSize ? { fileSize } : {}),
    ...(format ? { format } : {}),
    ...(fujiRecipe ? { fujiRecipe } : {}),
    ...(isHDR !== undefined ? { isHDR } : {}),
    ...(lastModified ? { lastModified } : {}),
    ...(manifestLocation ? { manifestLocation } : {}),
    ...(rating ? { rating } : {}),
    ...(s3Key ? { s3Key } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(thumbHash ? { thumbHash } : {}),
    ...(toneAnalysis ? { toneAnalysis } : {}),
    ...(video ? { video } : {}),
  };
};

const isUsablePhoto = (photo: Photo) =>
  Boolean(photo.id && photo.category && photo.src && photo.thumbnail);

export const getPhotosJsonUrl = ({
  cacheBust = false,
}: FetchPhotosOptions = {}) =>
  cacheBust ? `${PHOTOS_JSON_URL}?t=${Date.now()}` : PHOTOS_JSON_URL;

export const fetchPhotos = async (options: FetchPhotosOptions = {}) => {
  const response = await fetch(getPhotosJsonUrl(options), {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load photos.json: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('photos.json must be an array of photo records.');
  }

  return data
    .map(normalizePhoto)
    .filter(isUsablePhoto)
    .sort(comparePhotosByManagedOrder);
};

export const buildCategoryList = (photos: Photo[]) =>
  Array.from(
    new Set(photos.map((photo) => photo.category).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second));

export const findPhotoById = (photos: Photo[], id: string) =>
  photos.find((photo) => photo.id === id);
