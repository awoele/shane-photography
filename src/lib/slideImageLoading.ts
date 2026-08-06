const SLIDE_EAGER_IMAGE_DISTANCE = 2;
const SLIDE_RENDER_IMAGE_DISTANCE = 4;

export const getSlideImageLoading = (
  distanceFromActive: number,
): 'eager' | 'lazy' =>
  Math.abs(distanceFromActive) <= SLIDE_EAGER_IMAGE_DISTANCE ? 'eager' : 'lazy';

export const shouldRenderSlideImage = (distanceFromActive: number) =>
  Math.abs(distanceFromActive) <= SLIDE_RENDER_IMAGE_DISTANCE;
