type SlideWheelInput = {
  deltaMode?: number;
  deltaX?: number;
  deltaY?: number;
  threshold?: number;
};

const DELTA_LINE_MODE = 1;
const DELTA_PAGE_MODE = 2;
const LINE_MODE_PX = 16;
const PAGE_MODE_PX = 600;
const DEFAULT_WHEEL_THRESHOLD_PX = 24;

const normalizeWheelDelta = (delta: number, deltaMode = 0) => {
  if (deltaMode === DELTA_LINE_MODE) {
    return delta * LINE_MODE_PX;
  }

  if (deltaMode === DELTA_PAGE_MODE) {
    return delta * PAGE_MODE_PX;
  }

  return delta;
};

export const getSlideWheelOffset = ({
  deltaMode = 0,
  deltaX = 0,
  deltaY = 0,
  threshold = DEFAULT_WHEEL_THRESHOLD_PX,
}: SlideWheelInput) => {
  const normalizedX = normalizeWheelDelta(deltaX, deltaMode);
  const normalizedY = normalizeWheelDelta(deltaY, deltaMode);
  const dominantDelta =
    Math.abs(normalizedX) > Math.abs(normalizedY) ? normalizedX : normalizedY;

  if (Math.abs(dominantDelta) < threshold) {
    return 0;
  }

  return dominantDelta > 0 ? 1 : -1;
};
