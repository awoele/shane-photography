const DEFAULT_RETURN_HREF = '/';

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
