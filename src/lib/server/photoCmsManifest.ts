import {
  type AfilmoryFetchOptions,
  type AfilmoryPhotoSet,
  createAfilmoryManifest,
  createAfilmoryPhotoLoader,
} from '../afilmoryManifest';
import { getPhotoTimestamp } from '../photos';
import { getPublishedCmsPhotos } from './photoCms';

export const fetchManagedManifest = async (
  _options: AfilmoryFetchOptions = {},
) => createAfilmoryManifest(await getPublishedCmsPhotos());

export const fetchManagedPhotoSet = async (
  options: AfilmoryFetchOptions = {},
): Promise<AfilmoryPhotoSet> => {
  const manifest = await fetchManagedManifest(options);
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
