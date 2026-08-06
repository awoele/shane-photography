type SlideRenderWindowInput = {
  activeIndex: number;
  radius: number;
  total: number;
};

type ShouldRecenterSlideRenderWindowInput = {
  activeIndex: number;
  end: number;
  margin: number;
  start: number;
};

type SlideRenderWindowLocalIndexInput = {
  end: number;
  index: number;
  start: number;
};

export type SlideRenderWindow = {
  end: number;
  indexes: number[];
  localActiveIndex: number;
  start: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getSlideRenderWindow = ({
  activeIndex,
  radius,
  total,
}: SlideRenderWindowInput): SlideRenderWindow => {
  if (total <= 0) {
    return {
      end: -1,
      indexes: [],
      localActiveIndex: 0,
      start: 0,
    };
  }

  const clampedActiveIndex = clamp(activeIndex, 0, total - 1);
  const safeRadius = Math.max(0, Math.floor(radius));
  const start = Math.max(0, clampedActiveIndex - safeRadius);
  const end = Math.min(total - 1, clampedActiveIndex + safeRadius);
  const indexes = Array.from(
    { length: end - start + 1 },
    (_, offset) => start + offset,
  );

  return {
    end,
    indexes,
    localActiveIndex: clampedActiveIndex - start,
    start,
  };
};

export const shouldRecenterSlideRenderWindow = ({
  activeIndex,
  end,
  margin,
  start,
}: ShouldRecenterSlideRenderWindowInput) => {
  if (end < start) {
    return false;
  }

  const safeMargin = Math.max(0, Math.floor(margin));

  return activeIndex - start <= safeMargin || end - activeIndex <= safeMargin;
};

export const getSlideRenderWindowLocalIndex = ({
  end,
  index,
  start,
}: SlideRenderWindowLocalIndexInput) => {
  if (index < start || index > end) {
    return null;
  }

  return index - start;
};
