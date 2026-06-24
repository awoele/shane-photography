export const SLIDE_LANDSCAPE_REQUEST_KEY = 'slide-landscape-requested';

type LandscapeRequestResult =
  | 'already-landscape'
  | 'failed'
  | 'locked'
  | 'not-mobile'
  | 'unsupported';

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

const MOBILE_SCREEN_LIMIT = 900;

export const markSlideLandscapeRequest = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    SLIDE_LANDSCAPE_REQUEST_KEY,
    String(Date.now()),
  );
};

export const hasSlideLandscapeRequest = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(SLIDE_LANDSCAPE_REQUEST_KEY) !== null;
};

export const isSlideMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const coarsePointer =
    window.matchMedia('(pointer: coarse)').matches ||
    window.navigator.maxTouchPoints > 0;
  const compactViewport =
    Math.min(window.innerWidth, window.innerHeight) <= MOBILE_SCREEN_LIMIT;

  return coarsePointer && compactViewport;
};

export const isPortraitViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(orientation: portrait)').matches ||
    window.innerHeight > window.innerWidth
  );
};

export const requestSlideFullscreen = async () => {
  if (typeof document === 'undefined' || !isSlideMobileViewport()) {
    return;
  }

  markSlideLandscapeRequest();

  try {
    if (
      !document.fullscreenElement &&
      document.documentElement.requestFullscreen
    ) {
      await document.documentElement.requestFullscreen({
        navigationUI: 'hide',
      });
    }
  } catch {
    // Some embedded mobile browsers keep their navigation UI regardless.
  }
};

export const requestSlideLandscape =
  async (): Promise<LandscapeRequestResult> => {
    if (!isSlideMobileViewport()) {
      return 'not-mobile';
    }

    await requestSlideFullscreen();

    if (!isPortraitViewport()) {
      return 'already-landscape';
    }

    const orientation = window.screen.orientation as
      | LockableOrientation
      | undefined;

    if (!orientation?.lock) {
      return 'unsupported';
    }

    try {
      await orientation.lock('landscape');
      return 'locked';
    } catch {
      return 'failed';
    }
  };
