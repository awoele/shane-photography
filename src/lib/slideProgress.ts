type SlideProgressIndexInput = {
  clientX: number;
  left: number;
  total: number;
  width: number;
};

type SlideProgressPercentInput = {
  index: number;
  total: number;
};

type SlideProgressDisplayIndexInput = {
  activeIndex: number;
  total: number;
  visualActiveIndex: number;
};

type SlideProgressVisualIndexInput = {
  slideStart: number;
  slidesGrid: number[];
  total: number;
  translate: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getSlideProgressIndex = ({
  clientX,
  left,
  total,
  width,
}: SlideProgressIndexInput) => {
  if (total <= 1 || width <= 0) {
    return 0;
  }

  const progress = clamp((clientX - left) / width, 0, 1);

  return clamp(Math.round(progress * (total - 1)), 0, total - 1);
};

export const getSlideProgressPercent = ({
  index,
  total,
}: SlideProgressPercentInput) => {
  if (total <= 0) {
    return 0;
  }

  return ((clamp(index, 0, total - 1) + 1) / total) * 100;
};

export const getSlideProgressDisplayIndex = ({
  activeIndex,
  total,
  visualActiveIndex,
}: SlideProgressDisplayIndexInput) => {
  if (total <= 0) {
    return 0;
  }

  return clamp(
    Number.isFinite(visualActiveIndex) ? visualActiveIndex : activeIndex,
    0,
    total - 1,
  );
};

export const getSlideProgressVisualIndexFromSlidesGrid = ({
  slideStart,
  slidesGrid,
  total,
  translate,
}: SlideProgressVisualIndexInput) => {
  if (total <= 0 || slidesGrid.length === 0) {
    return 0;
  }

  const offset = -translate;
  const lastLocalIndex = slidesGrid.length - 1;
  const firstOffset = slidesGrid[0]!;
  const lastOffset = slidesGrid[lastLocalIndex]!;

  if (offset <= firstOffset) {
    return clamp(slideStart, 0, total - 1);
  }

  if (offset >= lastOffset) {
    return clamp(slideStart + lastLocalIndex, 0, total - 1);
  }

  for (let localIndex = 0; localIndex < lastLocalIndex; localIndex += 1) {
    const current = slidesGrid[localIndex]!;
    const next = slidesGrid[localIndex + 1]!;

    if (offset >= current && offset <= next) {
      const span = next - current;
      const localProgress = span === 0 ? 0 : (offset - current) / span;

      return clamp(slideStart + localIndex + localProgress, 0, total - 1);
    }
  }

  return clamp(slideStart, 0, total - 1);
};
