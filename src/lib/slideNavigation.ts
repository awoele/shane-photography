import type { PhotoSortMode } from './photos';

type SlideProofNavigationEvent = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
  stopPropagation: () => void;
};

export const guardSlideProofNavigationEvent = (
  event: SlideProofNavigationEvent,
) => {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  return true;
};

export const buildSlideProofHref = ({
  category,
  randomSeed,
  sortMode,
}: {
  category: string;
  randomSeed: number;
  sortMode: PhotoSortMode | '';
}) => {
  const params = new URLSearchParams();

  if (sortMode) {
    params.set('sort', sortMode);
  }

  if (category) {
    params.set('category', category);
  }

  if (sortMode === 'random') {
    params.set('seed', String(randomSeed));
  }

  const query = params.toString();

  return query ? `/?${query}` : '/';
};

export const buildSlideCurrentHref = ({
  activePhotoId,
  proofHref,
}: {
  activePhotoId?: string;
  proofHref: string;
}) => {
  const slideHref = proofHref.replace(/^\//, '/slide');

  if (!activePhotoId) {
    return slideHref;
  }

  const [pathname, rawQuery = ''] = slideHref.split('?');
  const [queryString, hash = ''] = rawQuery.split('#');
  const params = new URLSearchParams(queryString);

  params.set('id', activePhotoId);

  const query = params.toString();
  const hashSuffix = hash ? `#${hash}` : '';

  return `${pathname}${query ? `?${query}` : ''}${hashSuffix}`;
};
