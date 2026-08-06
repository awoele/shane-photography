type RenderableImageCandidate =
  | Pick<HTMLImageElement, 'complete' | 'naturalWidth'>
  | null
  | undefined;

export const isRenderableImageComplete = (image: RenderableImageCandidate) =>
  Boolean(image?.complete && image.naturalWidth > 0);
