const DEFAULT_RETURN_HREF = '/';
const GALLERY_SCROLL_MAX_AGE_MS = 10 * 60 * 1000;

export const GALLERY_SCROLL_STORAGE_KEY = 'afilmory:gallery-scroll';

const getQueryValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export const normalizeInternalReturnHref = (
  value?: string | string[],
  fallback = DEFAULT_RETURN_HREF,
) => {
  const rawValue = getQueryValue(value);

  if (!rawValue) {
    return fallback;
  }

  let candidate = rawValue.trim();

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    candidate = rawValue.trim();
  }

  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\0')
  ) {
    return fallback;
  }

  return candidate;
};

export const buildPhotoDetailHref = (
  photoId: string,
  returnHref?: string | string[],
) => {
  const safeReturnHref = normalizeInternalReturnHref(returnHref, '');
  const photoHref = `/photos/${encodeURIComponent(photoId)}`;

  if (!safeReturnHref) {
    return photoHref;
  }

  return `${photoHref}?from=${encodeURIComponent(safeReturnHref)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeScrollY = (value: number) =>
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

export const createGalleryScrollSnapshot = (
  href: string,
  scrollY: number,
  updatedAt = Date.now(),
  galleryWidth?: number,
) =>
  JSON.stringify({
    galleryWidth:
      typeof galleryWidth === 'number'
        ? normalizeScrollY(galleryWidth)
        : undefined,
    href: normalizeInternalReturnHref(href),
    scrollY: normalizeScrollY(scrollY),
    updatedAt,
  });

const readGallerySnapshot = (
  rawValue: string | null,
  href: string,
  now = Date.now(),
) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (!isRecord(parsed)) {
      return null;
    }

    const { href: storedHref, updatedAt } = parsed;

    if (
      typeof storedHref !== 'string' ||
      normalizeInternalReturnHref(storedHref) !==
        normalizeInternalReturnHref(href)
    ) {
      return null;
    }

    if (
      typeof updatedAt !== 'number' ||
      now - updatedAt > GALLERY_SCROLL_MAX_AGE_MS
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const readGalleryScrollSnapshot = (
  rawValue: string | null,
  href: string,
  now = Date.now(),
) => {
  const snapshot = readGallerySnapshot(rawValue, href, now);

  if (!snapshot) {
    return null;
  }

  const { scrollY } = snapshot;

  if (typeof scrollY !== 'number') {
    return null;
  }

  return normalizeScrollY(scrollY);
};

export const readGalleryWidthSnapshot = (
  rawValue: string | null,
  href: string,
  now = Date.now(),
) => {
  const snapshot = readGallerySnapshot(rawValue, href, now);

  if (!snapshot) {
    return null;
  }

  const { galleryWidth } = snapshot;

  if (typeof galleryWidth !== 'number') {
    return null;
  }

  return normalizeScrollY(galleryWidth);
};

export const shouldHardNavigateAfterClientRouteFailure = (error: unknown) => {
  if (!isRecord(error)) {
    return true;
  }

  if (error.cancelled === true) {
    return false;
  }

  const { message } = error;

  return !(
    typeof message === 'string' &&
    /cancel(?:led|ing)|Cancel rendering route/i.test(message)
  );
};

export const shouldUseBrowserHistoryForReturn = ({
  historyLength,
  historyState,
}: {
  historyLength: number;
  historyState: unknown;
}) => {
  if (historyLength <= 1 || !isRecord(historyState)) {
    return false;
  }

  const { idx } = historyState;

  return typeof idx === 'number' && idx > 0;
};
