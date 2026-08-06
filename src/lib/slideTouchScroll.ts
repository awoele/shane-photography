type SlideTouchScrollInput = {
  currentTouchX: number;
  maxScrollLeft: number;
  startScrollLeft: number;
  startTouchX: number;
};

type DocumentTouchMoveInput = {
  currentTouchX: number;
  currentTouchY: number;
  startTouchX: number;
  startTouchY: number;
  targetIsSlideTrack: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getSlideTouchScrollLeft = ({
  currentTouchX,
  maxScrollLeft,
  startScrollLeft,
  startTouchX,
}: SlideTouchScrollInput) =>
  clamp(startScrollLeft - (currentTouchX - startTouchX), 0, maxScrollLeft);

export const shouldPreventSlideDocumentTouchMove = ({
  currentTouchX,
  currentTouchY,
  startTouchX,
  startTouchY,
  targetIsSlideTrack,
}: DocumentTouchMoveInput) => {
  const deltaX = currentTouchX - startTouchX;
  const deltaY = currentTouchY - startTouchY;
  const movementThreshold = targetIsSlideTrack ? 1 : 1;

  return Math.max(Math.abs(deltaX), Math.abs(deltaY)) > movementThreshold;
};

export const shouldLetSlideTrackUseNativeMomentum = ({
  currentTouchX,
  currentTouchY,
  startTouchX,
  startTouchY,
  targetIsSlideTrack,
}: DocumentTouchMoveInput) => {
  const deltaX = currentTouchX - startTouchX;
  const deltaY = currentTouchY - startTouchY;

  return targetIsSlideTrack && Math.abs(deltaX) > Math.max(2, Math.abs(deltaY));
};
