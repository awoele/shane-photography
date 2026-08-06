export type DetailImageState = {
  displaySrc: string;
  loading: boolean;
  previousDisplaySrc: string;
  progress: number;
  source: string;
};

const createReadyDetailImageState = ({
  currentDisplaySrc,
  src,
}: {
  currentDisplaySrc?: string;
  src: string;
}): DetailImageState => ({
  displaySrc: src,
  loading: false,
  previousDisplaySrc:
    currentDisplaySrc && currentDisplaySrc !== src ? currentDisplaySrc : '',
  progress: 100,
  source: src,
});

export const createDetailImageState = ({
  placeholderSrc,
  sourceReady,
  src,
}: {
  placeholderSrc?: string;
  sourceReady: boolean;
  src: string;
}): DetailImageState => {
  const displaySrc = src || placeholderSrc || '';
  const loading = Boolean(src) && !sourceReady;

  return {
    displaySrc,
    loading,
    previousDisplaySrc: '',
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
    if (sourceReady && current.displaySrc !== src) {
      return createReadyDetailImageState({
        currentDisplaySrc: current.displaySrc,
        src,
      });
    }

    return current;
  }

  if (!sourceReady && current.displaySrc) {
    return {
      displaySrc: current.displaySrc,
      loading: Boolean(src),
      previousDisplaySrc: '',
      progress: 0,
      source: src,
    };
  }

  if (sourceReady) {
    return createReadyDetailImageState({
      currentDisplaySrc: current.displaySrc,
      src,
    });
  }

  return createDetailImageState({
    placeholderSrc,
    sourceReady,
    src,
  });
};

export const clearPreviousDetailImageDisplay = (
  current: DetailImageState,
  paintedSrc: string,
): DetailImageState => {
  if (!current.previousDisplaySrc || current.displaySrc !== paintedSrc) {
    return current;
  }

  return {
    ...current,
    previousDisplaySrc: '',
  };
};
