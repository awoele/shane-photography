import type {
  AfilmoryCameraInfo,
  AfilmoryLensInfo,
  AfilmoryManifest,
  AfilmoryPhotoManifestItem,
  AfilmoryPickedExif,
  AfilmoryToneAnalysis,
  AfilmoryToneType,
  AfilmoryVideoSource,
} from './afilmoryTypes';
import {
  fetchPhotos,
  formatCameraName,
  getDisplayDate,
  getPhotoTimestamp,
  type Photo,
} from './photos';

export type AfilmoryFetchOptions = {
  cacheBust?: boolean;
};

export type AfilmoryDateRangeFilter = {
  from?: string;
  to?: string;
};

export type AfilmoryPhotoFilterState = {
  dateRange?: AfilmoryDateRangeFilter | null;
  locations?: string[];
  query?: string;
  rating?: number | null;
  sortOrder?: 'asc' | 'desc';
  tagFilterMode?: 'union' | 'intersection';
  tags?: string[];
  cameras?: string[];
  lenses?: string[];
};

export type AfilmoryPhotoSet = {
  loader: AfilmoryPhotoLoader;
  manifest: AfilmoryManifest;
  photos: Photo[];
};

export type AfilmoryFeatureCapabilities = {
  hasFujiRecipe: boolean;
  hasHDR: boolean;
  hasLivePhoto: boolean;
  hasLocation: boolean;
  hasMotionPhoto: boolean;
  hasRating: boolean;
  hasThumbHash: boolean;
  hasToneAnalysis: boolean;
  hasVideo: boolean;
};

const AFILMORY_MANIFEST_VERSION = 'v1';

const normalizeText = (value: string) => value.trim();

const normalizeForMatch = (value: string) => normalizeText(value).toLowerCase();

const getUniqueItems = <T>(items: T[], getKey: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  items.forEach((item) => {
    const key = normalizeForMatch(getKey(item));

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(item);
  });

  return result;
};

const getUrlPathname = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export const getAfilmoryPhotoFormat = (url: string) => {
  const extension = getUrlPathname(url).match(/\.([a-z0-9]+)$/i)?.[1];

  return extension ? extension.toUpperCase() : '';
};

const getAfilmoryS3Key = (url: string) =>
  getUrlPathname(url).replace(/^\/+/, '') || url;

const createVideoSource = (photo: Photo): AfilmoryVideoSource | undefined => {
  if (!photo.video) {
    return undefined;
  }

  if (photo.video.type === 'live-photo') {
    return {
      type: 'live-photo',
      videoUrl: photo.video.videoUrl,
      s3Key: photo.video.s3Key || getAfilmoryS3Key(photo.video.videoUrl),
    };
  }

  return {
    type: 'motion-photo',
    offset: photo.video.offset,
    ...(photo.video.size ? { size: photo.video.size } : {}),
    ...(photo.video.presentationTimestamp !== undefined
      ? { presentationTimestamp: photo.video.presentationTimestamp }
      : {}),
  };
};

const createDigest = (photo: Photo) => {
  const source = [
    photo.id,
    photo.src,
    photo.thumbnail,
    photo.width,
    photo.height,
    getDisplayDate(photo),
  ].join('|');
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 4294967291;
  }

  return hash.toString(16).padStart(8, '0');
};

const parseNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''));

  return Number.isFinite(parsed) ? parsed : undefined;
};

const getAspectRatio = (photo: Photo) =>
  photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;

const splitDisplayName = (displayName: string) => {
  const normalized = normalizeText(displayName);
  const [firstToken = '', ...restTokens] = normalized.split(/\s+/);

  return {
    firstToken,
    rest: restTokens.join(' '),
  };
};

const getCameraInfo = (camera: string): AfilmoryCameraInfo | null => {
  const displayName = formatCameraName(camera);

  if (!displayName) {
    return null;
  }

  if (/^FUJIFILM\s+/i.test(displayName)) {
    return {
      make: 'FUJIFILM',
      model: displayName.replace(/^FUJIFILM\s+/i, ''),
      displayName,
    };
  }

  if (/^RICOH\s+/i.test(displayName)) {
    return {
      make: 'RICOH',
      model: displayName.replace(/^RICOH\s+/i, ''),
      displayName,
    };
  }

  if (/^SONY\s+/i.test(displayName)) {
    return {
      make: 'SONY',
      model: displayName.replace(/^SONY\s+/i, ''),
      displayName,
    };
  }

  const { firstToken, rest } = splitDisplayName(displayName);

  return {
    make: firstToken,
    model: rest || displayName,
    displayName,
  };
};

const getLensInfo = (lens: string): AfilmoryLensInfo | null => {
  const displayName = normalizeText(lens);

  if (!displayName) {
    return null;
  }

  const [make, ...modelParts] = displayName.split(/\s+/);
  const hasExplicitMake =
    modelParts.length > 0 && /^[A-Z]{2,}$/i.test(make ?? '');

  return {
    make: hasExplicitMake ? make : undefined,
    model: hasExplicitMake ? modelParts.join(' ') : displayName,
    displayName,
  };
};

const getToneType = (photo: Photo): AfilmoryToneType => {
  const searchableText =
    `${photo.category} ${photo.title} ${photo.description}`.toLowerCase();

  if (/(contrast|hard|flash|powerhouse|stage)/.test(searchableText)) {
    return 'high-contrast';
  }

  if (/(night|dark|noir|low|shadow)/.test(searchableText)) {
    return 'low-key';
  }

  if (/(snow|bright|white|light|high)/.test(searchableText)) {
    return 'high-key';
  }

  return 'normal';
};

const inferToneAnalysis = (photo: Photo): AfilmoryToneAnalysis => {
  const toneType = getToneType(photo);

  if (toneType === 'low-key') {
    return {
      toneType,
      brightness: 34,
      contrast: 62,
      shadowRatio: 0.72,
      highlightRatio: 0.12,
    };
  }

  if (toneType === 'high-key') {
    return {
      toneType,
      brightness: 74,
      contrast: 38,
      shadowRatio: 0.18,
      highlightRatio: 0.46,
    };
  }

  if (toneType === 'high-contrast') {
    return {
      toneType,
      brightness: 48,
      contrast: 78,
      shadowRatio: 0.46,
      highlightRatio: 0.28,
    };
  }

  return {
    toneType,
    brightness: 52,
    contrast: 45,
    shadowRatio: 0.34,
    highlightRatio: 0.18,
  };
};

const createExif = (photo: Photo): AfilmoryPickedExif | null => {
  const cameraInfo = getCameraInfo(photo.camera);
  const lensInfo = getLensInfo(photo.lens);
  const iso = parseNumber(photo.iso);
  const aperture = parseNumber(photo.aperture);
  const dateTaken = getDisplayDate(photo);
  const explicitExif = photo.exif ?? null;

  if (
    !cameraInfo &&
    !lensInfo &&
    !photo.focalLength &&
    !photo.aperture &&
    !photo.shutterSpeed &&
    !iso &&
    !dateTaken &&
    !explicitExif
  ) {
    return null;
  }

  const exif: AfilmoryPickedExif = {
    ColorSpace: 'sRGB',
    Artist: 'Shane',
    zone: 'UTC+8',
    tz: 'UTC+8',
  };

  if (cameraInfo) {
    exif.Make = cameraInfo.make;
    exif.Model = cameraInfo.model;
  }

  if (lensInfo?.make) {
    exif.LensMake = lensInfo.make;
  }

  if (lensInfo?.model) {
    exif.LensModel = lensInfo.model;
  }

  if (photo.focalLength) {
    exif.FocalLength = photo.focalLength;
  }

  if (aperture) {
    exif.FNumber = aperture;
    exif.Aperture = aperture;
  }

  if (photo.shutterSpeed) {
    exif.ExposureTime = photo.shutterSpeed;
    exif.ShutterSpeed = photo.shutterSpeed;
  }

  if (iso) {
    exif.ISO = iso;
  }

  if (dateTaken) {
    exif.DateTimeOriginal = dateTaken;
  }

  if (photo.width > 0) {
    exif.ImageWidth = photo.width;
  }

  if (photo.height > 0) {
    exif.ImageHeight = photo.height;
  }

  if (photo.rating) {
    exif.Rating = photo.rating;
  }

  if (photo.fujiRecipe) {
    exif.FujiRecipe = photo.fujiRecipe;
  }

  if (photo.video?.type === 'motion-photo') {
    exif.MotionPhoto = true;
    exif.MicroVideo = true;
    exif.MicroVideoOffset = photo.video.offset;

    if (photo.video.presentationTimestamp !== undefined) {
      exif.MicroVideoPresentationTimestampUs =
        photo.video.presentationTimestamp;
    }
  }

  if (explicitExif) {
    Object.assign(exif, explicitExif);
  }

  return exif;
};

export const getAfilmoryFeatureCapabilities = (
  photo: AfilmoryPhotoManifestItem,
): AfilmoryFeatureCapabilities => {
  const hasLivePhoto = photo.video?.type === 'live-photo';
  const hasMotionPhoto = photo.video?.type === 'motion-photo';

  return {
    hasFujiRecipe: Boolean(
      photo.exif?.FujiRecipe && Object.keys(photo.exif.FujiRecipe).length > 0,
    ),
    hasHDR: photo.isHDR === true,
    hasLivePhoto,
    hasLocation: Boolean(
      photo.location &&
        Object.values(photo.location).some((value) => Boolean(value)),
    ),
    hasMotionPhoto,
    hasRating: Boolean(photo.exif?.Rating && photo.exif.Rating > 0),
    hasThumbHash: Boolean(photo.thumbHash),
    hasToneAnalysis: Boolean(photo.toneAnalysis),
    hasVideo: hasLivePhoto || hasMotionPhoto,
  };
};

export const createAfilmoryManifestItem = (
  photo: Photo,
): AfilmoryPhotoManifestItem => {
  const dateTaken = getDisplayDate(photo);
  const video = createVideoSource(photo);
  const tags = (() => {
    if (photo.tags?.length) {
      return photo.tags;
    }

    return photo.category ? [photo.category] : [];
  })();

  return {
    id: photo.id,
    title: photo.title || photo.id,
    dateTaken,
    tags,
    description: photo.description,
    originalUrl: photo.src,
    format: photo.format || getAfilmoryPhotoFormat(photo.src),
    thumbnailUrl: photo.thumbnail,
    ogImageUrl: photo.thumbnail || photo.src,
    thumbHash: photo.thumbHash ?? null,
    width: photo.width,
    height: photo.height,
    aspectRatio: getAspectRatio(photo),
    s3Key: photo.s3Key || getAfilmoryS3Key(photo.src),
    lastModified: photo.lastModified || dateTaken || photo.date,
    size: photo.fileSize ?? 0,
    digest: photo.digest || createDigest(photo),
    exif: createExif(photo),
    toneAnalysis: photo.toneAnalysis ?? inferToneAnalysis(photo),
    location:
      photo.manifestLocation ??
      (photo.location
        ? {
            locationName: photo.location,
          }
        : null),
    ...(photo.isHDR !== undefined ? { isHDR: photo.isHDR } : {}),
    ...(video ? { video } : {}),
  };
};

export const createPhotoFromAfilmoryItem = (
  item: AfilmoryPhotoManifestItem,
): Photo => {
  const camera = [item.exif?.Make, item.exif?.Model].filter(Boolean).join(' ');
  const lens = [item.exif?.LensMake, item.exif?.LensModel]
    .filter(Boolean)
    .join(' ');

  return {
    id: item.id,
    title: item.title || item.id,
    category: item.tags[0] ?? '',
    src: item.originalUrl,
    thumbnail: item.thumbnailUrl,
    description: item.description,
    location:
      item.location?.locationName ??
      item.location?.city ??
      item.location?.country ??
      '',
    date: item.lastModified,
    camera: formatCameraName(camera),
    lens,
    focalLength: item.exif?.FocalLength ? String(item.exif.FocalLength) : '',
    aperture:
      typeof item.exif?.FNumber === 'number' ? `f/${item.exif.FNumber}` : '',
    shutterSpeed: item.exif?.ExposureTime ? String(item.exif.ExposureTime) : '',
    iso: item.exif?.ISO ? String(item.exif.ISO) : '',
    dateTaken: item.exif?.DateTimeOriginal ?? item.dateTaken,
    width: item.width,
    height: item.height,
    digest: item.digest,
    exif: item.exif,
    fileSize: item.size,
    format: item.format,
    ...(item.exif?.FujiRecipe ? { fujiRecipe: item.exif.FujiRecipe } : {}),
    ...(item.isHDR !== undefined ? { isHDR: item.isHDR } : {}),
    lastModified: item.lastModified,
    manifestLocation: item.location,
    ...(item.exif?.Rating ? { rating: item.exif.Rating } : {}),
    s3Key: item.s3Key,
    tags: item.tags,
    ...(item.thumbHash ? { thumbHash: item.thumbHash } : {}),
    toneAnalysis: item.toneAnalysis,
    ...(item.video ? { video: item.video } : {}),
  };
};

export const createAfilmoryManifest = (photos: Photo[]): AfilmoryManifest => {
  const data = photos.map(createAfilmoryManifestItem);
  const cameras = getUniqueItems(
    data
      .map((item) =>
        item.exif?.Make && item.exif?.Model
          ? {
              make: item.exif.Make,
              model: item.exif.Model,
              displayName: formatCameraName(
                `${item.exif.Make} ${item.exif.Model}`,
              ),
            }
          : null,
      )
      .filter((item): item is AfilmoryCameraInfo => item !== null),
    (camera) => camera.displayName,
  );
  const lensItems = data.flatMap<AfilmoryLensInfo>((item) => {
    if (!item.exif?.LensModel) {
      return [];
    }

    return [
      {
        ...(item.exif.LensMake ? { make: item.exif.LensMake } : {}),
        model: item.exif.LensModel,
        displayName: [item.exif.LensMake, item.exif.LensModel]
          .filter(Boolean)
          .join(' '),
      },
    ];
  });
  const lenses = getUniqueItems(lensItems, (lens) => lens.displayName);

  return {
    version: AFILMORY_MANIFEST_VERSION,
    data,
    cameras,
    lenses,
  };
};

const getDateMs = (value: string) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(
    value.includes('T') ? value : value.replace(' ', 'T'),
  );

  return Number.isFinite(timestamp) ? timestamp : null;
};

const photoSearchIndex = (photo: AfilmoryPhotoManifestItem) =>
  [
    photo.id,
    photo.title,
    photo.description,
    photo.tags.join(' '),
    photo.location?.locationName,
    photo.location?.city,
    photo.location?.country,
    photo.exif?.Make,
    photo.exif?.Model,
    photo.exif?.LensMake,
    photo.exif?.LensModel,
    photo.exif?.FocalLength,
    photo.exif?.ExposureTime,
    photo.exif?.ISO,
    photo.dateTaken,
  ]
    .filter((item): item is string | number => item !== undefined)
    .map((item) => normalizeForMatch(String(item)))
    .join(' ');

export class AfilmoryPhotoLoader {
  private photoMap: Record<string, AfilmoryPhotoManifestItem> = {};

  constructor(private readonly manifest: AfilmoryManifest) {
    manifest.data.forEach((photo) => {
      this.photoMap[photo.id] = photo;
    });
  }

  getPhotos() {
    return this.manifest.data;
  }

  getPhoto(id: string) {
    return this.photoMap[id];
  }

  getPhotoIndex(id: string) {
    return this.manifest.data.findIndex((photo) => photo.id === id);
  }

  getPhotoViewModels() {
    return this.manifest.data.map(createPhotoFromAfilmoryItem);
  }

  getPhotoViewModel(id: string) {
    const photo = this.getPhoto(id);

    return photo ? createPhotoFromAfilmoryItem(photo) : undefined;
  }

  getAllTags() {
    return Array.from(
      new Set(this.manifest.data.flatMap((photo) => photo.tags)),
    ).sort((first, second) => first.localeCompare(second));
  }

  getAllCameras() {
    return this.manifest.cameras;
  }

  getAllLenses() {
    return this.manifest.lenses;
  }

  getAllLocations() {
    return Array.from(
      new Set(
        this.manifest.data
          .map((photo) => photo.location?.locationName)
          .filter((location): location is string => Boolean(location)),
      ),
    ).sort((first, second) => first.localeCompare(second));
  }

  getCircularNeighbors(id: string) {
    const index = this.getPhotoIndex(id);

    if (index < 0 || this.manifest.data.length <= 1) {
      return {
        next: null,
        previous: null,
      };
    }

    return {
      previous:
        this.manifest.data[
          (index - 1 + this.manifest.data.length) % this.manifest.data.length
        ] ?? null,
      next: this.manifest.data[(index + 1) % this.manifest.data.length] ?? null,
    };
  }

  filterPhotos(filters: AfilmoryPhotoFilterState = {}) {
    const selectedTags = filters.tags?.filter(Boolean) ?? [];
    const selectedCameras = filters.cameras?.map(normalizeForMatch) ?? [];
    const selectedLenses = filters.lenses?.map(normalizeForMatch) ?? [];
    const selectedLocations = filters.locations?.map(normalizeForMatch) ?? [];
    const queryTokens =
      filters.query?.split(/\s+/).map(normalizeForMatch).filter(Boolean) ?? [];

    const filteredPhotos = this.manifest.data.filter((photo) => {
      if (selectedTags.length > 0) {
        const matchesTag =
          filters.tagFilterMode === 'intersection'
            ? selectedTags.every((tag) => photo.tags.includes(tag))
            : selectedTags.some((tag) => photo.tags.includes(tag));

        if (!matchesTag) {
          return false;
        }
      }

      if (selectedCameras.length > 0) {
        const camera = normalizeForMatch(
          [photo.exif?.Make, photo.exif?.Model].filter(Boolean).join(' '),
        );

        if (!selectedCameras.includes(camera)) {
          return false;
        }
      }

      if (selectedLenses.length > 0) {
        const lens = normalizeForMatch(
          [photo.exif?.LensMake, photo.exif?.LensModel]
            .filter(Boolean)
            .join(' '),
        );

        if (!selectedLenses.includes(lens)) {
          return false;
        }
      }

      if (selectedLocations.length > 0) {
        const location = normalizeForMatch(photo.location?.locationName ?? '');

        if (!selectedLocations.includes(location)) {
          return false;
        }
      }

      if (filters.rating !== null && filters.rating !== undefined) {
        if (!photo.exif?.Rating || photo.exif.Rating < filters.rating) {
          return false;
        }
      }

      if (filters.dateRange?.from || filters.dateRange?.to) {
        const timestamp = getDateMs(
          photo.exif?.DateTimeOriginal ?? photo.dateTaken,
        );
        const from = filters.dateRange.from
          ? getDateMs(filters.dateRange.from)
          : null;
        const to = filters.dateRange.to
          ? getDateMs(filters.dateRange.to)
          : null;

        if (timestamp === null) {
          return false;
        }

        if (from !== null && timestamp < from) {
          return false;
        }

        if (to !== null && timestamp > to) {
          return false;
        }
      }

      if (queryTokens.length > 0) {
        const index = photoSearchIndex(photo);

        if (!queryTokens.every((token) => index.includes(token))) {
          return false;
        }
      }

      return true;
    });

    return [...filteredPhotos].sort((first, second) => {
      const firstTime =
        getDateMs(first.exif?.DateTimeOriginal ?? first.dateTaken) ?? 0;
      const secondTime =
        getDateMs(second.exif?.DateTimeOriginal ?? second.dateTaken) ?? 0;

      return filters.sortOrder === 'asc'
        ? firstTime - secondTime
        : secondTime - firstTime;
    });
  }
}

export const createAfilmoryPhotoLoader = (manifest: AfilmoryManifest) =>
  new AfilmoryPhotoLoader(manifest);

export const fetchAfilmoryManifest = async (
  options: AfilmoryFetchOptions = {},
) => createAfilmoryManifest(await fetchPhotos(options));

export const fetchAfilmoryPhotoSet = async (
  options: AfilmoryFetchOptions = {},
): Promise<AfilmoryPhotoSet> => {
  const manifest = await fetchAfilmoryManifest(options);
  const loader = createAfilmoryPhotoLoader(manifest);

  return {
    loader,
    manifest,
    photos: loader
      .getPhotoViewModels()
      .sort(
        (first, second) =>
          getPhotoTimestamp(second) - getPhotoTimestamp(first) ||
          first.id.localeCompare(second.id),
      ),
  };
};
