/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Meta } from '@/layout/Meta';
import { buildPhotoDetailHref } from '@/lib/navigation';
import {
  formatCameraName,
  formatIso,
  getDisplayDate,
  getPhotoTitle,
  type Photo,
  type PhotoSortMode,
  shufflePhotos,
} from '@/lib/photos';
import {
  isPortraitViewport,
  isSlideMobileViewport,
  requestSlideFullscreen,
  requestSlideLandscape,
} from '@/lib/slideOrientation';
import { AppConfig } from '@/utils/AppConfig';

type SlidePageProps = {
  category: string;
  initialIndex: number;
  loadError: string;
  photos: Photo[];
  randomSeed: number;
  sortMode: PhotoSortMode | '';
};

type CardMetrics = {
  center: number;
  index: number;
};

type PendingPointer = {
  index: number;
  scrollLeft: number;
  x: number;
  y: number;
};

const SCROLL_TO_CENTER_DELAY_MS = 80;
const CLICK_MOVEMENT_LIMIT_PX = 9;
const FLIP_DURATION_MS = 720;
const FLIP_CLOSE_DURATION_MS = 820;
const OPEN_FLIP_DELAY_MS = 150;
const SLIDE_SCROLL_DURATION_MS = 680;
const WHEEL_SCROLL_DURATION_MS = 360;
const SLIDE_CHROME_IDLE_DELAY_MS = 2400;
const FALLBACK_ASPECT_RATIO = 3 / 2;

const getQueryId = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getQueryValue = getQueryId;

const createRandomSeed = () =>
  Date.now() + Math.floor(Math.random() * 2147483647);

const getQuerySortMode = (
  value: string | string[] | undefined,
): PhotoSortMode | '' => {
  const sort = getQueryValue(value);

  if (sort === 'random' || sort === 'latest') {
    return sort;
  }

  return '';
};

const getQuerySeed = (value: string | string[] | undefined) => {
  const seed = Number.parseInt(getQueryValue(value) ?? '', 10);

  return Number.isFinite(seed) && seed > 0 ? seed : createRandomSeed();
};

const getQueryCategory = (value: string | string[] | undefined) => {
  const category = getQueryValue(value);

  return category && category !== 'all' ? category : '';
};

const getSafeAspectRatio = (photo: Photo) => {
  if (photo.width > 0 && photo.height > 0) {
    return photo.width / photo.height;
  }

  return FALLBACK_ASPECT_RATIO;
};

type SlideCardAspectStyle = CSSProperties & {
  '--slide-card-width-default': string;
  '--slide-card-width-desktop-portrait': string;
  '--slide-card-width-landscape': string;
  '--slide-card-width-mobile-portrait': string;
};

type SlideCardVisualStyle = CSSProperties & {
  '--card-active-rotate': string;
  '--card-active-y': string;
  '--card-leaving-rotate': string;
  '--card-leaving-y': string;
  '--card-hover-rotate': string;
  '--card-hover-y': string;
  '--card-rotate': string;
  '--card-y': string;
};

const getAspectStyle = (photo: Photo): CSSProperties => {
  const aspectRatio = getSafeAspectRatio(photo);

  return {
    aspectRatio: `${aspectRatio}`,
  };
};

const getSlideCardAspectStyle = (photo: Photo): SlideCardAspectStyle => {
  const aspectRatio = getSafeAspectRatio(photo);
  const formatSize = (value: number) => value.toFixed(2);

  return {
    ...getAspectStyle(photo),
    '--slide-card-width-default': `clamp(${formatSize(
      250 * aspectRatio,
    )}px, ${formatSize(57 * aspectRatio)}vh, ${formatSize(
      520 * aspectRatio,
    )}px)`,
    '--slide-card-width-desktop-portrait': `min(${formatSize(
      56 * aspectRatio,
    )}vh, ${formatSize(680 * aspectRatio)}px)`,
    '--slide-card-width-landscape': `min(${formatSize(
      72 * aspectRatio,
    )}svh, ${formatSize(360 * aspectRatio)}px)`,
    '--slide-card-width-mobile-portrait': `min(${formatSize(
      108 * aspectRatio,
    )}vw, ${formatSize(420 * aspectRatio)}px)`,
    width: 'var(--slide-card-width-default)',
  };
};

const createPoseSeed = (photo: Photo, index: number) => {
  const source = `${photo.id}-${index}`;
  let hash = 0;

  for (
    let indexInSource = 0;
    indexInSource < source.length;
    indexInSource += 1
  ) {
    hash = (hash * 31 + source.charCodeAt(indexInSource)) % 1000003;
  }

  return hash;
};

const getSeedUnit = (seed: number, salt: number) => {
  const mixed = Math.sin((seed + 1) * (salt + 3) * 12.9898) * 43758.5453;

  return mixed - Math.floor(mixed);
};

const orderPhotos = ({
  category,
  photos,
  seed,
  sortMode,
}: {
  category: string;
  photos: Photo[];
  seed: number;
  sortMode: PhotoSortMode | '';
}) => {
  const filteredPhotos = category
    ? photos.filter((photo) => photo.category === category)
    : photos;

  if (sortMode === 'random') {
    return shufflePhotos(filteredPhotos, seed);
  }

  return filteredPhotos;
};

const findInitialIndex = (photos: Photo[], id?: string) => {
  if (!id) {
    return 0;
  }

  const index = photos.findIndex((photo) => photo.id === id);

  return index >= 0 ? index : 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const easeOutQuint = (value: number) => 1 - (1 - value) ** 5;

const formatDate = (value: string) => {
  const normalized = value.trim();

  if (!normalized) {
    return '';
  }

  const match = normalized.match(
    /^(\d{4})[-:/](\d{2})[-:/](\d{2})(?:[ T](\d{2}):(\d{2}))?/,
  );

  if (!match) {
    return normalized;
  }

  const date = `${match[1]}.${match[2]}.${match[3]}`;

  if (!match[4] || !match[5]) {
    return date;
  }

  return `${date} / ${match[4]}:${match[5]}`;
};

const getCameraLine = (photo: Photo) =>
  [formatCameraName(photo.camera), photo.lens].filter(Boolean).join(' · ');

const getExifLine = (photo: Photo) =>
  [photo.focalLength, photo.aperture, photo.shutterSpeed, formatIso(photo.iso)]
    .filter(Boolean)
    .join(' · ');

const getCardStyle = ({
  active,
  index,
  photo,
}: {
  active: boolean;
  index: number;
  photo: Photo;
}): SlideCardVisualStyle => {
  const seed = createPoseSeed(photo, index);
  const rotate = -4 + getSeedUnit(seed, 1) * 8;

  return {
    '--card-active-rotate': `${(rotate * 0.24).toFixed(2)}deg`,
    '--card-active-y': '0px',
    '--card-leaving-rotate': `${(rotate * 0.16).toFixed(2)}deg`,
    '--card-leaving-y': '0px',
    '--card-hover-rotate': `${(rotate * 0.12).toFixed(2)}deg`,
    '--card-hover-y': '0px',
    '--card-rotate': `${rotate.toFixed(2)}deg`,
    '--card-y': '0px',
    opacity: active ? 1 : 0.78,
    zIndex: active ? 20 : 1,
  };
};

export const getServerSideProps: GetServerSideProps<SlidePageProps> = async ({
  query,
  res,
}) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const { fetchManagedPhotoSet } = await import(
      '@/lib/server/photoCmsManifest'
    );
    const { photos: allPhotos } = await fetchManagedPhotoSet({
      cacheBust: true,
    });
    const category = getQueryCategory(query.category);
    const sortMode = getQuerySortMode(query.sort);
    const randomSeed = getQuerySeed(query.seed);
    const photos = orderPhotos({
      category,
      photos: allPhotos,
      seed: randomSeed,
      sortMode,
    });

    return {
      props: {
        category,
        initialIndex: findInitialIndex(photos, getQueryId(query.id)),
        loadError: '',
        photos,
        randomSeed,
        sortMode,
      },
    };
  } catch (error) {
    return {
      props: {
        category: getQueryCategory(query.category),
        initialIndex: 0,
        loadError:
          error instanceof Error
            ? error.message
            : 'Could not load remote photo data.',
        photos: [],
        randomSeed: getQuerySeed(query.seed),
        sortMode: getQuerySortMode(query.sort),
      },
    };
  }
};

const StatusPanel = ({
  message,
  title,
}: {
  message: string;
  title: string;
}) => (
  <main className="grid min-h-screen place-items-center bg-[#050403] px-5 text-center text-stone-100">
    <Meta title={`Slide View | ${AppConfig.site_name}`} description={message} />
    <div className="max-w-md">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-stone-500">{message}</p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-stone-300 transition hover:bg-white/10 hover:text-white"
      >
        Back to Proof View
      </Link>
    </div>
  </main>
);

const PhotoInfoOverlay = ({
  closing,
  flipped,
  onClose,
  photo,
}: {
  closing: boolean;
  flipped: boolean;
  onClose: () => void;
  photo: Photo;
}) => {
  const date = formatDate(getDisplayDate(photo));
  const cameraLine = getCameraLine(photo);
  const exifLine = getExifLine(photo);
  const description = photo.description.trim();
  const title = getPhotoTitle(photo);
  const infoLines = [
    title,
    photo.category,
    date,
    cameraLine,
    exifLine,
    description,
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photo information`}
      className={`flip-overlay bg-black/68 fixed inset-0 z-[240] grid place-items-center px-4 py-5 backdrop-blur-[2px] ${
        closing ? 'is-closing' : ''
      }`}
      onClick={onClose}
    >
      <div
        className={`flip-overlay-card relative h-[min(78vh,680px)] max-h-[82vh] max-w-[92vw] [perspective:1400px] max-[900px]:landscape:h-[min(82vh,430px)] ${
          flipped ? 'is-flipped' : ''
        } ${closing ? 'is-closing' : ''}`}
        style={getAspectStyle(photo)}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Back to photo"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-stone-100 ring-1 ring-white/15 transition hover:bg-white/15"
        >
          Back
        </button>

        <div
          className="flip-card-inner relative size-full rounded-[22px] transition-transform duration-[720ms] ease-[cubic-bezier(0.2,0.84,0.18,1)] [transform-style:preserve-3d]"
          style={{
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-[22px] bg-[#18130f] shadow-[0_34px_120px_rgba(0,0,0,0.82)] ring-1 ring-white/10 [backface-visibility:hidden]">
            <img
              src={photo.src}
              alt={getPhotoTitle(photo)}
              loading="eager"
              decoding="async"
              draggable={false}
              className="size-full select-none object-cover"
            />
            <span className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[inset_0_0_80px_rgba(0,0,0,0.3)]" />
          </div>

          <div
            className="flip-info-face border-white/12 absolute inset-0 flex rounded-[22px] border bg-[linear-gradient(145deg,#1b1713_0%,#0d0b0a_54%,#18120f_100%)] p-6 text-center shadow-[0_34px_120px_rgba(0,0,0,0.86)] ring-1 ring-[#c6ded7]/20 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-8 max-[900px]:landscape:p-5"
            onClick={onClose}
          >
            <div className="m-auto flex max-h-full w-full max-w-[520px] flex-col items-center justify-center gap-3 overflow-hidden text-stone-100 max-[900px]:landscape:gap-2">
              {infoLines.length > 0 ? (
                <>
                  {photo.category ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a9c2bb] max-[900px]:landscape:text-[10px]">
                      {photo.category}
                    </p>
                  ) : null}
                  {date ? (
                    <p className="text-sm text-stone-300 max-[900px]:landscape:text-xs">
                      {date}
                    </p>
                  ) : null}
                  <h2 className="text-2xl font-semibold leading-tight text-stone-100 max-[900px]:landscape:text-lg">
                    {title}
                  </h2>
                  {cameraLine ? (
                    <p className="text-base font-medium leading-6 text-stone-100 max-[900px]:landscape:text-sm">
                      {cameraLine}
                    </p>
                  ) : null}
                  {exifLine ? (
                    <p className="text-sm leading-6 text-stone-400 max-[900px]:landscape:text-xs max-[900px]:landscape:leading-5">
                      {exifLine}
                    </p>
                  ) : null}
                  {description ? (
                    <p className="line-clamp-5 pt-2 text-sm leading-7 text-stone-200 max-[900px]:landscape:line-clamp-3 max-[900px]:landscape:text-xs max-[900px]:landscape:leading-5">
                      {description}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-stone-300">{getPhotoTitle(photo)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SlidePage: NextPage<SlidePageProps> = ({
  category,
  initialIndex,
  loadError,
  photos,
  randomSeed,
  sortMode,
}) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isInfoFlipped, setIsInfoFlipped] = useState(false);
  const [isInfoClosing, setIsInfoClosing] = useState(false);
  const [showLandscapePrompt, setShowLandscapePrompt] = useState(false);
  const [landscapePromptDismissed, setLandscapePromptDismissed] =
    useState(false);
  const [isSlideChromeVisible, setIsSlideChromeVisible] = useState(true);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const initialScrollTimer = useRef<number>();
  const openFlipTimer = useRef<number>();
  const closeFlipTimer = useRef<number>();
  const chromeHideTimer = useRef<number>();
  const scrollFrame = useRef<number>();
  const scrollAnimationFrame = useRef<number>();
  const wheelDelta = useRef(0);
  const wheelFrame = useRef<number>();
  const flipLocked = useRef(false);
  const fullscreenRequestTried = useRef(false);
  const programmaticIndex = useRef<number | null>(null);
  const pendingPointer = useRef<PendingPointer | null>(null);
  const router = useRouter();
  const activePhoto = photos[activeIndex];

  const scheduleSlideChromeIdle = useCallback(() => {
    window.clearTimeout(chromeHideTimer.current);
    chromeHideTimer.current = window.setTimeout(() => {
      setIsSlideChromeVisible(false);
    }, SLIDE_CHROME_IDLE_DELAY_MS);
  }, []);

  const revealSlideChrome = useCallback(() => {
    setIsSlideChromeVisible(true);
    scheduleSlideChromeIdle();
  }, [scheduleSlideChromeIdle]);

  const requestFullscreenFromSlideGesture = useCallback(() => {
    if (
      fullscreenRequestTried.current ||
      typeof document === 'undefined' ||
      document.fullscreenElement ||
      !isSlideMobileViewport() ||
      isPortraitViewport()
    ) {
      return;
    }

    fullscreenRequestTried.current = true;
    requestSlideFullscreen().catch(() => undefined);
  }, []);

  const handleSlideInteractionStart = useCallback(() => {
    revealSlideChrome();
    requestFullscreenFromSlideGesture();
  }, [requestFullscreenFromSlideGesture, revealSlideChrome]);

  const refreshLandscapePrompt = useCallback(() => {
    setShowLandscapePrompt(
      !landscapePromptDismissed &&
        isSlideMobileViewport() &&
        isPortraitViewport(),
    );
  }, [landscapePromptDismissed]);

  const requestLandscapeMode = useCallback(async () => {
    const result = await requestSlideLandscape();
    const stillNeedsLandscape = result === 'failed' || result === 'unsupported';

    setShowLandscapePrompt(
      !landscapePromptDismissed &&
        stillNeedsLandscape &&
        isSlideMobileViewport() &&
        isPortraitViewport(),
    );
  }, [landscapePromptDismissed]);

  useEffect(() => {
    const { body, documentElement: root } = document;
    const previousBodyStyles = {
      height: body.style.height,
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    };
    const previousRootStyles = {
      height: root.style.height,
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };
    let touchStartX = 0;
    let touchStartY = 0;

    const syncViewportHeight = () => {
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;

      root.style.setProperty('--slide-viewport-height', `${viewportHeight}px`);
      body.style.height = `${viewportHeight}px`;
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches.item(0);

      if (!touch) {
        return;
      }

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches.item(0);

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        event.preventDefault();
      }
    };

    window.scrollTo(0, 0);
    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.left = '0';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.right = '0';
    body.style.top = '0';
    body.style.width = '100%';
    syncViewportHeight();

    window.visualViewport?.addEventListener('resize', syncViewportHeight);
    window.visualViewport?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);
    document.addEventListener('touchstart', handleTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      capture: true,
      passive: false,
    });

    return () => {
      window.visualViewport?.removeEventListener('resize', syncViewportHeight);
      window.visualViewport?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      root.style.removeProperty('--slide-viewport-height');
      Object.assign(root.style, previousRootStyles);
      Object.assign(body.style, previousBodyStyles);
    };
  }, []);

  const animateTrackTo = useCallback(
    (left: number, duration: number, onComplete?: () => void) => {
      const track = trackRef.current;

      if (!track) {
        onComplete?.();
        return;
      }

      window.cancelAnimationFrame(scrollAnimationFrame.current ?? 0);

      const startLeft = track.scrollLeft;
      const delta = left - startLeft;
      const startedAt = window.performance.now();

      if (Math.abs(delta) < 0.5 || duration <= 0) {
        track.scrollLeft = left;
        onComplete?.();
        return;
      }

      const step = (now: number) => {
        const progress = clamp((now - startedAt) / duration, 0, 1);
        track.scrollLeft = startLeft + delta * easeOutQuint(progress);

        if (progress < 1) {
          scrollAnimationFrame.current = window.requestAnimationFrame(step);
          return;
        }

        track.scrollLeft = left;
        scrollAnimationFrame.current = undefined;
        onComplete?.();
      };

      scrollAnimationFrame.current = window.requestAnimationFrame(step);
    },
    [],
  );

  const scrollToCard = useCallback(
    (index: number, behavior: ScrollBehavior, onComplete?: () => void) => {
      const track = trackRef.current;
      const card = cardRefs.current[index];

      if (!track || !card) {
        onComplete?.();
        return;
      }

      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const targetLeft = cardCenter - track.clientWidth / 2;
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const clampedTarget = clamp(targetLeft, 0, maxScrollLeft);

      if (behavior === 'smooth') {
        programmaticIndex.current = index;
        animateTrackTo(clampedTarget, SLIDE_SCROLL_DURATION_MS, () => {
          programmaticIndex.current = null;
          onComplete?.();
        });
        return;
      }

      programmaticIndex.current = null;
      window.cancelAnimationFrame(scrollAnimationFrame.current ?? 0);
      track.scrollLeft = clampedTarget;
      onComplete?.();
    },
    [animateTrackTo],
  );

  const isCardNearCenter = useCallback((index: number) => {
    const track = trackRef.current;
    const card = cardRefs.current[index];

    if (!track || !card) {
      return true;
    }

    const viewportCenter = track.scrollLeft + track.clientWidth / 2;
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;

    return Math.abs(cardCenter - viewportCenter) < track.clientWidth * 0.08;
  }, []);

  const openPhotoInfo = useCallback(
    (index: number) => {
      if (flipLocked.current) {
        return;
      }

      window.clearTimeout(openFlipTimer.current);
      window.clearTimeout(closeFlipTimer.current);
      flipLocked.current = true;
      setIsInfoFlipped(false);
      setIsInfoClosing(false);
      setSelectedIndex(null);
      setActiveIndex(index);

      const nearCenter = isCardNearCenter(index);
      scrollToCard(index, nearCenter ? 'auto' : 'smooth');

      openFlipTimer.current = window.setTimeout(
        () => {
          setSelectedIndex(index);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              setIsInfoFlipped(true);
              window.setTimeout(() => {
                flipLocked.current = false;
              }, FLIP_DURATION_MS);
            });
          });
        },
        nearCenter ? 40 : OPEN_FLIP_DELAY_MS,
      );
    },
    [isCardNearCenter, scrollToCard],
  );

  const closePhotoInfo = useCallback(() => {
    if (flipLocked.current || selectedIndex === null) {
      return;
    }

    window.clearTimeout(openFlipTimer.current);
    window.clearTimeout(closeFlipTimer.current);
    flipLocked.current = true;
    setIsInfoClosing(true);
    setIsInfoFlipped(false);

    closeFlipTimer.current = window.setTimeout(() => {
      setSelectedIndex(null);
      setIsInfoClosing(false);
      flipLocked.current = false;
    }, FLIP_CLOSE_DURATION_MS);
  }, [selectedIndex]);

  const updateActiveFromScroll = useCallback(() => {
    const track = trackRef.current;

    if (!track || photos.length === 0 || programmaticIndex.current !== null) {
      return;
    }

    const viewportCenter = track.scrollLeft + track.clientWidth / 2;
    const metrics = cardRefs.current
      .map<CardMetrics | null>((card, index) => {
        if (!card) {
          return null;
        }

        return {
          center: card.offsetLeft + card.offsetWidth / 2,
          index,
        };
      })
      .filter((item): item is CardMetrics => item !== null);

    const closest = metrics.reduce<CardMetrics | null>((current, item) => {
      if (!current) {
        return item;
      }

      return Math.abs(item.center - viewportCenter) <
        Math.abs(current.center - viewportCenter)
        ? item
        : current;
    }, null);

    if (closest) {
      setLeavingIndex(null);
      setActiveIndex((currentIndex) =>
        closest.index === currentIndex ? currentIndex : closest.index,
      );
    }
  }, [photos.length]);

  const scheduleActiveUpdate = useCallback(() => {
    if (scrollFrame.current) {
      return;
    }

    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = undefined;
      updateActiveFromScroll();
    });
  }, [updateActiveFromScroll]);

  const flushWheelScroll = useCallback(() => {
    const track = trackRef.current;

    if (!track) {
      wheelDelta.current = 0;
      wheelFrame.current = undefined;
      return;
    }

    const nextScrollLeft = clamp(
      track.scrollLeft + wheelDelta.current,
      0,
      track.scrollWidth - track.clientWidth,
    );

    programmaticIndex.current = null;
    setLeavingIndex(null);
    animateTrackTo(nextScrollLeft, WHEEL_SCROLL_DURATION_MS);
    wheelDelta.current = 0;
    wheelFrame.current = undefined;
    scheduleActiveUpdate();
  }, [animateTrackTo, scheduleActiveUpdate]);

  const queueHorizontalScroll = useCallback(
    (delta: number, deltaMode: number) => {
      const track = trackRef.current;

      if (!track || delta === 0) {
        return;
      }

      const normalizedDelta = deltaMode === 1 ? delta * 18 : delta;
      wheelDelta.current = clamp(
        wheelDelta.current + normalizedDelta,
        -track.clientWidth * 0.72,
        track.clientWidth * 0.72,
      );

      if (!wheelFrame.current) {
        wheelFrame.current = window.requestAnimationFrame(flushWheelScroll);
      }
    },
    [flushWheelScroll],
  );

  const handleCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
      pendingPointer.current = {
        index,
        scrollLeft: trackRef.current?.scrollLeft ?? 0,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [],
  );

  const handleCardPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
      const pointer = pendingPointer.current;

      pendingPointer.current = null;

      if (!pointer || pointer.index !== index) {
        return;
      }

      const movement = Math.hypot(
        event.clientX - pointer.x,
        event.clientY - pointer.y,
      );
      const scrollMovement = Math.abs(
        (trackRef.current?.scrollLeft ?? pointer.scrollLeft) -
          pointer.scrollLeft,
      );

      if (
        movement > CLICK_MOVEMENT_LIMIT_PX ||
        scrollMovement > CLICK_MOVEMENT_LIMIT_PX
      ) {
        return;
      }

      openPhotoInfo(index);
    },
    [openPhotoInfo],
  );

  const goToSlide = useCallback(
    (offset: number) => {
      if (photos.length === 0) {
        return;
      }

      const nextIndex = clamp(activeIndex + offset, 0, photos.length - 1);

      if (nextIndex === activeIndex) {
        return;
      }

      setLeavingIndex(activeIndex);
      setActiveIndex(nextIndex);
      scrollToCard(nextIndex, 'smooth', () => {
        setLeavingIndex(null);
      });
    },
    [activeIndex, photos.length, scrollToCard],
  );

  useEffect(() => {
    window.clearTimeout(initialScrollTimer.current);
    window.clearTimeout(openFlipTimer.current);
    window.clearTimeout(closeFlipTimer.current);
    flipLocked.current = false;
    setLeavingIndex(null);
    setSelectedIndex(null);
    setIsInfoFlipped(false);
    setIsInfoClosing(false);
    setActiveIndex(initialIndex);
    initialScrollTimer.current = window.setTimeout(() => {
      scrollToCard(initialIndex, 'auto');
    }, SCROLL_TO_CENTER_DELAY_MS);
  }, [initialIndex, scrollToCard]);

  useEffect(() => {
    const track = trackRef.current;

    if (!track) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (delta === 0) {
        return;
      }

      event.preventDefault();
      revealSlideChrome();
      queueHorizontalScroll(delta, event.deltaMode);
    };

    track.addEventListener('wheel', handleWheel, {
      passive: false,
    });
    track.addEventListener('scroll', scheduleActiveUpdate, {
      passive: true,
    });

    return () => {
      window.cancelAnimationFrame(wheelFrame.current ?? 0);
      track.removeEventListener('wheel', handleWheel);
      track.removeEventListener('scroll', scheduleActiveUpdate);
    };
  }, [queueHorizontalScroll, revealSlideChrome, scheduleActiveUpdate]);

  useEffect(() => {
    revealSlideChrome();
  }, [activeIndex, revealSlideChrome]);

  useEffect(() => {
    if (!isSlideChromeVisible) {
      return undefined;
    }

    scheduleSlideChromeIdle();

    return () => {
      window.clearTimeout(chromeHideTimer.current);
    };
  }, [activeIndex, isSlideChromeVisible, scheduleSlideChromeIdle]);

  useEffect(() => {
    refreshLandscapePrompt();

    window.addEventListener('resize', refreshLandscapePrompt);
    window.addEventListener('orientationchange', refreshLandscapePrompt);

    return () => {
      window.removeEventListener('resize', refreshLandscapePrompt);
      window.removeEventListener('orientationchange', refreshLandscapePrompt);
    };
  }, [refreshLandscapePrompt]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        goToSlide(-1);
      }

      if (event.key === 'ArrowRight') {
        goToSlide(1);
      }

      if (event.key === 'Escape') {
        closePhotoInfo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePhotoInfo, goToSlide]);

  useEffect(
    () => () => {
      window.clearTimeout(initialScrollTimer.current);
      window.clearTimeout(openFlipTimer.current);
      window.clearTimeout(closeFlipTimer.current);
      window.clearTimeout(chromeHideTimer.current);
      window.cancelAnimationFrame(scrollFrame.current ?? 0);
      window.cancelAnimationFrame(wheelFrame.current ?? 0);
      window.cancelAnimationFrame(scrollAnimationFrame.current ?? 0);
    },
    [],
  );

  const visibleTitle = activePhoto ? getPhotoTitle(activePhoto) : 'Slide View';
  const activeDescription = activePhoto?.description || AppConfig.description;
  const activeDate = activePhoto ? formatDate(getDisplayDate(activePhoto)) : '';
  const selectedPhoto =
    selectedIndex !== null ? photos[selectedIndex] : undefined;

  const proofHref = useMemo(() => {
    const params = new URLSearchParams();

    if (sortMode) {
      params.set('sort', sortMode);
    }

    if (category) {
      params.set('category', category);
    }

    if (sortMode === 'random') {
      params.set('seed', String(randomSeed));
    }

    const query = params.toString();

    return query ? `/?${query}` : '/';
  }, [category, randomSeed, sortMode]);

  const currentSlideHref = useMemo(() => {
    const fallbackSlideHref = proofHref.replace(/^\//, '/slide');
    const slideHref = router.asPath.startsWith('/slide')
      ? router.asPath
      : fallbackSlideHref;

    if (!activePhoto) {
      return slideHref;
    }

    const [pathname, rawQuery = ''] = slideHref.split('?');
    const [queryString, hash = ''] = rawQuery.split('#');
    const params = new URLSearchParams(queryString);

    params.set('id', activePhoto.id);

    const query = params.toString();
    const hashSuffix = hash ? `#${hash}` : '';

    return `${pathname}${query ? `?${query}` : ''}${hashSuffix}`;
  }, [activePhoto, proofHref, router.asPath]);

  const activePhotoDetailHref = activePhoto
    ? buildPhotoDetailHref(activePhoto.id, currentSlideHref)
    : '/';

  if (loadError) {
    return <StatusPanel title="Photos are not available" message={loadError} />;
  }

  if (!activePhoto || photos.length === 0) {
    return (
      <StatusPanel
        title="No photos here yet"
        message="Add photos to photos.json before using Slide View."
      />
    );
  }

  return (
    <main
      className={`slide-view fixed inset-0 h-[100svh] w-screen overflow-hidden bg-[#050403] text-stone-100 antialiased ${
        isSlideChromeVisible ? 'slide-chrome-visible' : 'slide-chrome-resting'
      }`}
      onPointerDown={handleSlideInteractionStart}
      onTouchStart={handleSlideInteractionStart}
    >
      <Meta
        title={`${visibleTitle} | Slide View | ${AppConfig.site_name}`}
        description={activeDescription}
      />
      <Head>
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"
          key="viewport"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="full-screen" content="yes" />
        <meta name="browsermode" content="application" />
        <meta name="screen-orientation" content="landscape" />
        <meta name="x5-fullscreen" content="true" />
        <meta name="x5-page-mode" content="app" />
        <meta name="x5-orientation" content="landscape" />
      </Head>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-[120] px-3 pb-10 pt-3 sm:px-5 sm:pt-5">
        <div className="slide-header-row mx-auto flex max-w-[1440px] items-end justify-between gap-3">
          <div className="slide-header-cluster flex items-end gap-3">
            <div className="slide-mode-switcher bg-black/42 pointer-events-auto inline-flex rounded-full p-1 text-sm font-medium text-stone-400 ring-1 ring-white/10 backdrop-blur">
              <Link
                href={proofHref}
                className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white"
              >
                Proof View
              </Link>
              <span className="rounded-full bg-[#9db6b0] px-4 py-2 text-[#17110e]">
                Slide View
              </span>
            </div>
            <div className="slide-header-controls slide-controls bg-black/42 pointer-events-auto hidden items-center rounded-full p-1 text-sm font-medium text-stone-400 ring-1 ring-white/10 backdrop-blur">
              <button
                type="button"
                onClick={() => openPhotoInfo(activeIndex)}
                className="slide-info-button rounded-full bg-[#9db6b0] px-4 py-2 text-[#17110e] transition hover:bg-[#b7cec8]"
              >
                Info
              </button>
              <Link
                href={activePhotoDetailHref}
                className="slide-detail-link rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white"
              >
                Detail
              </Link>
            </div>
          </div>
          <div className="slide-progress-track slide-progress-track-inline hidden h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="slide-progress block h-full rounded-full bg-[#9db6b0]"
              style={{
                width: `${((activeIndex + 1) / photos.length) * 100}%`,
              }}
            />
          </div>
          <div className="slide-count-pill rounded-full px-4 py-2 text-sm font-medium tabular-nums text-stone-400 max-[900px]:landscape:text-xs">
            {activeIndex + 1} / {photos.length}
          </div>
        </div>
        <div className="slide-progress-track slide-progress-track-stack mx-auto mt-3 h-1 max-w-[1440px] overflow-hidden rounded-full bg-white/10 max-[900px]:landscape:mt-0.5 max-[900px]:landscape:h-0.5 max-[900px]:landscape:w-[46vw] max-[900px]:landscape:max-w-[360px] max-[900px]:landscape:bg-white/10 max-[900px]:landscape:opacity-60">
          <span
            className="slide-progress block h-full rounded-full bg-[#9db6b0]"
            style={{
              width: `${((activeIndex + 1) / photos.length) * 100}%`,
            }}
          />
        </div>
      </header>

      <section className="slide-stage relative z-10 flex items-center">
        <div
          ref={trackRef}
          className="slide-track w-full overflow-x-auto overflow-y-hidden px-0"
        >
          <div
            ref={railRef}
            className="slide-rail flex h-full items-center py-0"
          >
            <span aria-hidden="true" className="slide-edge-spacer" />
            {photos.map((photo, index) => {
              const distance = index - activeIndex;
              const isActive = index === activeIndex;
              const isLeaving = index === leavingIndex;
              const isStaged = isActive || isLeaving;
              const imageSource = photo.thumbnail;
              let cardState = 'idle';

              if (isActive) {
                cardState = 'active';
              } else if (isLeaving) {
                cardState = 'leaving';
              }

              return (
                <div
                  key={photo.id}
                  ref={(element) => {
                    cardRefs.current[index] = element;
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${getPhotoTitle(photo)} photo card`}
                  onPointerDown={(event) => handleCardPointerDown(event, index)}
                  onPointerUp={(event) => handleCardPointerUp(event, index)}
                  onPointerCancel={() => {
                    pendingPointer.current = null;
                  }}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPhotoInfo(index);
                    }
                  }}
                  className={`slide-card group relative flex shrink-0 cursor-pointer items-center justify-center outline-none first:ml-0 hover:z-30 focus-visible:ring-2 focus-visible:ring-white/35 ${
                    isActive ? 'slide-card-active' : ''
                  } ${isLeaving ? 'slide-card-leaving' : ''}`}
                  data-card-state={cardState}
                  style={{
                    ...getCardStyle({
                      active: isStaged,
                      index,
                      photo,
                    }),
                    height: 'var(--slide-card-height)',
                    marginLeft:
                      index === 0 ? undefined : 'var(--slide-card-overlap)',
                    ...getSlideCardAspectStyle(photo),
                  }}
                >
                  <div className="slide-card-inner relative size-full rounded-[22px]">
                    <div className="slide-photo-face absolute inset-0 z-10 overflow-hidden rounded-[22px] bg-[#18130f] shadow-[0_24px_70px_rgba(0,0,0,0.58)] ring-1 ring-white/10 [backface-visibility:hidden]">
                      <img
                        src={imageSource}
                        alt={getPhotoTitle(photo)}
                        loading={Math.abs(distance) <= 6 ? 'eager' : 'lazy'}
                        decoding="async"
                        draggable={false}
                        className="size-full select-none object-cover"
                      />
                      <span className="from-black/32 to-white/4 pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-t via-transparent opacity-70" />
                      {isActive ? (
                        <span className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[0_0_42px_rgba(157,182,176,0.18)] ring-1 ring-[#c6ded7]/35" />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <span aria-hidden="true" className="slide-edge-spacer" />
          </div>
        </div>
      </section>

      <aside className="via-[#050403]/58 pointer-events-none fixed inset-x-0 bottom-0 z-[110] bg-gradient-to-t from-[#050403] to-transparent px-4 pb-5 pt-24 sm:px-8 sm:pb-8 max-[900px]:landscape:pb-3 max-[900px]:landscape:pt-16">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div key={activePhoto.id} className="slide-caption">
            <p className="slide-caption-category text-xs font-medium uppercase tracking-[0.22em] text-[#8ea6a2]">
              {activePhoto.category}
            </p>
            <h1 className="mt-2 max-w-3xl text-lg font-semibold leading-tight text-stone-100 sm:text-2xl max-[900px]:landscape:mt-0 max-[900px]:landscape:text-base">
              {visibleTitle}
            </h1>
            {activeDate ? (
              <p className="mt-2 text-sm text-stone-300 max-[900px]:landscape:mt-1 max-[900px]:landscape:text-xs">
                {activeDate}
              </p>
            ) : null}
          </div>

          <div className="slide-bottom-controls slide-controls bg-black/42 pointer-events-auto inline-flex items-center self-start rounded-full p-1 text-sm font-medium text-stone-400 ring-1 ring-white/10 backdrop-blur sm:self-end">
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => goToSlide(-1)}
              className="grid size-9 place-items-center rounded-full transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              disabled={activeIndex === 0}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              onClick={() => openPhotoInfo(activeIndex)}
              className="slide-info-button rounded-full bg-[#9db6b0] px-4 py-2 text-[#17110e] transition hover:bg-[#b7cec8]"
            >
              Info
            </button>
            <Link
              href={activePhotoDetailHref}
              className="slide-detail-link rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white"
            >
              Detail
            </Link>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => goToSlide(1)}
              className="grid size-9 place-items-center rounded-full transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              disabled={activeIndex === photos.length - 1}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </aside>

      {selectedPhoto ? (
        <PhotoInfoOverlay
          photo={selectedPhoto}
          closing={isInfoClosing}
          flipped={isInfoFlipped}
          onClose={closePhotoInfo}
        />
      ) : null}

      {showLandscapePrompt ? (
        <div className="bg-[#050403]/92 fixed inset-0 z-[260] grid place-items-center px-6 text-center text-stone-100 backdrop-blur">
          <div className="max-w-[280px]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9db6b0]">
              Slide View
            </p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight">
              横屏观看
            </h2>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={requestLandscapeMode}
                className="rounded-full bg-[#9db6b0] px-5 py-2.5 text-sm font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
              >
                横屏显示
              </button>
              <button
                type="button"
                onClick={() => {
                  setLandscapePromptDismissed(true);
                  setShowLandscapePrompt(false);
                }}
                className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-stone-200 ring-1 ring-white/10 transition hover:bg-white/15"
              >
                继续
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .slide-view {
          --slide-card-height: clamp(250px, 57vh, 520px);
          --slide-card-overlap: 10px;
          --slide-edge-inset: clamp(10px, 1.6vmin, 18px);
          --slide-edge-gap: calc(
            var(--slide-edge-inset) + env(safe-area-inset-left, 0px)
          );
          --slide-edge-gap-right: calc(
            var(--slide-edge-inset) + env(safe-area-inset-right, 0px)
          );
          --slide-edge-gap-top: calc(
            var(--slide-edge-inset) + env(safe-area-inset-top, 0px)
          );
          --slide-edge-gap-bottom: calc(
            var(--slide-edge-inset) + env(safe-area-inset-bottom, 0px)
          );
          --slide-top-control-gap: clamp(10px, 1.25vw, 18px);
          height: var(--slide-viewport-height, 100svh);
          max-height: var(--slide-viewport-height, 100svh);
          min-height: var(--slide-viewport-height, 100svh);
          overflow: hidden;
          overscroll-behavior: none;
          touch-action: pan-x;
        }

        @supports (height: 100dvh) {
          .slide-view {
            height: var(--slide-viewport-height, 100dvh);
            max-height: var(--slide-viewport-height, 100dvh);
            min-height: var(--slide-viewport-height, 100dvh);
          }
        }

        html:has(.slide-view),
        body:has(.slide-view),
        #__next:has(.slide-view) {
          height: var(--slide-viewport-height, 100svh);
          max-height: var(--slide-viewport-height, 100svh);
          min-height: var(--slide-viewport-height, 100svh);
          overflow: hidden;
          overscroll-behavior: none;
          position: fixed;
          inset: 0;
          width: 100%;
        }

        .slide-stage {
          height: var(--slide-viewport-height, 100svh);
          inset: 0;
          position: fixed;
          width: 100%;
        }

        .slide-track {
          height: var(--slide-viewport-height, 100svh) !important;
          overscroll-behavior-x: contain;
          overscroll-behavior-y: none;
          scrollbar-width: none;
          touch-action: pan-x;
        }

        .slide-track::-webkit-scrollbar {
          display: none;
        }

        .slide-rail {
          min-width: max-content;
          width: max-content;
        }

        .slide-edge-spacer {
          flex: 0 0 50vw;
          min-width: 50vw;
          width: 50vw;
        }

        .slide-progress {
          transform-origin: left center;
          transition: width 680ms cubic-bezier(0.16, 1, 0.3, 1);
          will-change: width;
        }

        .slide-caption {
          animation: slide-caption-in 540ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .slide-controls {
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        .slide-controls > button[aria-label] {
          display: none;
        }

        .slide-count-pill {
          background: rgba(255, 255, 255, 0.05) !important;
          bottom: var(--slide-edge-gap-bottom) !important;
          box-shadow: none !important;
          color: rgb(168, 162, 158) !important;
          line-height: 1.25rem;
          outline: 1px solid rgba(255, 255, 255, 0.07);
          outline-offset: 0;
          position: fixed !important;
          right: var(--slide-edge-gap-right) !important;
          top: auto !important;
          transition: opacity 260ms ease;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          z-index: 240;
        }

        .slide-card {
          transform-origin: center center;
          transform: translate3d(0, var(--card-y), 0)
            rotateZ(var(--card-rotate)) scale(1);
          transition:
            transform 680ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity 520ms cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform, opacity;
        }

        .slide-card:hover {
          transform: translate3d(0, var(--card-hover-y), 0)
            rotateZ(var(--card-hover-rotate)) scale(1.15) !important;
          opacity: 1 !important;
          z-index: 30 !important;
        }

        .slide-card-active {
          transform: translate3d(0, var(--card-active-y), 0)
            rotateZ(var(--card-active-rotate)) scale(1.1) !important;
          opacity: 1 !important;
          z-index: 20 !important;
        }

        .slide-card-active .slide-card-inner {
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.64),
            0 0 0 1px rgba(198, 222, 215, 0.24);
        }

        .slide-card-leaving {
          pointer-events: none;
          transform: translate3d(0, var(--card-leaving-y), 0)
            rotateZ(var(--card-leaving-rotate)) scale(1.075) !important;
          opacity: 0.94 !important;
          z-index: 18 !important;
        }

        .slide-card-leaving .slide-card-inner {
          box-shadow:
            0 22px 68px rgba(0, 0, 0, 0.58),
            0 0 0 1px rgba(198, 222, 215, 0.18);
        }

        .slide-card-active:hover {
          transform: translate3d(0, var(--card-hover-y), 0)
            rotateZ(var(--card-hover-rotate)) scale(1.14) !important;
        }

        .slide-card-inner {
          contain: layout paint;
          transform: translateZ(0);
        }

        .slide-photo-face {
          transform: translateZ(0);
        }

        @media (orientation: portrait) {
          .slide-view > aside > div {
            align-items: flex-end;
            flex-direction: row;
            gap: 12px;
            justify-content: space-between;
          }

          .slide-caption {
            max-width: calc(100% - 124px);
            min-width: 0;
          }

          .slide-controls {
            align-self: flex-end;
          }
        }

        @media (min-width: 901px) and (orientation: portrait) {
          .slide-view {
            --slide-card-height: min(56vh, 680px);
          }

          .slide-card {
            width: var(--slide-card-width-desktop-portrait) !important;
          }

          .slide-view > aside {
            padding-bottom: max(28px, env(safe-area-inset-bottom));
          }
        }

        @media (max-width: 900px) {
          .slide-mode-switcher {
            font-size: 12px;
          }

          .slide-mode-switcher a,
          .slide-mode-switcher span {
            padding: 6px 11px;
          }

          .slide-count-pill {
            font-size: 14px;
            padding: 4px 12px;
          }

          .slide-card {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-rotate)) scale(1);
          }

          .slide-card-active {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-active-rotate))
              scale(1.06) !important;
          }

          .slide-card-leaving {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-leaving-rotate))
              scale(1.03) !important;
          }

          .slide-card:hover,
          .slide-card-active:hover {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-hover-rotate))
              scale(1.06) !important;
          }

          .slide-controls {
            align-self: flex-end;
            gap: 0;
            padding: 4px;
            font-size: 12px;
          }

          .slide-controls > button[aria-label] {
            display: none;
          }

          .slide-info-button,
          .slide-detail-link {
            padding: 6px 11px;
          }
        }

        @media (max-width: 900px) and (orientation: portrait) {
          .slide-view {
            --slide-card-height: min(108vw, 420px);
          }

          .slide-card {
            height: var(--slide-card-height) !important;
            width: var(--slide-card-width-mobile-portrait) !important;
          }

          .slide-view > aside {
            padding: 92px 6px 6px;
          }

          .slide-view > aside > div {
            align-items: flex-end;
            flex-direction: row;
            gap: 10px;
            justify-content: space-between;
          }

          .slide-controls {
            align-self: flex-end;
            flex-shrink: 0;
            order: 0;
          }

          .slide-caption {
            max-width: calc(100% - 122px);
            padding-top: 0;
          }

          .slide-card img {
            object-fit: cover !important;
          }
        }

        @keyframes slide-caption-in {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
            filter: blur(4px);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0);
          }
        }

        .flip-overlay {
          opacity: 1;
          transition:
            opacity 760ms cubic-bezier(0.16, 1, 0.3, 1),
            background-color 760ms cubic-bezier(0.16, 1, 0.3, 1),
            backdrop-filter 760ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .flip-overlay.is-closing {
          background-color: rgba(0, 0, 0, 0.18);
          opacity: 0;
          backdrop-filter: blur(0);
        }

        .flip-overlay-card {
          opacity: 0.98;
          transform: translate3d(0, 8px, 0) scale(1);
          transition:
            opacity 760ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 760ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 760ms cubic-bezier(0.16, 1, 0.3, 1);
          filter: drop-shadow(0 18px 42px rgba(0, 0, 0, 0.42));
        }

        .flip-overlay-card.is-flipped {
          opacity: 1;
          transform: translate3d(0, -4px, 0) scale(1.012);
          filter: drop-shadow(0 34px 90px rgba(0, 0, 0, 0.64));
        }

        .flip-overlay-card.is-closing {
          opacity: 0.82;
          transform: translate3d(0, 4px, 0) scale(1.006);
          filter: drop-shadow(0 22px 56px rgba(0, 0, 0, 0.42));
        }

        .flip-overlay-card.is-closing .flip-card-inner {
          transition-duration: 820ms !important;
          transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1) !important;
        }

        .flip-info-face::before {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 1px;
          border-radius: 21px;
          background: radial-gradient(
              circle at 22% 0%,
              rgba(198, 222, 215, 0.16),
              transparent 34%
            ),
            linear-gradient(
              120deg,
              rgba(255, 255, 255, 0.08),
              transparent 32%,
              rgba(157, 182, 176, 0.05) 68%,
              transparent
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 -36px 90px rgba(0, 0, 0, 0.34);
        }

        .flip-info-face::after {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 0;
          border-radius: 22px;
          opacity: 0.28;
          background-image: linear-gradient(
              rgba(255, 255, 255, 0.025) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.018) 1px,
              transparent 1px
            );
          background-size: 18px 18px;
          mask-image: linear-gradient(
            to bottom,
            transparent,
            black 16%,
            black 82%,
            transparent
          );
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .slide-view {
            --slide-card-height: min(72svh, 360px);
            --slide-card-overlap: 8px;
          }

          .slide-view > header {
            background: transparent !important;
            padding: 6px 16px 4px;
            transition:
              opacity 260ms ease,
              transform 260ms ease;
          }

          .slide-mode-switcher {
            font-size: 10px;
            opacity: 0.92;
            padding: 3px;
          }

          .slide-mode-switcher a,
          .slide-mode-switcher span {
            padding: 4px 9px;
          }

          .slide-count-pill {
            font-size: 12px;
            padding: 4px 10px;
          }

          .slide-progress-track {
            height: 3px !important;
            left: 50%;
            margin-top: 0 !important;
            opacity: 0.96 !important;
            position: fixed;
            top: calc(max(6px, env(safe-area-inset-top)) + 13px);
            transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.26) !important;
            box-shadow: 0 0 18px rgba(157, 182, 176, 0.28);
            z-index: 160;
          }

          .slide-progress {
            background: #c5dfd8;
          }

          .slide-view > aside {
            padding: 46px 12px 9px;
            background: linear-gradient(
              to top,
              rgba(5, 4, 3, 0.86),
              rgba(5, 4, 3, 0.2) 58%,
              transparent
            );
            transition:
              opacity 260ms ease,
              transform 260ms ease;
          }

          .slide-caption {
            max-width: min(33vw, 240px);
          }

          .slide-caption-category {
            font-size: 9px;
            letter-spacing: 0.18em;
            line-height: 1;
            opacity: 0.92;
          }

          .slide-controls {
            align-self: flex-end;
            gap: 0;
            order: 0;
            padding: 3px;
            font-size: 10px;
            transform: none;
            transform-origin: right bottom;
            transition:
              opacity 260ms ease,
              transform 260ms ease,
              background-color 260ms ease;
          }

          .slide-info-button,
          .slide-detail-link {
            padding: 4px 9px;
          }

          .slide-view.slide-chrome-resting > header {
            opacity: 0.48;
            transform: none;
          }

          .slide-view.slide-chrome-resting > aside {
            opacity: 1;
            transform: none;
          }

          .slide-view.slide-chrome-resting .slide-caption {
            opacity: 0.78;
          }

          .slide-view.slide-chrome-resting .slide-controls {
            opacity: 0.48;
            transform: none;
          }

          .slide-card {
            width: var(--slide-card-width-landscape) !important;
          }

          .slide-card:hover {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-hover-rotate))
              scale(1.06) !important;
          }

          .slide-card-active {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-active-rotate))
              scale(1.06) !important;
            opacity: 1 !important;
          }

          .slide-card-leaving {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-leaving-rotate))
              scale(1.03) !important;
          }

          .slide-card-active:hover {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-hover-rotate))
              scale(1.06) !important;
          }
        }

        .slide-view > header {
          background: transparent !important;
          padding: var(--slide-edge-gap-top) var(--slide-edge-gap-right) 0
            var(--slide-edge-gap) !important;
          transition:
            opacity 260ms ease,
            transform 260ms ease;
          z-index: 280 !important;
        }

        .slide-view > header > div:first-child {
          align-items: flex-start !important;
          margin: 0 !important;
          max-width: none !important;
          width: 100% !important;
        }

        .slide-progress-track {
          background: rgba(255, 255, 255, 0.16) !important;
          height: 4px !important;
          left: auto !important;
          margin: 8px 0 0 !important;
          max-width: none !important;
          opacity: 1 !important;
          position: static !important;
          top: auto !important;
          transform: none !important;
          width: 100% !important;
          z-index: auto !important;
        }

        .slide-progress-track-inline {
          display: none !important;
        }

        .slide-mode-switcher,
        .slide-controls {
          background: rgba(255, 255, 255, 0.05) !important;
          box-shadow: none !important;
          color: rgb(168, 162, 158) !important;
          outline: 1px solid rgba(255, 255, 255, 0.07);
          outline-offset: 0;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }

        .slide-mode-switcher a,
        .slide-detail-link {
          color: rgb(168, 162, 158) !important;
        }

        .slide-mode-switcher a:hover,
        .slide-detail-link:hover {
          background: rgba(255, 255, 255, 0.06) !important;
          color: rgb(245, 245, 244) !important;
        }

        .slide-mode-switcher span,
        .slide-info-button {
          background: #9db6b0 !important;
          color: #17110e !important;
          box-shadow: none !important;
        }

        .slide-progress {
          background: #c5dfd8 !important;
        }

        .slide-view > aside {
          background: linear-gradient(
            to top,
            rgba(5, 4, 3, 0.86),
            rgba(5, 4, 3, 0.2) 66%,
            transparent
          ) !important;
          padding: 72px var(--slide-edge-gap-right) var(--slide-edge-gap-bottom)
            var(--slide-edge-gap) !important;
          transition:
            opacity 260ms ease,
            transform 260ms ease;
          z-index: 220 !important;
        }

        .slide-view > aside > div {
          align-items: flex-end !important;
          flex-direction: row !important;
          gap: 10px !important;
          justify-content: space-between !important;
          margin: 0 !important;
          max-width: none !important;
          width: 100% !important;
        }

        .slide-caption {
          animation: none !important;
          color: rgb(168, 162, 158) !important;
          max-width: calc(100vw - 124px - var(--slide-edge-gap)) !important;
          min-width: 0;
          opacity: 1;
          padding-top: 0 !important;
          transform: none !important;
          transition:
            opacity 260ms ease,
            transform 260ms ease;
        }

        .slide-caption > * + * {
          margin-top: 6px !important;
        }

        .slide-caption h1,
        .slide-caption p {
          color: rgb(168, 162, 158) !important;
        }

        .slide-caption .slide-caption-category {
          color: #8ea6a2 !important;
        }

        .slide-controls {
          align-self: flex-end !important;
          font-size: 14px !important;
          gap: 0 !important;
          order: 0 !important;
          padding: 4px !important;
          position: fixed !important;
          right: var(--slide-edge-gap-right) !important;
          top: var(--slide-edge-gap-top) !important;
          transform: none !important;
          transition:
            opacity 260ms ease,
            transform 260ms ease,
            background-color 260ms ease;
          z-index: 240;
        }

        .slide-info-button,
        .slide-detail-link {
          padding: 8px 16px !important;
        }

        .slide-view.slide-chrome-resting > header {
          opacity: 1 !important;
          transform: none !important;
        }

        .slide-view.slide-chrome-resting .slide-mode-switcher,
        .slide-view.slide-chrome-resting .slide-progress-track {
          opacity: 0.48 !important;
        }

        .slide-view.slide-chrome-resting .slide-count-pill {
          opacity: 0.48 !important;
        }

        .slide-view.slide-chrome-resting > aside {
          opacity: 1 !important;
          transform: none !important;
        }

        .slide-view.slide-chrome-resting .slide-caption {
          opacity: 0.48 !important;
        }

        .slide-view.slide-chrome-resting .slide-controls {
          opacity: 0.48 !important;
          transform: none !important;
        }

        @media (max-width: 900px) {
          .slide-controls {
            font-size: 12px !important;
          }

          .slide-info-button,
          .slide-detail-link {
            padding: 6px 11px !important;
          }

          .slide-progress-track {
            height: 3px !important;
            margin-top: 7px !important;
          }
        }

        @media (max-width: 900px) and (orientation: portrait) {
          .slide-view {
            --slide-mobile-inline: 14px;
          }

          .slide-view > header {
            padding-left: var(--slide-mobile-inline) !important;
            padding-right: var(--slide-mobile-inline) !important;
          }

          .slide-mode-switcher,
          .slide-controls {
            font-size: 12px !important;
            padding: 4px !important;
          }

          .slide-mode-switcher a,
          .slide-mode-switcher span,
          .slide-info-button,
          .slide-detail-link {
            padding: 6px 11px !important;
          }

          .slide-controls {
            right: var(--slide-mobile-inline) !important;
            top: var(--slide-edge-gap-top) !important;
          }

          .slide-progress-track {
            left: var(--slide-mobile-inline) !important;
            margin-top: 7px !important;
            position: fixed !important;
            right: var(--slide-mobile-inline) !important;
            top: calc(var(--slide-edge-gap-top) + 44px) !important;
            width: auto !important;
          }
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .slide-controls {
            font-size: 10px !important;
            opacity: 0.92;
            padding: 3px !important;
          }

          .slide-info-button,
          .slide-detail-link {
            padding: 4px 9px !important;
          }

          .slide-caption,
          .slide-count-pill {
            opacity: 0.92 !important;
          }

          .slide-view.slide-chrome-resting .slide-caption,
          .slide-view.slide-chrome-resting .slide-count-pill {
            opacity: 0.48 !important;
          }

          .slide-view.slide-chrome-resting .slide-controls {
            opacity: 0.48 !important;
          }
        }

        @media (orientation: landscape) and (max-height: 540px) and (pointer: coarse),
          (orientation: landscape) and (max-height: 540px) and (hover: none) {
          .slide-mode-switcher,
          .slide-controls {
            font-size: 10px !important;
            opacity: 0.92;
            padding: 3px !important;
          }

          .slide-mode-switcher a,
          .slide-mode-switcher span,
          .slide-info-button,
          .slide-detail-link {
            padding: 4px 9px !important;
          }

          .slide-count-pill {
            font-size: 12px !important;
            padding: 4px 10px !important;
          }

          .slide-caption {
            max-width: min(33vw, 240px) !important;
          }

          .slide-caption-category {
            font-size: 9px !important;
            letter-spacing: 0.18em !important;
            line-height: 1 !important;
          }

          .slide-view.slide-chrome-resting .slide-caption,
          .slide-view.slide-chrome-resting .slide-count-pill,
          .slide-view.slide-chrome-resting .slide-controls {
            opacity: 0.48 !important;
          }
        }

        @media (min-width: 901px), (orientation: landscape) {
          .slide-view > header > .slide-header-row {
            align-items: flex-end !important;
            gap: var(--slide-top-control-gap) !important;
          }

          .slide-header-cluster {
            align-items: flex-end !important;
            flex-shrink: 0 !important;
            gap: var(--slide-top-control-gap) !important;
          }

          .slide-header-controls {
            align-self: flex-end !important;
            display: inline-flex !important;
            flex-shrink: 0 !important;
            gap: 0 !important;
            order: 0 !important;
            position: static !important;
            right: auto !important;
            top: auto !important;
            transform: none !important;
          }

          .slide-bottom-controls {
            display: none !important;
          }

          .slide-progress-track-inline {
            align-self: center !important;
            display: block !important;
            flex: 1 1 auto !important;
            height: 4px !important;
            left: auto !important;
            margin: 0 !important;
            max-width: none !important;
            min-width: 72px !important;
            opacity: 1 !important;
            position: static !important;
            right: auto !important;
            top: auto !important;
            transform: none !important;
            width: auto !important;
          }

          .slide-progress-track-stack {
            display: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .slide-card,
          .slide-card img,
          .slide-caption,
          .slide-progress,
          .flip-overlay-card,
          .flip-card-inner {
            animation-duration: 1ms !important;
            transition-duration: 1ms !important;
          }

          .flip-overlay-card,
          .flip-overlay-card.is-flipped {
            transform: none;
          }
        }
      `}</style>
    </main>
  );
};

export default SlidePage;
