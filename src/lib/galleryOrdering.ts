import {
  comparePhotosByManagedOrder,
  type Photo,
  type PhotoSortMode,
  shufflePhotos,
} from './photos';

type GalleryOrderingOptions = {
  category: string;
  photos: Photo[];
  seed: number;
  sortMode: PhotoSortMode | '';
};

export const getOrderedGalleryPhotos = ({
  category,
  photos,
  seed,
  sortMode,
}: GalleryOrderingOptions) => {
  const filteredPhotos =
    category && category !== 'all'
      ? photos.filter((photo) => photo.category === category)
      : photos;

  if (sortMode === 'random') {
    return shufflePhotos(filteredPhotos, seed);
  }

  if (category && category !== 'all') {
    return [...filteredPhotos].sort(comparePhotosByManagedOrder);
  }

  return filteredPhotos;
};
