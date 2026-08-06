import {
  type AfilmoryFetchOptions,
  type AfilmoryPhotoSet,
  createAfilmoryManifest,
  createAfilmoryPhotoLoader,
} from '../afilmoryManifest';
import {
  comparePhotosByManagedOrder,
  fetchPhotos,
  type Photo,
} from '../photos';
import { getPublishedCmsPhotos, listCmsPhotos } from './photoCms';

const PUBLIC_PHOTO_SET_CACHE_TTL_MS = 15_000;

type ManagedPhotoSetCache = {
  key: string;
  timestamp: number;
  value: AfilmoryPhotoSet;
};

let cachedPhotoSet: ManagedPhotoSetCache | null = null;
let pendingPhotoSet: {
  key: string;
  promise: Promise<AfilmoryPhotoSet>;
} | null = null;

const shouldMergeRemoteManifest = () =>
  process.env.PHOTO_CMS_REMOTE_MANIFEST === 'true' ||
  process.env.VERCEL === '1';

const shouldUseManagedCmsPhotoList = () => {
  if (process.env.PHOTO_CMS_CLOUD === 'true') {
    return true;
  }

  if (process.env.PHOTO_CMS_CLOUD === 'false') {
    return false;
  }

  if (process.env.VERCEL === '1') {
    return true;
  }

  return !process.env.PHOTO_CMS_DATA_FILE;
};

const getManagedPhotoSetCacheKey = () =>
  [
    process.env.PHOTO_CMS_CLOUD || '',
    process.env.PHOTO_CMS_DATA_FILE || '',
    process.env.PHOTO_CMS_INCLUDE_LOCAL_OVERRIDES || '',
    process.env.PHOTO_CMS_OVERRIDES_URL || '',
    process.env.PHOTO_CMS_REMOTE_MANIFEST || '',
    process.env.VERCEL || '',
  ].join('|');

const isFreshPhotoSetCache = (key: string) =>
  Boolean(
    cachedPhotoSet &&
      cachedPhotoSet.key === key &&
      Date.now() - cachedPhotoSet.timestamp < PUBLIC_PHOTO_SET_CACHE_TTL_MS,
  );

export const clearManagedPhotoSetCache = () => {
  cachedPhotoSet = null;
  pendingPhotoSet = null;
};

const mergeRemoteAndCmsPhotos = ({
  cmsPhotos,
  remotePhotos,
}: {
  cmsPhotos: Awaited<ReturnType<typeof listCmsPhotos>>;
  remotePhotos: Photo[];
}) => {
  const cmsById = new Map(cmsPhotos.map((photo) => [photo.id, photo]));
  const remoteIds = new Set(remotePhotos.map((photo) => photo.id));
  const mergedRemotePhotos = remotePhotos
    .map((remotePhoto) => {
      const cmsPhoto = cmsById.get(remotePhoto.id);

      if (cmsPhoto && (cmsPhoto.deleted || cmsPhoto.status !== 'published')) {
        return null;
      }

      return cmsPhoto
        ? {
            ...remotePhoto,
            ...cmsPhoto,
            src: remotePhoto.src || cmsPhoto.src,
            thumbnail: remotePhoto.thumbnail || cmsPhoto.thumbnail,
          }
        : remotePhoto;
    })
    .filter((photo): photo is Photo => photo !== null);
  const localOnlyPhotos = cmsPhotos.filter(
    (photo) => photo.status === 'published' && !remoteIds.has(photo.id),
  );

  return [...mergedRemotePhotos, ...localOnlyPhotos];
};

export const fetchManagedManifest = async (
  options: AfilmoryFetchOptions = {},
) => {
  if (!shouldMergeRemoteManifest()) {
    return createAfilmoryManifest(await getPublishedCmsPhotos());
  }

  try {
    if (shouldUseManagedCmsPhotoList()) {
      const cmsPhotos = await listCmsPhotos({
        includeDeleted: true,
        status: 'all',
      });

      return createAfilmoryManifest(
        cmsPhotos.filter(
          (photo) => photo.status === 'published' && !photo.deleted,
        ),
      );
    }

    const [cmsPhotos, remotePhotos] = await Promise.all([
      listCmsPhotos({ includeDeleted: true, status: 'all' }),
      fetchPhotos({ cacheBust: options.cacheBust }),
    ]);

    return createAfilmoryManifest(
      mergeRemoteAndCmsPhotos({ cmsPhotos, remotePhotos }),
    );
  } catch (_error) {
    return createAfilmoryManifest(await getPublishedCmsPhotos());
  }
};

export const fetchManagedPhotoSet = async (
  options: AfilmoryFetchOptions = {},
): Promise<AfilmoryPhotoSet> => {
  const key = getManagedPhotoSetCacheKey();

  if (!options.cacheBust && isFreshPhotoSetCache(key)) {
    return cachedPhotoSet!.value;
  }

  if (!options.cacheBust && pendingPhotoSet?.key === key) {
    return pendingPhotoSet.promise;
  }

  const loadPhotoSet = async () => {
    const manifest = await fetchManagedManifest(options);
    const loader = createAfilmoryPhotoLoader(manifest);

    return {
      loader,
      manifest,
      photos: loader.getPhotoViewModels().sort(comparePhotosByManagedOrder),
    };
  };

  if (options.cacheBust) {
    const value = await loadPhotoSet();
    cachedPhotoSet = {
      key,
      timestamp: Date.now(),
      value,
    };
    pendingPhotoSet = null;

    return value;
  }

  const promise = loadPhotoSet().then((value) => {
    cachedPhotoSet = {
      key,
      timestamp: Date.now(),
      value,
    };

    return value;
  });

  pendingPhotoSet = {
    key,
    promise,
  };

  try {
    return await promise;
  } finally {
    if (pendingPhotoSet?.promise === promise) {
      pendingPhotoSet = null;
    }
  }
};
