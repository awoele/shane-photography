import type { Photo } from './photos';

export type MasonryColumn = {
  photos: Photo[];
  score: number;
};

export const getMasonryColumnKey = (columnIndex: number) =>
  `masonry-column-${Math.max(0, Math.floor(columnIndex))}`;

export const normalizeMasonryContainerWidth = (width: number) =>
  Math.max(0, Math.round(width));

const getPhotoHeightScore = (photo: Photo) => {
  if (photo.width <= 0 || photo.height <= 0) {
    return 0.75;
  }

  return photo.height / photo.width;
};

export const getMasonryColumnCount = (
  containerWidth: number,
  photoCount: number,
) => {
  if (photoCount <= 0) {
    return 0;
  }

  let targetCount = 2;

  if (containerWidth >= 1280) {
    targetCount = 6;
  } else if (containerWidth >= 1024) {
    targetCount = 5;
  } else if (containerWidth >= 768) {
    targetCount = 4;
  } else if (containerWidth >= 640) {
    targetCount = 3;
  }

  return Math.max(1, Math.min(photoCount, targetCount));
};

export const buildMasonryColumns = (
  photos: Photo[],
  requestedColumnCount: number,
): MasonryColumn[] => {
  const columnCount = Math.max(
    0,
    Math.min(photos.length, Math.floor(requestedColumnCount)),
  );

  if (columnCount === 0) {
    return [];
  }

  const columns = Array.from(
    { length: columnCount },
    (): MasonryColumn => ({
      photos: [],
      score: 0,
    }),
  );

  photos.forEach((photo) => {
    const targetColumn = columns.reduce((shortest, column) =>
      column.score < shortest.score ? column : shortest,
    );

    targetColumn.photos.push(photo);
    targetColumn.score += getPhotoHeightScore(photo);
  });

  return columns;
};
