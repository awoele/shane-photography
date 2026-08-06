export const GALLERY_DETAIL_TRANSITION_STORAGE_KEY =
  'afilmory:gallery-detail-transition';

export const GALLERY_DETAIL_TRANSITION_MAX_AGE_MS = 3000;
export const GALLERY_DETAIL_TRANSITION_DURATION_MS = 280;

export type GalleryDetailTransitionRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type GalleryDetailTransitionPayload = {
  createdAt: number;
  imageSrc: string;
  photoId: string;
  rect: GalleryDetailTransitionRect;
};

const roundRectValue = (value: number) => Math.round(value * 100) / 100;

const isUsableRect = (rect: GalleryDetailTransitionRect) =>
  Number.isFinite(rect.height) &&
  Number.isFinite(rect.left) &&
  Number.isFinite(rect.top) &&
  Number.isFinite(rect.width) &&
  rect.height > 2 &&
  rect.width > 2;

const normalizeRect = (
  rect: GalleryDetailTransitionRect,
): GalleryDetailTransitionRect => ({
  height: roundRectValue(rect.height),
  left: roundRectValue(rect.left),
  top: roundRectValue(rect.top),
  width: roundRectValue(rect.width),
});

export const createGalleryDetailTransitionPayload = ({
  imageSrc,
  now,
  photoId,
  rect,
}: {
  imageSrc: string;
  now: number;
  photoId: string;
  rect: GalleryDetailTransitionRect;
}): GalleryDetailTransitionPayload | null => {
  const normalizedImageSrc = imageSrc.trim();
  const normalizedPhotoId = photoId.trim();
  const normalizedRect = normalizeRect(rect);

  if (
    !normalizedImageSrc ||
    !normalizedPhotoId ||
    !Number.isFinite(now) ||
    !isUsableRect(normalizedRect)
  ) {
    return null;
  }

  return {
    createdAt: now,
    imageSrc: normalizedImageSrc,
    photoId: normalizedPhotoId,
    rect: normalizedRect,
  };
};

export const readGalleryDetailTransitionPayload = (
  rawPayload: string | null,
  photoId: string,
  now: number,
): GalleryDetailTransitionPayload | null => {
  if (!rawPayload || !photoId || !Number.isFinite(now)) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as GalleryDetailTransitionPayload;

    if (
      parsed.photoId !== photoId ||
      now - parsed.createdAt > GALLERY_DETAIL_TRANSITION_MAX_AGE_MS ||
      !parsed.imageSrc ||
      !isUsableRect(parsed.rect)
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      imageSrc: parsed.imageSrc,
      photoId: parsed.photoId,
      rect: normalizeRect(parsed.rect),
    };
  } catch {
    return null;
  }
};

export const getContainedImageRect = ({
  containerRect,
  imageHeight,
  imageWidth,
}: {
  containerRect: GalleryDetailTransitionRect;
  imageHeight: number | undefined;
  imageWidth: number | undefined;
}): GalleryDetailTransitionRect => {
  const normalizedContainer = normalizeRect(containerRect);

  if (
    !isUsableRect(normalizedContainer) ||
    !imageHeight ||
    !imageWidth ||
    imageHeight <= 0 ||
    imageWidth <= 0
  ) {
    return normalizedContainer;
  }

  const containerRatio = normalizedContainer.width / normalizedContainer.height;
  const imageRatio = imageWidth / imageHeight;

  if (containerRatio > imageRatio) {
    const { height } = normalizedContainer;
    const width = height * imageRatio;

    return normalizeRect({
      height,
      left: normalizedContainer.left + (normalizedContainer.width - width) / 2,
      top: normalizedContainer.top,
      width,
    });
  }

  const { width } = normalizedContainer;
  const height = width / imageRatio;

  return normalizeRect({
    height,
    left: normalizedContainer.left,
    top: normalizedContainer.top + (normalizedContainer.height - height) / 2,
    width,
  });
};
