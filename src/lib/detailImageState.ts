export type DetailImageState = {
  displaySrc: string;
  loading: boolean;
  progress: number;
  source: string;
};

export const createDetailImageState = ({
  placeholderSrc,
  sourceReady,
  src,
}: {
  placeholderSrc?: string;
  sourceReady: boolean;
  src: string;
}): DetailImageState => {
  const displaySrc = sourceReady ? src : placeholderSrc || src;
  const loading = displaySrc !== src;

  return {
    displaySrc,
    loading,
    progress: loading ? 0 : 100,
    source: src,
  };
};

export const resolveDetailImageStateForRender = ({
  current,
  placeholderSrc,
  sourceReady,
  src,
}: {
  current: DetailImageState;
  placeholderSrc?: string;
  sourceReady: boolean;
  src: string;
}) => {
  if (current.source === src) {
    return current;
  }

  return createDetailImageState({
    placeholderSrc,
    sourceReady,
    src,
  });
};
