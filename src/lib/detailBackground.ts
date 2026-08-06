export type DetailBackgroundState = {
  currentOpacity: number;
  currentSrc: string;
  previousOpacity: number;
  previousSrc: string;
  version: number;
};

export const createDetailBackgroundState = (
  src: string,
): DetailBackgroundState => ({
  currentOpacity: 1,
  currentSrc: src,
  previousOpacity: 0,
  previousSrc: '',
  version: 0,
});

export const resolveDetailBackgroundState = (
  current: DetailBackgroundState,
  nextSrc: string,
): DetailBackgroundState => {
  if (!nextSrc || nextSrc === current.currentSrc) {
    return current;
  }

  return {
    currentOpacity: 1,
    currentSrc: nextSrc,
    previousOpacity: 1,
    previousSrc: current.currentSrc,
    version: current.version + 1,
  };
};

export const clearPreviousDetailBackgroundState = (
  current: DetailBackgroundState,
  version: number,
): DetailBackgroundState => {
  if (current.version !== version || !current.previousSrc) {
    return current;
  }

  return {
    ...current,
    previousOpacity: 0,
    previousSrc: '',
  };
};
