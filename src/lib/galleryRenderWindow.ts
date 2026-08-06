const MOBILE_INITIAL_RENDER_LIMIT = 24;
const TABLET_INITIAL_RENDER_LIMIT = 48;
const DESKTOP_INITIAL_RENDER_LIMIT = 96;
const MOBILE_RENDER_BATCH_SIZE = 16;
const DESKTOP_RENDER_BATCH_SIZE = 48;
const MOBILE_LOAD_ROOT_MARGIN_PX = 420;
const DESKTOP_LOAD_ROOT_MARGIN_PX = 720;

const clampPhotoCount = (value: number) =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export const getInitialGalleryRenderLimit = (
  containerWidth: number,
  photoCount: number,
) => {
  const total = clampPhotoCount(photoCount);

  if (total === 0) {
    return 0;
  }

  let limit = MOBILE_INITIAL_RENDER_LIMIT;

  if (containerWidth >= 1024) {
    limit = DESKTOP_INITIAL_RENDER_LIMIT;
  } else if (containerWidth >= 768) {
    limit = TABLET_INITIAL_RENDER_LIMIT;
  }

  return Math.min(total, limit);
};

export const getGalleryRenderBatchSize = (containerWidth: number) =>
  containerWidth >= 768 ? DESKTOP_RENDER_BATCH_SIZE : MOBILE_RENDER_BATCH_SIZE;

export const getGalleryLoadRootMargin = (containerWidth: number) =>
  `${
    containerWidth >= 768
      ? DESKTOP_LOAD_ROOT_MARGIN_PX
      : MOBILE_LOAD_ROOT_MARGIN_PX
  }px 0px`;

export const getNextGalleryRenderLimit = ({
  containerWidth,
  currentLimit,
  photoCount,
}: {
  containerWidth: number;
  currentLimit: number;
  photoCount: number;
}) => {
  const total = clampPhotoCount(photoCount);
  const current = clampPhotoCount(currentLimit);

  if (total === 0) {
    return 0;
  }

  return Math.min(total, current + getGalleryRenderBatchSize(containerWidth));
};

export const shouldRenderGalleryLoadSentinel = (
  currentLimit: number,
  photoCount: number,
) => clampPhotoCount(currentLimit) < clampPhotoCount(photoCount);
