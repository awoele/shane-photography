export type DetailSwipeTarget = 'previous' | 'next';

type DetailSwipeTargetInput = {
  deltaX: number;
  deltaY: number;
  elapsed: number;
  hasNext: boolean;
  hasPrevious: boolean;
  viewportWidth: number;
};

type BoundedDetailSwipeOffsetInput = {
  deltaX: number;
  hasNext: boolean;
  hasPrevious: boolean;
  viewportWidth: number;
};

type DetailSwipeCommitOffsetInput = {
  target: DetailSwipeTarget;
  viewportWidth: number;
};

type DetailSwipeHandoffInput = {
  currentPhotoId: string;
  handoffPhotoId: string;
  isImagePainted: boolean;
};

const MIN_SWIPE_DISTANCE = 52;
const MAX_SWIPE_ELAPSED = 900;
const EDGE_RESISTANCE = 0.3;

export const getDetailSwipeTarget = ({
  deltaX,
  deltaY,
  elapsed,
  hasNext,
  hasPrevious,
  viewportWidth,
}: DetailSwipeTargetInput): DetailSwipeTarget | null => {
  const threshold = Math.min(
    Math.max(MIN_SWIPE_DISTANCE, viewportWidth * 0.16),
    96,
  );
  const isHorizontal =
    Math.abs(deltaX) >= threshold &&
    Math.abs(deltaX) > Math.abs(deltaY) * 1.15 &&
    elapsed < MAX_SWIPE_ELAPSED;

  if (!isHorizontal) {
    return null;
  }

  if (deltaX < 0) {
    return hasNext ? 'next' : null;
  }

  return hasPrevious ? 'previous' : null;
};

export const getBoundedDetailSwipeOffset = ({
  deltaX,
  hasNext,
  hasPrevious,
  viewportWidth,
}: BoundedDetailSwipeOffsetInput) => {
  if ((deltaX < 0 && hasNext) || (deltaX > 0 && hasPrevious)) {
    return deltaX;
  }

  const resisted = deltaX * EDGE_RESISTANCE;
  const maxResistance = Math.max(24, viewportWidth * 0.12);

  return Math.min(Math.max(resisted, -maxResistance), maxResistance);
};

export const getDetailSwipeCommitOffset = ({
  target,
  viewportWidth,
}: DetailSwipeCommitOffsetInput) =>
  target === 'next' ? -viewportWidth : viewportWidth;

export const shouldHoldDetailSwipeHandoff = ({
  currentPhotoId,
  handoffPhotoId,
  isImagePainted,
}: DetailSwipeHandoffInput) =>
  Boolean(handoffPhotoId) &&
  handoffPhotoId === currentPhotoId &&
  !isImagePainted;
