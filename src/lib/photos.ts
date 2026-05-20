export const STORAGE_BASE_URL = 'https://storage.googleapis.com/shane-photos';
export const PHOTOS_JSON_URL = `${STORAGE_BASE_URL}/data/photos.json`;

export type Photo = {
  id: string;
  title: string;
  category: string;
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
};

type RawPhoto = Partial<Record<keyof Photo, unknown>>;

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

export const EMPTY_VALUE = '—';

export const getExifParts = (photo: Photo) =>
  [
    photo.focalLength,
    photo.aperture,
    photo.shutterSpeed,
    formatIso(photo.iso),
  ].filter(Boolean);

export const getDisplayDate = (photo: Photo) => photo.dateTaken || photo.date;

export const getLocationDateParts = (photo: Photo) =>
  [photo.location, getDisplayDate(photo)].filter(Boolean);

export const getCameraLensParts = (photo: Photo) =>
  [formatCameraName(photo.camera), photo.lens].filter(Boolean);

const displayValue = (value: string, fallback = EMPTY_VALUE) =>
  value || fallback;

const formatWatermarkIso = (iso: string) => {
  if (!iso) {
    return EMPTY_VALUE;
  }

  if (/^iso\b/i.test(iso)) {
    return iso.replace(/^iso/i, 'ISO');
  }

  return `ISO ${iso}`;
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

export const getPhotoPanelFields = (photo: Photo) => [
  {
    label: 'TITLE',
    value: getPhotoTitle(photo),
  },
  {
    label: 'TIME',
    value: getPhotoTime(photo),
  },
  {
    label: 'LOCATION',
    value: displayValue(photo.location),
  },
  {
    label: 'CAMERA',
    value: displayValue(formatCameraName(photo.camera)),
  },
  {
    label: 'LENS',
    value: displayValue(photo.lens),
  },
];

export const getWatermarkLines = (photo: Photo) => ({
  camera: formatCameraName(photo.camera) || 'Camera',
  exposure: [
    displayValue(photo.focalLength),
    displayValue(photo.aperture),
    displayValue(photo.shutterSpeed),
    formatWatermarkIso(photo.iso),
  ].join(' \u00b7 '),
});

export const getPhotoTimestamp = (photo: Photo) =>
  parsePhotoDate(photo.dateTaken || photo.date);

const normalizePhoto = (item: unknown): Photo => {
  const record = item && typeof item === 'object' ? (item as RawPhoto) : {};
  const id = toText(record.id);
  const category = toText(record.category).toLowerCase();

  return {
    id,
    title: toText(record.title) || id,
    category,
    src: resolveAssetUrl(record.src),
    thumbnail: resolveAssetUrl(record.thumbnail),
    description: toText(record.description),
    location: toText(record.location),
    date: toText(record.date),
    camera: toText(record.camera),
    lens: toText(record.lens),
    focalLength: toText(record.focalLength),
    aperture: toText(record.aperture),
    shutterSpeed: toText(record.shutterSpeed),
    iso: toText(record.iso),
    dateTaken: toText(record.dateTaken),
    width: toNumber(record.width),
    height: toNumber(record.height),
  };
};

const isUsablePhoto = (photo: Photo) =>
  Boolean(photo.id && photo.category && photo.src && photo.thumbnail);

export const fetchPhotos = async () => {
  const response = await fetch(PHOTOS_JSON_URL, {
    headers: {
      accept: 'application/json',
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
    .sort(
      (first, second) =>
        getPhotoTimestamp(second) - getPhotoTimestamp(first) ||
        first.id.localeCompare(second.id),
    );
};

export const buildCategoryList = (photos: Photo[]) =>
  Array.from(
    new Set(photos.map((photo) => photo.category).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second));

export const findPhotoById = (photos: Photo[], id: string) =>
  photos.find((photo) => photo.id === id);
