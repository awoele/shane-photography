export type DetailViewerPhotoIdentity = {
  id: string;
};

export type DetailViewerDirection = 'next' | 'previous';

export const resolveDetailViewerIndex = <
  TPhoto extends DetailViewerPhotoIdentity,
>(
  photos: TPhoto[],
  photoId: string,
  fallbackIndex = 0,
) => {
  const matchedIndex = photos.findIndex((photo) => photo.id === photoId);

  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  if (fallbackIndex >= 0 && fallbackIndex < photos.length) {
    return fallbackIndex;
  }

  return 0;
};

export const getDetailViewerNeighborIndex = (
  currentIndex: number,
  totalPhotos: number,
  direction: DetailViewerDirection,
) => {
  if (totalPhotos <= 1) {
    return null;
  }

  const normalizedIndex =
    currentIndex >= 0 && currentIndex < totalPhotos ? currentIndex : 0;

  return direction === 'next'
    ? (normalizedIndex + 1) % totalPhotos
    : (normalizedIndex - 1 + totalPhotos) % totalPhotos;
};

export const shouldReplaceDetailViewerUrl = ({
  activePhotoId,
  lastSyncedPhotoId,
  routedPhotoId,
}: {
  activePhotoId: string;
  lastSyncedPhotoId: string;
  routedPhotoId: string;
}) => activePhotoId !== routedPhotoId && activePhotoId !== lastSyncedPhotoId;
