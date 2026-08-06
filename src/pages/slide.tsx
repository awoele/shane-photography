/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Swiper as SwiperInstance } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';

import { Meta } from '@/layout/Meta';
import { getOrderedGalleryPhotos } from '@/lib/galleryOrdering';
import {
  buildPhotoDetailHref,
  createGalleryScrollSnapshot,
  GALLERY_SCROLL_STORAGE_KEY,
  readGalleryScrollSnapshot,
  shouldHardNavigateAfterClientRouteFailure,
} from '@/lib/navigation';
import {
  formatCameraName,
  formatIso,
  getDisplayDate,
  getPhotoTitle,
  type Photo,
  type PhotoSortMode,
} from '@/lib/photos';
import { PUBLIC_GALLERY_CACHE_CONTROL } from '@/lib/server/cacheHeaders';
import {
  getSlideCardAspectStyle,
  getSlideFlipCardAspectStyle,
} from '@/lib/slideCardSizing';
import {
  getSlideImageLoading,
  shouldRenderSlideImage,
} from '@/lib/slideImageLoading';
import {
  SLIDE_ACTIVE_SCALE,
  SLIDE_ACTIVE_SCALE_MOBILE,
  SLIDE_CARD_TRANSFORM_DURATION_MS,
  SLIDE_RESISTANCE_RATIO,
  SLIDE_SCROLL_DURATION_MS,
  SLIDE_TOUCH_THRESHOLD_PX,
} from '@/lib/slideMotion';
import {
  buildSlideCurrentHref,
  buildSlideProofHref,
  guardSlideProofNavigationEvent,
} from '@/lib/slideNavigation';
import {
  isPortraitViewport,
  isSlideMobileViewport,
  requestSlideLandscape,
} from '@/lib/slideOrientation';
import {
  getSlideProgressDisplayIndex,
  getSlideProgressIndex,
  getSlideProgressPercent,
  getSlideProgressVisualIndexFromSlidesGrid,
} from '@/lib/slideProgress';
import {
  getSlideRenderWindow,
  getSlideRenderWindowLocalIndex,
  shouldRecenterSlideRenderWindow,
} from '@/lib/slideRenderWindow';
import { shouldPreventSlideDocumentTouchMove } from '@/lib/slideTouchScroll';
import { getSlideWheelOffset } from '@/lib/slideWheel';
import { AppConfig } from '@/utils/AppConfig';

type SlidePageProps = {
  category: string;
  initialIndex: number;
  loadError: string;
  photos: Photo[];
  randomSeed: number;
  sortMode: PhotoSortMode | '';
};

type PendingPointer = {
  index: number;
  x: number;
  y: number;
};

const CLICK_MOVEMENT_LIMIT_PX = 9;
const FLIP_DURATION_MS = 720;
const FLIP_CLOSE_DURATION_MS = 820;
const OPEN_FLIP_DELAY_MS = 90;
const SLIDE_CHROME_IDLE_DELAY_MS = 2400;
const SLIDE_RENDER_WINDOW_RADIUS = 7;
const SLIDE_RENDER_WINDOW_RECENTER_MARGIN = 3;
const SLIDE_WHEEL_COOLDOWN_MS = 260;
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

type SlideCardVisualStyle = CSSProperties & {
  '--card-active-rotate': string;
  '--card-active-y': string;
  '--card-hover-rotate': string;
  '--card-hover-y': string;
  '--card-rotate': string;
  '--card-y': string;
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
  return getOrderedGalleryPhotos({
    category: category || 'all',
    photos,
    seed,
    sortMode,
  });
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
  res.setHeader('Cache-Control', PUBLIC_GALLERY_CACHE_CONTROL);

  try {
    const { fetchManagedPhotoSet } = await import(
      '@/lib/server/photoCmsManifest'
    );
    const { photos: allPhotos } = await fetchManagedPhotoSet();
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
      className={`flip-overlay bg-black/68 fixed inset-0 z-[420] grid place-items-center px-4 py-5 backdrop-blur-[2px] ${
        closing ? 'is-closing' : ''
      }`}
      onClick={onClose}
    >
      <div
        className={`flip-overlay-card relative h-[var(--slide-card-height)] max-h-[min(82svh,680px)] max-w-[92vw] [perspective:1400px] ${
          flipped ? 'is-flipped' : ''
        } ${closing ? 'is-closing' : ''}`}
        style={getSlideFlipCardAspectStyle(photo)}
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
            className="flip-info-face border-white/12 absolute inset-0 flex rounded-[22px] border bg-[linear-gradient(145deg,#1b1713_0%,#0d0b0a_54%,#18120f_100%)] p-5 text-center shadow-[0_34px_120px_rgba(0,0,0,0.86)] ring-1 ring-[#c6ded7]/20 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7 max-[900px]:landscape:p-4"
            onClick={onClose}
          >
            <div className="m-auto flex max-h-full w-full max-w-[500px] flex-col items-center justify-center gap-2.5 overflow-hidden text-stone-100 max-[900px]:landscape:gap-1.5">
              {infoLines.length > 0 ? (
                <>
                  {photo.category ? (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a9c2bb] max-[900px]:landscape:text-[9px]">
                      {photo.category}
                    </p>
                  ) : null}
                  {date ? (
                    <p className="text-xs text-stone-300 max-[900px]:landscape:text-[10px]">
                      {date}
                    </p>
                  ) : null}
                  <h2 className="text-xl font-semibold leading-tight text-stone-100 sm:text-[22px] max-[900px]:landscape:text-base">
                    {title}
                  </h2>
                  {cameraLine ? (
                    <p className="text-sm font-medium leading-5 text-stone-100 max-[900px]:landscape:text-xs">
                      {cameraLine}
                    </p>
                  ) : null}
                  {exifLine ? (
                    <p className="text-xs leading-5 text-stone-400 max-[900px]:landscape:text-[10px] max-[900px]:landscape:leading-4">
                      {exifLine}
                    </p>
                  ) : null}
                  {description ? (
                    <p className="line-clamp-5 pt-1.5 text-xs leading-6 text-stone-200 max-[900px]:landscape:line-clamp-3 max-[900px]:landscape:text-[10px] max-[900px]:landscape:leading-4">
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
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [renderWindowCenter, setRenderWindowCenter] = useState(initialIndex);
  const [visualActiveIndex, setVisualActiveIndex] = useState(initialIndex);
  const [progressVisualIndex, setProgressVisualIndex] = useState(initialIndex);
  const [isProgressLive, setIsProgressLive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isInfoFlipped, setIsInfoFlipped] = useState(false);
  const [isInfoClosing, setIsInfoClosing] = useState(false);
  const [showLandscapePrompt, setShowLandscapePrompt] = useState(false);
  const [landscapePromptDismissed, setLandscapePromptDismissed] =
    useState(false);
  const [isSlideChromeVisible, setIsSlideChromeVisible] = useState(true);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const openFlipTimer = useRef<number>();
  const closeFlipTimer = useRef<number>();
  const chromeHideTimer = useRef<number>();
  const commitSlideTimer = useRef<number>();
  const flipLocked = useRef(false);
  const pendingActiveIndex = useRef<number | null>(null);
  const pendingPointer = useRef<PendingPointer | null>(null);
  const progressDragPointerId = useRef<number | null>(null);
  const progressFrame = useRef<number>();
  const progressLiveTimer = useRef<number>();
  const queuedProgressIndex = useRef(initialIndex);
  const lastWheelSlideAt = useRef(0);
  const activePhoto = photos[activeIndex];
  const progressDisplayIndex = getSlideProgressDisplayIndex({
    activeIndex,
    total: photos.length,
    visualActiveIndex,
  });
  const progressPercent = getSlideProgressPercent({
    index: progressVisualIndex,
    total: photos.length,
  });
  const slideWindow = useMemo(
    () =>
      getSlideRenderWindow({
        activeIndex: renderWindowCenter,
        radius: SLIDE_RENDER_WINDOW_RADIUS,
        total: photos.length,
      }),
    [photos.length, renderWindowCenter],
  );
  const visibleSlides = useMemo(
    () =>
      slideWindow.indexes
        .map((index) => {
          const photo = photos[index];

          return photo ? { index, photo } : null;
        })
        .filter(
          (item): item is { index: number; photo: Photo } => item !== null,
        ),
    [photos, slideWindow.indexes],
  );

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

  const handleSlideInteractionStart = useCallback(() => {
    revealSlideChrome();
  }, [revealSlideChrome]);

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
      overscrollBehavior: body.style.overscrollBehavior,
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      touchAction: body.style.touchAction,
      top: body.style.top,
      width: body.style.width,
    };
    const previousRootStyles = {
      height: root.style.height,
      left: root.style.left,
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
      position: root.style.position,
      right: root.style.right,
      touchAction: root.style.touchAction,
      top: root.style.top,
      width: root.style.width,
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

      const targetIsSlideTrack =
        event.target instanceof Element &&
        Boolean(event.target.closest('.slide-track'));

      if (
        shouldPreventSlideDocumentTouchMove({
          currentTouchX: touch.clientX,
          currentTouchY: touch.clientY,
          startTouchX: touchStartX,
          startTouchY: touchStartY,
          targetIsSlideTrack,
        })
      ) {
        event.preventDefault();
      }
    };

    window.scrollTo(0, 0);
    root.style.height = '100%';
    root.style.left = '0';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    root.style.position = 'fixed';
    root.style.right = '0';
    root.style.touchAction = 'none';
    root.style.top = '0';
    root.style.width = '100%';
    body.style.left = '0';
    body.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.right = '0';
    body.style.touchAction = 'none';
    body.style.top = '0';
    body.style.width = '100%';
    syncViewportHeight();

    window.visualViewport?.addEventListener('resize', syncViewportHeight);
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
      window.removeEventListener('resize', syncViewportHeight);
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      root.style.removeProperty('--slide-viewport-height');
      Object.assign(root.style, previousRootStyles);
      Object.assign(body.style, previousBodyStyles);
    };
  }, []);

  const setProgressIndex = useCallback(
    (index: number, live = false) => {
      const clampedIndex = clamp(index, 0, Math.max(photos.length - 1, 0));

      if (live) {
        setIsProgressLive(true);
        window.clearTimeout(progressLiveTimer.current);
        progressLiveTimer.current = window.setTimeout(() => {
          setIsProgressLive(false);
        }, SLIDE_SCROLL_DURATION_MS + 120);
      }

      queuedProgressIndex.current = clampedIndex;

      if (progressFrame.current !== undefined) {
        return;
      }

      progressFrame.current = window.requestAnimationFrame(() => {
        progressFrame.current = undefined;
        setProgressVisualIndex((currentIndex) =>
          Math.abs(currentIndex - queuedProgressIndex.current) < 0.001
            ? currentIndex
            : queuedProgressIndex.current,
        );
      });
    },
    [photos.length],
  );

  const syncProgressFromSwiper = useCallback(
    (swiper: SwiperInstance, live = true) => {
      setProgressIndex(
        getSlideProgressVisualIndexFromSlidesGrid({
          slideStart: slideWindow.start,
          slidesGrid: swiper.slidesGrid,
          total: photos.length,
          translate: swiper.translate,
        }),
        live,
      );
    },
    [photos.length, setProgressIndex, slideWindow.start],
  );

  const commitActiveIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clamp(nextIndex, 0, Math.max(photos.length - 1, 0));

      pendingActiveIndex.current = null;
      setVisualActiveIndex(clampedIndex);
      setProgressIndex(clampedIndex);
      window.clearTimeout(progressLiveTimer.current);
      setIsProgressLive(false);
      setActiveIndex(clampedIndex);

      if (
        shouldRecenterSlideRenderWindow({
          activeIndex: clampedIndex,
          end: slideWindow.end,
          margin: SLIDE_RENDER_WINDOW_RECENTER_MARGIN,
          start: slideWindow.start,
        })
      ) {
        setRenderWindowCenter(clampedIndex);
      }
    },
    [photos.length, setProgressIndex, slideWindow.end, slideWindow.start],
  );

  const slideToIndex = useCallback(
    (index: number, speed = SLIDE_SCROLL_DURATION_MS) => {
      const nextIndex = clamp(index, 0, Math.max(photos.length - 1, 0));
      const swiper = swiperRef.current;
      const localIndex = nextIndex - slideWindow.start;

      window.clearTimeout(commitSlideTimer.current);

      if (
        !swiper ||
        swiper.destroyed ||
        localIndex < 0 ||
        localIndex >= visibleSlides.length
      ) {
        setRenderWindowCenter(nextIndex);
        commitActiveIndex(nextIndex);
        return;
      }

      pendingActiveIndex.current = nextIndex;
      setVisualActiveIndex(nextIndex);
      setProgressIndex(nextIndex, speed === 0);
      swiper.slideTo(localIndex, speed);
    },
    [
      commitActiveIndex,
      photos.length,
      setProgressIndex,
      slideWindow.start,
      visibleSlides.length,
    ],
  );

  const jumpToProgressPosition = useCallback(
    (track: HTMLDivElement, clientX: number) => {
      const rect = track.getBoundingClientRect();
      const nextIndex = getSlideProgressIndex({
        clientX,
        left: rect.left,
        total: photos.length,
        width: rect.width,
      });

      setProgressIndex(nextIndex, true);
      slideToIndex(nextIndex, 0);
      window.clearTimeout(commitSlideTimer.current);
      commitActiveIndex(nextIndex);
      revealSlideChrome();
    },
    [
      commitActiveIndex,
      photos.length,
      revealSlideChrome,
      setProgressIndex,
      slideToIndex,
    ],
  );

  const handleProgressPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      progressDragPointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      jumpToProgressPosition(event.currentTarget, event.clientX);
    },
    [jumpToProgressPosition],
  );

  const handleProgressPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (progressDragPointerId.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      jumpToProgressPosition(event.currentTarget, event.clientX);
    },
    [jumpToProgressPosition],
  );

  const handleProgressPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (progressDragPointerId.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      progressDragPointerId.current = null;
      jumpToProgressPosition(event.currentTarget, event.clientX);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [jumpToProgressPosition],
  );

  const handleProgressPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (progressDragPointerId.current !== event.pointerId) {
        return;
      }

      progressDragPointerId.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleProgressKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 1;
      let nextIndex: number | null = null;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        nextIndex = activeIndex - step;
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        nextIndex = activeIndex + step;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = photos.length - 1;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const clampedIndex = clamp(nextIndex, 0, Math.max(photos.length - 1, 0));

      slideToIndex(clampedIndex, 0);
      window.clearTimeout(commitSlideTimer.current);
      commitActiveIndex(clampedIndex);
      revealSlideChrome();
    },
    [
      activeIndex,
      commitActiveIndex,
      photos.length,
      revealSlideChrome,
      slideToIndex,
    ],
  );

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
      setVisualActiveIndex(index);
      setActiveIndex(index);
      slideToIndex(index);

      openFlipTimer.current = window.setTimeout(() => {
        setSelectedIndex(index);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setIsInfoFlipped(true);
            window.setTimeout(() => {
              flipLocked.current = false;
            }, FLIP_DURATION_MS);
          });
        });
      }, OPEN_FLIP_DELAY_MS);
    },
    [slideToIndex],
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

  const handleCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
      pendingPointer.current = {
        index,
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

      if (movement > CLICK_MOVEMENT_LIMIT_PX) {
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

      slideToIndex(nextIndex);
    },
    [activeIndex, photos.length, slideToIndex],
  );

  const handleSlideWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (selectedIndex !== null) {
        return;
      }

      const wheelOffset = getSlideWheelOffset({
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });

      if (wheelOffset === 0) {
        return;
      }

      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const now = window.performance.now();

      if (now - lastWheelSlideAt.current < SLIDE_WHEEL_COOLDOWN_MS) {
        return;
      }

      lastWheelSlideAt.current = now;
      revealSlideChrome();
      goToSlide(wheelOffset);
    },
    [goToSlide, revealSlideChrome, selectedIndex],
  );

  useEffect(() => {
    window.clearTimeout(openFlipTimer.current);
    window.clearTimeout(closeFlipTimer.current);
    window.clearTimeout(commitSlideTimer.current);
    if (progressFrame.current !== undefined) {
      window.cancelAnimationFrame(progressFrame.current);
      progressFrame.current = undefined;
    }
    window.clearTimeout(progressLiveTimer.current);
    flipLocked.current = false;
    setSelectedIndex(null);
    setIsInfoFlipped(false);
    setIsInfoClosing(false);
    setRenderWindowCenter(initialIndex);
    setVisualActiveIndex(initialIndex);
    queuedProgressIndex.current = initialIndex;
    setProgressVisualIndex(initialIndex);
    setIsProgressLive(false);
    setActiveIndex(initialIndex);
    pendingActiveIndex.current = null;

    return () => {
      window.clearTimeout(progressLiveTimer.current);
      if (progressFrame.current !== undefined) {
        window.cancelAnimationFrame(progressFrame.current);
        progressFrame.current = undefined;
      }
    };
  }, [initialIndex]);

  useIsomorphicLayoutEffect(() => {
    const swiper = swiperRef.current;
    const localIndex = getSlideRenderWindowLocalIndex({
      end: slideWindow.end,
      index: visualActiveIndex,
      start: slideWindow.start,
    });

    if (
      !swiper ||
      swiper.destroyed ||
      localIndex === null ||
      swiper.activeIndex === localIndex
    ) {
      return;
    }

    swiper.slideTo(localIndex, 0, false);
    syncProgressFromSwiper(swiper, false);
  }, [
    slideWindow.end,
    slideWindow.start,
    syncProgressFromSwiper,
    visualActiveIndex,
  ]);

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
      window.clearTimeout(openFlipTimer.current);
      window.clearTimeout(closeFlipTimer.current);
      window.clearTimeout(chromeHideTimer.current);
      window.clearTimeout(commitSlideTimer.current);
    },
    [],
  );

  const visibleTitle = activePhoto ? getPhotoTitle(activePhoto) : 'Slide View';
  const activeDescription = activePhoto?.description || AppConfig.description;
  const activeDate = activePhoto ? formatDate(getDisplayDate(activePhoto)) : '';
  const selectedPhoto =
    selectedIndex !== null ? photos[selectedIndex] : undefined;

  const proofHref = useMemo(
    () => buildSlideProofHref({ category, randomSeed, sortMode }),
    [category, randomSeed, sortMode],
  );

  const currentSlideHref = useMemo(() => {
    return buildSlideCurrentHref({
      activePhotoId: activePhoto?.id,
      proofHref,
    });
  }, [activePhoto, proofHref]);

  const activePhotoDetailHref = activePhoto
    ? buildPhotoDetailHref(activePhoto.id, currentSlideHref)
    : '/';

  const preserveProofGallerySnapshot = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const existingSnapshot = window.sessionStorage.getItem(
      GALLERY_SCROLL_STORAGE_KEY,
    );

    if (readGalleryScrollSnapshot(existingSnapshot, proofHref) !== null) {
      return;
    }

    window.sessionStorage.setItem(
      GALLERY_SCROLL_STORAGE_KEY,
      createGalleryScrollSnapshot(proofHref, 0, Date.now(), window.innerWidth),
    );
  }, [proofHref]);

  const handleProofViewNavigation = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!guardSlideProofNavigationEvent(event)) {
        return;
      }

      preserveProofGallerySnapshot();
      router.replace(proofHref, undefined, { scroll: false }).catch((error) => {
        if (shouldHardNavigateAfterClientRouteFailure(error)) {
          window.location.href = proofHref;
        }
      });
    },
    [preserveProofGallerySnapshot, proofHref, router],
  );

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
      data-progress-live={isProgressLive ? 'true' : 'false'}
      style={
        {
          '--slide-card-motion-duration': `${SLIDE_CARD_TRANSFORM_DURATION_MS}ms`,
          '--slide-motion-duration': `${SLIDE_SCROLL_DURATION_MS}ms`,
        } as CSSProperties
      }
      onPointerDown={handleSlideInteractionStart}
      onTouchStart={handleSlideInteractionStart}
      onWheel={handleSlideWheel}
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
                onClick={handleProofViewNavigation}
                onPointerDown={(event) => event.stopPropagation()}
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
          <div
            role="slider"
            tabIndex={0}
            aria-label="Slide progress"
            aria-valuemax={photos.length}
            aria-valuemin={1}
            aria-valuenow={progressDisplayIndex + 1}
            aria-valuetext={`${progressDisplayIndex + 1} / ${photos.length}`}
            className="slide-progress-track slide-progress-track-inline hidden h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
            onKeyDown={handleProgressKeyDown}
            onPointerCancel={handleProgressPointerCancel}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerEnd}
          >
            <span
              className="slide-progress block h-full rounded-full bg-[#9db6b0]"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <div className="slide-count-pill rounded-full px-4 py-2 text-sm font-medium tabular-nums text-stone-400 max-[900px]:landscape:text-xs">
            {progressDisplayIndex + 1} / {photos.length}
          </div>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Slide progress"
          aria-valuemax={photos.length}
          aria-valuemin={1}
          aria-valuenow={progressDisplayIndex + 1}
          aria-valuetext={`${progressDisplayIndex + 1} / ${photos.length}`}
          className="slide-progress-track slide-progress-track-stack mx-auto mt-3 h-1 max-w-[1440px] overflow-hidden rounded-full bg-white/10 max-[900px]:landscape:mt-0.5 max-[900px]:landscape:h-0.5 max-[900px]:landscape:w-[46vw] max-[900px]:landscape:max-w-[360px] max-[900px]:landscape:bg-white/10 max-[900px]:landscape:opacity-60"
          onKeyDown={handleProgressKeyDown}
          onPointerCancel={handleProgressPointerCancel}
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerEnd}
        >
          <span
            className="slide-progress block h-full rounded-full bg-[#9db6b0]"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </header>

      <section className="slide-stage relative z-10 flex items-center">
        <Swiper
          className="slide-track slide-swiper size-full"
          centeredSlides
          initialSlide={slideWindow.localActiveIndex}
          resistanceRatio={SLIDE_RESISTANCE_RATIO}
          slideToClickedSlide
          slidesPerView="auto"
          spaceBetween={10}
          speed={SLIDE_SCROLL_DURATION_MS}
          threshold={SLIDE_TOUCH_THRESHOLD_PX}
          watchSlidesProgress
          onSetTranslate={(swiper) => {
            syncProgressFromSwiper(swiper);
          }}
          onSlideChange={(swiper) => {
            const nextVisibleSlide = visibleSlides[swiper.activeIndex];

            if (nextVisibleSlide) {
              pendingActiveIndex.current = nextVisibleSlide.index;
              setVisualActiveIndex(nextVisibleSlide.index);
              setProgressIndex(nextVisibleSlide.index, true);
            }

            window.clearTimeout(commitSlideTimer.current);
            commitSlideTimer.current = window.setTimeout(() => {
              const nextIndex = pendingActiveIndex.current;

              if (nextIndex !== null) {
                commitActiveIndex(nextIndex);
              }
            }, SLIDE_SCROLL_DURATION_MS + 80);
          }}
          onSliderMove={(swiper) => {
            revealSlideChrome();
            syncProgressFromSwiper(swiper);
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            syncProgressFromSwiper(swiper, false);
          }}
          onTouchStart={revealSlideChrome}
          onTransitionEnd={() => {
            window.clearTimeout(commitSlideTimer.current);
            const nextIndex = pendingActiveIndex.current;

            if (nextIndex !== null) {
              commitActiveIndex(nextIndex);
            } else {
              setIsProgressLive(false);
            }
          }}
        >
          {visibleSlides.map(({ photo, index }) => {
            const distance = index - visualActiveIndex;
            const isActive = index === visualActiveIndex;
            const isStaged = isActive;
            const imageSource = photo.thumbnail || photo.src;
            const shouldMountImage = shouldRenderSlideImage(distance);
            let cardState = 'idle';

            if (isActive) {
              cardState = 'active';
            }

            return (
              <SwiperSlide
                key={photo.id}
                className={`slide-card-slide !flex items-center justify-center ${
                  isActive ? 'slide-card-slide-active' : ''
                }`}
                style={{
                  ...getSlideCardAspectStyle(photo),
                  height: 'var(--slide-card-height)',
                }}
              >
                <div
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
                  className={`slide-card group relative flex size-full cursor-pointer items-center justify-center outline-none hover:z-30 focus-visible:ring-2 focus-visible:ring-white/35 ${
                    isActive ? 'slide-card-active' : ''
                  }`}
                  data-card-state={cardState}
                  style={getCardStyle({
                    active: isStaged,
                    index,
                    photo,
                  })}
                >
                  <div className="slide-card-inner relative size-full rounded-[22px]">
                    <div className="slide-photo-face absolute inset-0 z-10 overflow-hidden rounded-[22px] bg-[#18130f] shadow-[0_24px_70px_rgba(0,0,0,0.58)] ring-1 ring-white/10 [backface-visibility:hidden]">
                      {shouldMountImage ? (
                        <img
                          src={imageSource}
                          alt={getPhotoTitle(photo)}
                          loading={getSlideImageLoading(distance)}
                          decoding="async"
                          draggable={false}
                          className="size-full select-none object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,182,176,0.14)_0%,rgba(255,255,255,0.045)_38%,rgba(0,0,0,0.22)_100%)]"
                        />
                      )}
                      <span className="from-black/32 to-white/4 pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-t via-transparent opacity-70" />
                      {isActive ? (
                        <span className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[0_0_42px_rgba(157,182,176,0.18)] ring-1 ring-[#c6ded7]/35" />
                      ) : null}
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>
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
        <div className="bg-[#050403]/88 fixed inset-0 z-[260] grid place-items-center px-6 text-center text-stone-100 backdrop-blur-xl">
          <div className="max-w-[330px]">
            <p className="mx-auto max-w-[260px] text-base font-semibold leading-6 text-stone-100">
              推荐横屏观看
            </p>
            <div className="mt-5 inline-flex rounded-full bg-white/[0.055] p-1 text-sm font-medium ring-1 ring-white/[0.07] backdrop-blur-xl">
              <button
                type="button"
                onClick={requestLandscapeMode}
                className="rounded-full px-5 py-2 text-stone-300 transition hover:bg-white/[0.06] hover:text-stone-100"
              >
                旋转屏幕
              </button>
              <button
                type="button"
                onClick={() => {
                  setLandscapePromptDismissed(true);
                  setShowLandscapePrompt(false);
                }}
                className="rounded-full bg-[#9db6b0] px-5 py-2 text-[#17110e] transition hover:bg-[#b7cec8]"
              >
                继续竖屏
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .slide-view {
          --slide-card-height-active: clamp(295px, 67vh, 610px);
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
          -webkit-overflow-scrolling: touch;
          height: var(--slide-viewport-height, 100svh) !important;
          overflow: visible !important;
          overscroll-behavior-x: contain;
          overscroll-behavior-y: none;
          scrollbar-width: none;
          touch-action: pan-x;
        }

        .slide-track::-webkit-scrollbar {
          display: none;
        }

        .slide-track .swiper-wrapper {
          align-items: center;
          overflow: visible !important;
        }

        .slide-progress {
          background: #9db6b0 !important;
          pointer-events: none;
          transform-origin: left center;
          transition: width var(--slide-motion-duration)
            cubic-bezier(0.16, 1, 0.3, 1);
          will-change: width;
        }

        .slide-view[data-progress-live='true'] .slide-progress {
          transition-duration: 1ms;
          transition-timing-function: linear;
        }

        .slide-progress-track {
          cursor: pointer;
          outline: none;
          overflow: visible !important;
          pointer-events: auto;
          position: relative;
          touch-action: none;
          user-select: none;
        }

        .slide-progress-track::after {
          content: '';
          inset: -12px 0;
          pointer-events: none;
          position: absolute;
        }

        .slide-progress-track:focus-visible {
          box-shadow:
            0 0 0 1px rgba(198, 222, 215, 0.36),
            0 0 28px rgba(157, 182, 176, 0.22);
        }

        .slide-caption {
          animation: slide-caption-in 540ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .slide-controls {
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          position: relative;
          z-index: 2;
        }

        .slide-mode-switcher {
          position: relative;
          z-index: 2;
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
          height: 100% !important;
          transform-origin: center center;
          transform: translate3d(0, var(--card-y), 0)
            rotateZ(var(--card-rotate)) scale(1);
          transition:
            transform var(--slide-card-motion-duration)
              cubic-bezier(0.16, 1, 0.3, 1),
            opacity var(--slide-card-motion-duration)
              cubic-bezier(0.16, 1, 0.3, 1);
          width: 100% !important;
          will-change: transform, opacity;
        }

        .slide-card-slide {
          height: var(--slide-card-height) !important;
          overflow: visible !important;
          width: var(--slide-card-width-default) !important;
        }

        .slide-card-slide-active {
          height: var(--slide-card-height-active) !important;
          z-index: 48 !important;
          width: var(--slide-card-width-active-default) !important;
        }

        .slide-card-active {
          transform: translate3d(0, var(--card-active-y), 0)
            rotateZ(var(--card-active-rotate)) scale(${SLIDE_ACTIVE_SCALE}) !important;
          opacity: 1 !important;
          z-index: 64 !important;
        }

        .slide-card-active .slide-card-inner {
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.64),
            0 0 0 1px rgba(198, 222, 215, 0.24);
        }

        @media (hover: hover) and (pointer: fine) {
          .slide-card:hover {
            transform: translate3d(0, var(--card-hover-y), 0)
              rotateZ(var(--card-hover-rotate)) scale(1.12) !important;
            opacity: 1 !important;
            z-index: 30 !important;
          }

          .slide-card-active:hover {
            transform: translate3d(0, var(--card-hover-y), 0)
              rotateZ(var(--card-hover-rotate)) scale(${SLIDE_ACTIVE_SCALE}) !important;
          }
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
            --slide-card-height-active: min(65vh, 790px);
            --slide-card-height: min(56vh, 680px);
          }

          .slide-card-slide {
            width: var(--slide-card-width-desktop-portrait) !important;
          }

          .slide-card-slide-active {
            width: var(--slide-card-width-active-desktop-portrait) !important;
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
              scale(${SLIDE_ACTIVE_SCALE_MOBILE}) !important;
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
            --slide-card-height-active: min(124vw, 480px, 74svh);
            --slide-card-height: min(108vw, 420px);
          }

          .slide-card-slide {
            height: var(--slide-card-height) !important;
            width: var(--slide-card-width-mobile-portrait) !important;
          }

          .slide-card-slide-active {
            height: var(--slide-card-height-active) !important;
            width: var(--slide-card-width-active-mobile-portrait) !important;
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
          z-index: 420 !important;
        }

        .flip-overlay.is-closing {
          background-color: rgba(0, 0, 0, 0.18);
          opacity: 0;
          backdrop-filter: blur(0);
        }

        .flip-overlay-card {
          aspect-ratio: var(--slide-flip-aspect-default) !important;
          height: var(--slide-flip-card-height-default) !important;
          max-height: min(88svh, 760px) !important;
          max-width: none !important;
          width: var(--slide-flip-card-width-default) !important;
          opacity: 0.98;
          transform: translate3d(0, 8px, 0) scale(1);
          transition:
            opacity 760ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 760ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 760ms cubic-bezier(0.16, 1, 0.3, 1);
          filter: drop-shadow(0 18px 42px rgba(0, 0, 0, 0.42));
        }

        @media (max-width: 900px) and (orientation: portrait) {
          .flip-overlay {
            padding: max(18px, env(safe-area-inset-top)) 14px
              max(18px, env(safe-area-inset-bottom)) !important;
          }

          .flip-overlay-card {
            aspect-ratio: var(--slide-flip-aspect-mobile-portrait) !important;
            height: var(--slide-flip-card-height-mobile-portrait) !important;
            max-height: min(84svh, 600px) !important;
            max-width: calc(100vw - 28px) !important;
            width: var(--slide-flip-card-width-mobile-portrait) !important;
          }
        }

        @media (min-width: 901px) and (orientation: portrait) {
          .flip-overlay-card {
            height: var(--slide-flip-card-height-desktop-portrait) !important;
            max-height: min(86svh, 820px) !important;
            width: var(--slide-flip-card-width-desktop-portrait) !important;
          }
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .flip-overlay-card {
            height: var(--slide-flip-card-height-landscape) !important;
            max-height: min(92svh, 540px) !important;
            width: var(--slide-flip-card-width-landscape) !important;
          }
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
            --slide-card-height-active: min(84svh, 430px);
            --slide-card-height: min(72svh, 360px);
            --slide-card-overlap: 8px;
          }

          .slide-card-slide {
            width: var(--slide-card-width-landscape) !important;
          }

          .slide-card-slide-active {
            height: var(--slide-card-height-active) !important;
            width: var(--slide-card-width-active-landscape) !important;
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
            background: #9db6b0;
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

          .slide-card-active {
            transform: translate3d(0, 0, 0) rotateZ(var(--card-active-rotate))
              scale(${SLIDE_ACTIVE_SCALE_MOBILE}) !important;
            opacity: 1 !important;
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
          background: #9db6b0 !important;
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
