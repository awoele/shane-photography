import { formatCameraName, formatCategoryLabel, type Photo } from './photos';

export type GalleryFacet = {
  value: string;
  label: string;
  count: number;
};

export type GalleryInsights = {
  totalPhotos: number;
  cameraCount: number;
  lensCount: number;
  locationCount: number;
  categories: GalleryFacet[];
  cameras: GalleryFacet[];
  lenses: GalleryFacet[];
  locations: GalleryFacet[];
};

export type GalleryFilterState = {
  category: string;
  camera: string;
  lens: string;
  location: string;
  query: string;
};

const normalizeText = (value: string) => value.trim();

const normalizeForMatch = (value: string) => normalizeText(value).toLowerCase();

const normalizeCamera = (camera: string) =>
  normalizeText(formatCameraName(camera));

const createFacetList = (
  values: string[],
  getLabel: (value: string) => string = (value) => value,
) => {
  const counts = new Map<string, number>();

  values.forEach((rawValue) => {
    const value = normalizeText(rawValue);

    if (!value) {
      return;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: getLabel(value),
      count,
    }))
    .sort(
      (first, second) =>
        second.count - first.count || first.label.localeCompare(second.label),
    );
};

const photoTextIndex = (photo: Photo) =>
  [
    photo.id,
    photo.title,
    photo.description,
    photo.category,
    formatCategoryLabel(photo.category),
    photo.location,
    photo.camera,
    normalizeCamera(photo.camera),
    photo.lens,
    photo.focalLength,
    photo.aperture,
    photo.shutterSpeed,
    photo.iso,
    photo.date,
    photo.dateTaken,
  ]
    .map(normalizeForMatch)
    .join(' ');

export const createGalleryInsights = (photos: Photo[]): GalleryInsights => {
  const categories = createFacetList(
    photos.map((photo) => photo.category),
    formatCategoryLabel,
  );
  const cameras = createFacetList(
    photos.map((photo) => normalizeCamera(photo.camera)),
  );
  const lenses = createFacetList(photos.map((photo) => photo.lens));
  const locations = createFacetList(photos.map((photo) => photo.location));

  return {
    totalPhotos: photos.length,
    cameraCount: cameras.length,
    lensCount: lenses.length,
    locationCount: locations.length,
    categories,
    cameras,
    lenses,
    locations,
  };
};

export const filterPhotosForGallery = (
  photos: Photo[],
  filters: GalleryFilterState,
) => {
  const category = normalizeForMatch(filters.category);
  const camera = normalizeForMatch(filters.camera);
  const lens = normalizeForMatch(filters.lens);
  const location = normalizeForMatch(filters.location);
  const queryTokens = normalizeForMatch(filters.query)
    .split(/\s+/)
    .filter(Boolean);

  return photos.filter((photo) => {
    if (
      category &&
      category !== 'all' &&
      normalizeForMatch(photo.category) !== category
    ) {
      return false;
    }

    if (camera && normalizeForMatch(normalizeCamera(photo.camera)) !== camera) {
      return false;
    }

    if (lens && normalizeForMatch(photo.lens) !== lens) {
      return false;
    }

    if (location && normalizeForMatch(photo.location) !== location) {
      return false;
    }

    if (queryTokens.length === 0) {
      return true;
    }

    const index = photoTextIndex(photo);

    return queryTokens.every((token) => index.includes(token));
  });
};
