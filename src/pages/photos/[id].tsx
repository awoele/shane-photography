/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent as ReactSyntheticEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { Swiper as SwiperInstance } from 'swiper';
import { Virtual } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import { PhotoCommentsPanel } from '@/components/PhotoCommentsPanel';
import { Meta } from '@/layout/Meta';
import {
  ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT,
  type AfilmoryDetailField,
  type AfilmoryDetailSection,
  createAfilmoryDetailSections,
  DEFAULT_FILMSTRIP_THUMBNAIL_HEIGHT,
  getCircularPhotoNeighbors,
  getFilmstripImageToneClass,
  getFilmstripPhotos,
  getFilmstripPreviewDimensions,
  getFilmstripThumbnailWidth,
} from '@/lib/afilmoryDetail';
import type { AfilmoryPhotoManifestItem } from '@/lib/afilmoryTypes';
import {
  clearPreviousDetailBackgroundState,
  createDetailBackgroundState,
  resolveDetailBackgroundState,
} from '@/lib/detailBackground';
import {
  clearPreviousDetailImageDisplay,
  createDetailImageState,
  resolveDetailImageStateForRender,
} from '@/lib/detailImageState';
import { createDetailImagePreloadLinks } from '@/lib/detailPreloadPlan';
import {
  getDetailViewerNeighborIndex,
  resolveDetailViewerIndex,
  shouldReplaceDetailViewerUrl,
} from '@/lib/detailViewerState';
import {
  GALLERY_DETAIL_TRANSITION_DURATION_MS,
  GALLERY_DETAIL_TRANSITION_STORAGE_KEY,
  type GalleryDetailTransitionRect,
  getContainedImageRect,
  readGalleryDetailTransitionPayload,
} from '@/lib/galleryDetailTransition';
import { isRenderableImageComplete } from '@/lib/imageLoadState';
import {
  getMobileDetailDrawerButtonBottom,
  shouldShowMobileDetailDrawerButton,
} from '@/lib/mobileDetailDrawerEntry';
import {
  buildPhotoDetailHref,
  normalizeInternalReturnHref,
  shouldHardNavigateAfterClientRouteFailure,
  shouldUseBrowserHistoryForReturn,
} from '@/lib/navigation';
import { getPhotoTitle, type Photo } from '@/lib/photos';
import { PUBLIC_GALLERY_CACHE_CONTROL } from '@/lib/server/cacheHeaders';
import { AppConfig } from '@/utils/AppConfig';

type PhotoPageProps = {
  activeIndex: number;
  photo: Photo;
  photoManifest: AfilmoryPhotoManifestItem;
  photoManifests: AfilmoryPhotoManifestItem[];
  photos: Photo[];
  totalPhotos: number;
};

type InspectorTab = 'info' | 'comments';

type FilmstripPreview = {
  dimensions: {
    height: number;
    width: number;
  };
  left: number;
  photo: Photo;
  title: string;
};

type DetailEntryTransition = {
  alt: string;
  imageSrc: string;
  phase: 'start' | 'end' | 'fade';
  rect: GalleryDetailTransitionRect;
};

type TouchPoint = {
  time: number;
  x: number;
  y: number;
};

type ResetDetailTransform = (animationTime?: number) => void;

const ArrowLeftIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const DetailTransformResetter = ({
  photoId,
  resetTransform,
}: {
  photoId: string;
  resetTransform: ResetDetailTransform;
}) => {
  const resetTransformRef = useRef(resetTransform);

  useEffect(() => {
    resetTransformRef.current = resetTransform;
  }, [resetTransform]);

  useEffect(() => {
    resetTransformRef.current(0);
  }, [photoId]);

  return null;
};

const ArrowRightIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const CloseIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const ShareIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4" />
    <path d="m15.4 6.5-6.8 4" />
  </svg>
);

const InfoIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const CommentIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
  </svg>
);

const PanelIcon = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M15 5v14" />
  </svg>
);

const getParameterToken = (label: string) => {
  if (label === '焦距') {
    return 'MM';
  }

  if (label === '光圈') {
    return 'F';
  }

  if (label === '快门') {
    return 'S';
  }

  return 'ISO';
};

const MIN_DETAIL_ZOOM = 1;
const MAX_DETAIL_ZOOM = 5;
const DETAIL_WHEEL_ZOOM_STEP = 0.08;
const DETAIL_DOUBLE_CLICK_ZOOM_STEP = 1.6;
const DETAIL_IMAGE_PROGRESS_FALLBACK_MAX = 92;
const DETAIL_BACKGROUND_TRANSITION_MS = 280;
const MOBILE_INFO_SWIPE_DISTANCE = 58;
const MOBILE_INSPECTOR_DRAG_CLOSE_DISTANCE = 52;
const MOBILE_INSPECTOR_DRAG_EXPAND_DISTANCE = 36;
const MOBILE_INSPECTOR_SWIPE_VELOCITY = 0.42;

const loadedDetailImageSources = new Set<string>();
const pendingDetailImagePreloads = new Map<string, Promise<void>>();
const retainedDetailImagePreloads = new Map<string, HTMLImageElement>();

const isDetailImageSourceReady = (src: string) =>
  Boolean(src) && loadedDetailImageSources.has(src);

const markDetailImageSourceReady = (src: string) => {
  if (src) {
    loadedDetailImageSources.add(src);
  }
};

const decodeDetailImage = async (image: HTMLImageElement) => {
  if (typeof image.decode !== 'function') {
    return;
  }

  await image.decode().catch(() => undefined);
};

const preloadDetailImageSource = async (src: string, timeoutMs = 220) => {
  if (!src || isDetailImageSourceReady(src) || typeof window === 'undefined') {
    return;
  }

  let preload = pendingDetailImagePreloads.get(src);

  if (!preload) {
    const image = new window.Image();

    retainedDetailImagePreloads.set(src, image);
    preload = new Promise<void>((resolve) => {
      const finish = async () => {
        await decodeDetailImage(image);
        markDetailImageSourceReady(src);
        resolve();
      };

      image.onload = () => {
        finish().catch(resolve);
      };
      image.onerror = () => resolve();
      image.decoding = 'async';
      image.src = src;

      if (isRenderableImageComplete(image)) {
        finish().catch(resolve);
      }
    }).finally(() => {
      retainedDetailImagePreloads.delete(src);
      pendingDetailImagePreloads.delete(src);
    });

    pendingDetailImagePreloads.set(src, preload);
  }

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });

  await Promise.race([preload, timeout]);
};

const getMobileInspectorHeights = () => {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const collapsed = Math.min(viewportHeight * 0.64, 560);
  const expanded = Math.max(collapsed, viewportHeight - 88);

  return {
    collapsed,
    expanded,
    range: Math.max(0, expanded - collapsed),
  };
};

const useDetailImageLoader = (src: string, placeholderSrc?: string) => {
  const [imageState, setImageState] = useState(() =>
    createDetailImageState({
      placeholderSrc,
      sourceReady: isDetailImageSourceReady(src),
      src,
    }),
  );

  useEffect(() => {
    let fallbackTimer: number | undefined;
    let isActive = true;
    const sourceReady = isDetailImageSourceReady(src);
    const startingState = createDetailImageState({
      placeholderSrc,
      sourceReady,
      src,
    });

    setImageState((current) =>
      resolveDetailImageStateForRender({
        current,
        placeholderSrc,
        sourceReady,
        src,
      }),
    );

    if (!src || typeof window === 'undefined' || !startingState.loading) {
      return undefined;
    }

    const cachedImage = new window.Image();
    let hasFinished = false;

    const finishLoading = () => {
      if (!isActive || hasFinished) {
        return;
      }

      hasFinished = true;

      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = undefined;
      }

      markDetailImageSourceReady(src);
      setImageState((current) =>
        resolveDetailImageStateForRender({
          current,
          placeholderSrc,
          sourceReady: true,
          src,
        }),
      );
    };

    const failOpen = () => {
      if (!isActive) {
        return;
      }

      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = undefined;
      }

      setImageState({
        displaySrc: src,
        loading: false,
        previousDisplaySrc: '',
        progress: 100,
        source: src,
      });
    };

    const decodeAndFinishLoading = () => {
      decodeDetailImage(cachedImage).then(finishLoading, finishLoading);
    };

    cachedImage.onload = decodeAndFinishLoading;
    cachedImage.onerror = failOpen;
    cachedImage.decoding = 'async';
    cachedImage.src = src;

    const isAlreadyComplete = isRenderableImageComplete(cachedImage);

    if (isAlreadyComplete) {
      decodeAndFinishLoading();
    }

    if (!isAlreadyComplete) {
      fallbackTimer = window.setInterval(() => {
        setImageState((current) => {
          if (
            !current.loading ||
            current.progress >= DETAIL_IMAGE_PROGRESS_FALLBACK_MAX
          ) {
            return current;
          }

          return {
            ...current,
            progress: Math.min(
              DETAIL_IMAGE_PROGRESS_FALLBACK_MAX,
              current.progress + 2,
            ),
          };
        });
      }, 420);
    }

    return () => {
      isActive = false;
      cachedImage.onload = null;
      cachedImage.onerror = null;

      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, [placeholderSrc, src]);

  const clearPreviousDisplay = useCallback((paintedSrc: string) => {
    setImageState((current) =>
      clearPreviousDetailImageDisplay(current, paintedSrc),
    );
  }, []);

  const resolvedImageState = resolveDetailImageStateForRender({
    current: imageState,
    placeholderSrc,
    sourceReady: isDetailImageSourceReady(src),
    src,
  });

  return {
    ...resolvedImageState,
    clearPreviousDisplay,
  };
};

const useDetailGlassBackground = (src: string) => {
  const [backgroundState, setBackgroundState] = useState(() =>
    createDetailBackgroundState(src),
  );

  useEffect(() => {
    if (!src) {
      return undefined;
    }

    let transitionVersion = 0;

    setBackgroundState((current) => {
      const next = resolveDetailBackgroundState(current, src);

      transitionVersion = next.version;
      return next;
    });

    const timeoutId = window.setTimeout(() => {
      setBackgroundState((current) =>
        clearPreviousDetailBackgroundState(current, transitionVersion),
      );
    }, DETAIL_BACKGROUND_TRANSITION_MS + 80);

    return () => window.clearTimeout(timeoutId);
  }, [src]);

  return backgroundState;
};

const FieldRows = ({ fields }: { fields: AfilmoryDetailField[] }) => (
  <dl className="mt-3 space-y-2.5">
    {fields.map((field) => (
      <div
        key={field.label}
        className="grid grid-cols-[88px_minmax(0,1fr)] gap-4"
      >
        <dt className="text-sm leading-5 text-stone-300">{field.label}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-medium leading-5 text-stone-50">
          {field.value}
        </dd>
      </div>
    ))}
  </dl>
);

const ParameterGrid = ({ fields }: { fields: AfilmoryDetailField[] }) => (
  <div className="mt-3 grid grid-cols-2 gap-2.5">
    {fields.map((field) => (
      <div
        key={field.label}
        className="flex min-h-9 items-center gap-2.5 rounded-lg border border-white/[0.09] bg-white/[0.055] px-3 py-1.5 text-sm font-semibold text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
      >
        <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-black/25 text-[11px] font-bold leading-none text-stone-100 ring-1 ring-white/[0.14]">
          {getParameterToken(field.label)}
        </span>
        <span className="min-w-0 truncate leading-none">{field.value}</span>
      </div>
    ))}
  </div>
);

const ChipList = ({ chips = [] }: { chips?: string[] }) => (
  <div className="mt-3 flex flex-wrap gap-2">
    {chips.map((chip) => (
      <span
        key={chip}
        className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-stone-100 ring-1 ring-white/[0.08]"
      >
        {chip}
      </span>
    ))}
  </div>
);

const ToneGrid = ({ fields }: { fields: AfilmoryDetailField[] }) => {
  const [primaryField, ...metricFields] = fields;

  return (
    <div className="mt-3 space-y-2">
      {primaryField ? (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4">
          <span className="text-sm leading-5 text-stone-300">
            {primaryField.label}
          </span>
          <span className="text-right text-sm font-medium text-stone-50">
            {primaryField.value}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        {metricFields.map((field) => (
          <div
            key={field.label}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-sm text-stone-300">{field.label}</span>
            <span className="text-sm font-semibold text-stone-50">
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HistogramPlaceholder = ({ message }: { message?: string }) => (
  <div className="mt-3 h-28 overflow-hidden rounded-md border border-white/[0.06] bg-[#242426]">
    <div className="flex h-full items-end gap-px px-3 pb-3 opacity-35">
      {Array.from({ length: 32 }, (_, index) => (
        <span
          key={index}
          className="flex-1 rounded-t bg-stone-400"
          style={{ height: `${18 + ((index * 13) % 72)}%` }}
        />
      ))}
    </div>
    <p className="-mt-16 text-center text-xs text-stone-300">
      {message || '图片加载后分析'}
    </p>
  </div>
);

const DetailSection = ({ section }: { section: AfilmoryDetailSection }) => (
  <section className="border-b border-white/[0.07] p-4 last:border-b-0">
    <h2 className="text-base font-semibold text-stone-100">{section.title}</h2>

    {section.layout === 'parameter-grid' ? (
      <ParameterGrid fields={section.fields} />
    ) : null}

    {section.layout === 'chips' ? <ChipList chips={section.chips} /> : null}

    {section.layout === 'tone-grid' ? (
      <ToneGrid fields={section.fields} />
    ) : null}

    {section.layout === 'histogram' ? (
      <HistogramPlaceholder message={section.message} />
    ) : null}

    {!section.layout || section.layout === 'fields' ? (
      <FieldRows fields={section.fields} />
    ) : null}
  </section>
);

const AfilmoryInfoPanel = ({
  manifestItem,
  photo,
}: {
  manifestItem: AfilmoryPhotoManifestItem;
  photo: Photo;
}) => {
  const sections = useMemo(
    () => createAfilmoryDetailSections(photo, manifestItem),
    [manifestItem, photo],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
      {sections.map((section) => (
        <DetailSection key={section.title} section={section} />
      ))}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<PhotoPageProps> = async ({
  params,
  res,
}) => {
  res.setHeader('Cache-Control', PUBLIC_GALLERY_CACHE_CONTROL);

  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    return {
      notFound: true,
    };
  }

  const { fetchManagedPhotoSet } = await import(
    '@/lib/server/photoCmsManifest'
  );
  const photoSet = await fetchManagedPhotoSet();
  const { photos } = photoSet;
  const activeIndex = photos.findIndex((item) => item.id === id);
  const photo = activeIndex >= 0 ? photos[activeIndex] : null;
  const photoManifest = photoSet.loader.getPhoto(id);

  if (!photo || !photoManifest) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      activeIndex,
      photo,
      photoManifest,
      photoManifests: photos
        .map((item) => photoSet.loader.getPhoto(item.id))
        .filter((item): item is AfilmoryPhotoManifestItem => Boolean(item)),
      photos,
      totalPhotos: photos.length,
    },
  };
};

const PhotoPage: NextPage<PhotoPageProps> = ({
  activeIndex,
  photo: initialPhoto,
  photoManifest: initialPhotoManifest,
  photoManifests,
  photos,
  totalPhotos: initialTotalPhotos,
}) => {
  const router = useRouter();
  const routedPhotoId = useMemo(() => {
    const rawId = router.query.id;

    return Array.isArray(rawId) ? rawId[0] : rawId;
  }, [router.query.id]);
  const [viewerIndex, setViewerIndex] = useState(() =>
    resolveDetailViewerIndex(photos, initialPhoto.id, activeIndex),
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>('info');
  const [filmstripPreview, setFilmstripPreview] =
    useState<FilmstripPreview | null>(null);
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isLivePhotoPlaying, setIsLivePhotoPlaying] = useState(false);
  const [isMobileInspectorExpanded, setIsMobileInspectorExpanded] =
    useState(false);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
  const [isMobileInspectorDragging, setIsMobileInspectorDragging] =
    useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [detailEntryTransition, setDetailEntryTransition] =
    useState<DetailEntryTransition | null>(null);
  const activeFilmstripItemRef = useRef<HTMLAnchorElement | null>(null);
  const detailEntryTransitionTimerRef = useRef<number>();
  const detailImageFrameRef = useRef<HTMLDivElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const inspectorDragFrameRef = useRef<number>();
  const inspectorDragHeightRef = useRef(0);
  const inspectorHandleDragHandledRef = useRef(false);
  const inspectorHandleDragYRef = useRef(0);
  const inspectorHandleTouchStartRef = useRef<TouchPoint | null>(null);
  const lastMobilePhotoGestureAtRef = useRef(0);
  const lastSyncedPhotoIdRef = useRef(initialPhoto.id);
  const livePhotoVideoRef = useRef<HTMLVideoElement | null>(null);
  const mobileInspectorRef = useRef<HTMLDivElement | null>(null);
  const photoPointerStartRef = useRef<TouchPoint | null>(null);
  const photoStageRef = useRef<HTMLElement | null>(null);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const photoManifestById = useMemo(
    () => new Map(photoManifests.map((item) => [item.id, item])),
    [photoManifests],
  );
  const photo = photos[viewerIndex] ?? initialPhoto;
  const photoManifest = photoManifestById.get(photo.id) ?? initialPhotoManifest;
  const totalPhotos = photos.length || initialTotalPhotos;
  const { next: nextPhoto, previous: previousPhoto } =
    getCircularPhotoNeighbors(photos, viewerIndex);
  const filmstripPhotos = useMemo(
    () => getFilmstripPhotos(photos, viewerIndex, 19),
    [photos, viewerIndex],
  );
  const hasReturnSource = Boolean(
    Array.isArray(router.query.from) ? router.query.from[0] : router.query.from,
  );
  const returnHref = normalizeInternalReturnHref(router.query.from);
  const buildSiblingPhotoHref = useCallback(
    (photoId: string) =>
      hasReturnSource
        ? buildPhotoDetailHref(photoId, returnHref)
        : buildPhotoDetailHref(photoId),
    [hasReturnSource, returnHref],
  );
  const previousPhotoHref = previousPhoto
    ? buildSiblingPhotoHref(previousPhoto.id)
    : '';
  const nextPhotoHref = nextPhoto ? buildSiblingPhotoHref(nextPhoto.id) : '';
  const prefetchedDetailHrefs = useMemo(
    () =>
      Array.from(
        new Set(
          [
            previousPhotoHref,
            nextPhotoHref,
            ...filmstripPhotos
              .filter((item) => item.id !== photo.id)
              .map((item) => buildSiblingPhotoHref(item.id)),
          ].filter((href): href is string => Boolean(href)),
        ),
      ),
    [
      buildSiblingPhotoHref,
      filmstripPhotos,
      nextPhotoHref,
      photo.id,
      previousPhotoHref,
    ],
  );
  const prefetchedRouteHrefs = useMemo(
    () =>
      Array.from(
        new Set(
          [returnHref, ...prefetchedDetailHrefs].filter(
            (href): href is string => Boolean(href),
          ),
        ),
      ),
    [prefetchedDetailHrefs, returnHref],
  );
  const photoTitle = getPhotoTitle(photo);
  const title = `${photoTitle} | ${AppConfig.site_name}`;
  const description = photo.description || AppConfig.description;
  const activePosition = `${viewerIndex + 1} / ${totalPhotos}`;
  const livePhotoVideo =
    photoManifest.video?.type === 'live-photo' ? photoManifest.video : null;
  const detailImage = useDetailImageLoader(photo.src, photo.thumbnail);
  const handleDetailImagePainted = useCallback(
    (paintedSrc: string) => {
      if (!paintedSrc) {
        return;
      }

      if (typeof window === 'undefined') {
        detailImage.clearPreviousDisplay(paintedSrc);
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          detailImage.clearPreviousDisplay(paintedSrc);
        });
      });
    },
    [detailImage],
  );
  const detailBackgroundSource =
    detailImage.displaySrc || photo.thumbnail || photo.src;
  const detailBackground = useDetailGlassBackground(detailBackgroundSource);
  const mobileInspectorCollapsedHeight = 'min(64svh, 560px)';
  const mobileInspectorExpandedHeight = 'calc(100svh - 88px)';
  const mobileInspectorHeight = isMobileInspectorExpanded
    ? mobileInspectorExpandedHeight
    : mobileInspectorCollapsedHeight;
  const preloadLinks = useMemo(
    () =>
      createDetailImagePreloadLinks({
        nextPhoto,
        photo,
        previousPhoto,
      }),
    [nextPhoto, photo, previousPhoto],
  );
  const detailEntryTransitionStyle = detailEntryTransition
    ? ({
        height: detailEntryTransition.rect.height,
        transform: `translate3d(${detailEntryTransition.rect.left}px, ${detailEntryTransition.rect.top}px, 0)`,
        width: detailEntryTransition.rect.width,
      } satisfies CSSProperties)
    : undefined;

  useEffect(() => {
    preloadLinks
      .filter((link) => link.rel === 'preload')
      .forEach((link) => {
        preloadDetailImageSource(link.href, 1600).catch(() => undefined);
      });
  }, [preloadLinks]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const rawPayload = window.sessionStorage.getItem(
      GALLERY_DETAIL_TRANSITION_STORAGE_KEY,
    );
    const payload = readGalleryDetailTransitionPayload(
      rawPayload,
      photo.id,
      Date.now(),
    );

    if (rawPayload) {
      window.sessionStorage.removeItem(GALLERY_DETAIL_TRANSITION_STORAGE_KEY);
    }

    if (
      !payload ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }

    let cancelled = false;
    const frameIds: number[] = [];
    const queueFrame = (callback: FrameRequestCallback) => {
      const frameId = window.requestAnimationFrame(callback);
      frameIds.push(frameId);

      return frameId;
    };

    queueFrame(() => {
      queueFrame(() => {
        if (cancelled) {
          return;
        }

        const imageFrame = detailImageFrameRef.current;

        if (!imageFrame) {
          return;
        }

        const frameRect = imageFrame.getBoundingClientRect();
        const targetRect = getContainedImageRect({
          containerRect: {
            height: frameRect.height,
            left: frameRect.left,
            top: frameRect.top,
            width: frameRect.width,
          },
          imageHeight: photo.height,
          imageWidth: photo.width,
        });

        setDetailEntryTransition({
          alt: photoTitle,
          imageSrc: payload.imageSrc,
          phase: 'start',
          rect: payload.rect,
        });

        queueFrame(() => {
          if (cancelled) {
            return;
          }

          setDetailEntryTransition({
            alt: photoTitle,
            imageSrc: payload.imageSrc,
            phase: 'end',
            rect: targetRect,
          });

          detailEntryTransitionTimerRef.current = window.setTimeout(() => {
            setDetailEntryTransition((currentTransition) =>
              currentTransition
                ? {
                    ...currentTransition,
                    phase: 'fade',
                  }
                : currentTransition,
            );

            detailEntryTransitionTimerRef.current = window.setTimeout(() => {
              setDetailEntryTransition(null);
              detailEntryTransitionTimerRef.current = undefined;
            }, 110);
          }, GALLERY_DETAIL_TRANSITION_DURATION_MS + 120);
        });
      });
    });

    return () => {
      cancelled = true;
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId));

      if (detailEntryTransitionTimerRef.current) {
        window.clearTimeout(detailEntryTransitionTimerRef.current);
        detailEntryTransitionTimerRef.current = undefined;
      }
    };
  }, [photo.height, photo.id, photo.width, photoTitle]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      [previousPhoto?.src, nextPhoto?.src]
        .filter((src): src is string => Boolean(src))
        .forEach((src) => {
          preloadDetailImageSource(src, 1800).catch(() => undefined);
        });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [nextPhoto?.src, previousPhoto?.src]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      prefetchedRouteHrefs.forEach((href) => {
        router.prefetch(href).catch(() => undefined);
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [prefetchedRouteHrefs, router]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    const activeItem = activeFilmstripItemRef.current;

    if (!filmstrip || !activeItem) {
      return;
    }

    const targetLeft =
      activeItem.offsetLeft -
      (filmstrip.clientWidth - activeItem.offsetWidth) / 2;

    filmstrip.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'auto',
    });
    setFilmstripPreview(null);
  }, [filmstripPhotos, photo.id]);

  useEffect(() => {
    setIsImageZoomed(false);
    setIsMobileInspectorExpanded(false);
    setIsMobileInspectorOpen(false);
  }, [photo.id]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const targetIndex = resolveDetailViewerIndex(
      photos,
      routedPhotoId || initialPhoto.id,
      activeIndex,
    );

    lastSyncedPhotoIdRef.current = routedPhotoId || initialPhoto.id;
    setViewerIndex((currentIndex) =>
      currentIndex === targetIndex ? currentIndex : targetIndex,
    );
  }, [activeIndex, initialPhoto.id, photos, routedPhotoId, router.isReady]);

  useEffect(() => {
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed || swiper.activeIndex === viewerIndex) {
      return;
    }

    swiper.slideTo(viewerIndex, 0);
  }, [viewerIndex]);

  useEffect(() => {
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed) {
      return;
    }

    swiper.allowTouchMove = !isImageZoomed && !isMobileInspectorOpen;
  }, [isImageZoomed, isMobileInspectorOpen]);

  useEffect(() => {
    if (!router.isReady || !photo.id) {
      return;
    }

    const routedId = routedPhotoId || initialPhoto.id;

    if (
      !shouldReplaceDetailViewerUrl({
        activePhotoId: photo.id,
        lastSyncedPhotoId: lastSyncedPhotoIdRef.current,
        routedPhotoId: routedId,
      })
    ) {
      return;
    }

    const targetHref = buildSiblingPhotoHref(photo.id);

    lastSyncedPhotoIdRef.current = photo.id;
    router
      .replace(targetHref, undefined, { scroll: false, shallow: true })
      .catch((error) => {
        if (shouldHardNavigateAfterClientRouteFailure(error)) {
          window.location.href = targetHref;
        }
      });
  }, [buildSiblingPhotoHref, initialPhoto.id, photo.id, routedPhotoId, router]);

  useEffect(() => {
    const video = livePhotoVideoRef.current;

    setIsLivePhotoPlaying(false);

    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
  }, [livePhotoVideo?.videoUrl, photo.id]);

  const playLivePhoto = () => {
    const video = livePhotoVideoRef.current;

    if (!livePhotoVideo || !video) {
      return;
    }

    video.currentTime = 0;
    setIsLivePhotoPlaying(true);
    video.play().catch(() => {
      setIsLivePhotoPlaying(false);
    });
  };

  const stopLivePhoto = () => {
    const video = livePhotoVideoRef.current;

    setIsLivePhotoPlaying(false);

    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
  };

  const toggleLivePhoto = () => {
    if (isLivePhotoPlaying) {
      stopLivePhoto();
      return;
    }

    playLivePhoto();
  };

  const openMobileInspector = () => {
    setActiveTab('info');
    setIsMobileInspectorExpanded(false);
    setIsMobileInspectorOpen(true);
  };

  const slideToIndex = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= totalPhotos) {
        return;
      }

      const swiper = swiperRef.current;

      preloadDetailImageSource(photos[targetIndex]?.src ?? '', 700).catch(
        () => undefined,
      );

      if (swiper && !swiper.destroyed) {
        swiper.slideTo(targetIndex);
        return;
      }

      setViewerIndex(targetIndex);
    },
    [photos, totalPhotos],
  );

  const slideToPhoto = useCallback(
    (targetPhoto: Photo) => {
      const targetIndex = photos.findIndex(
        (item) => item.id === targetPhoto.id,
      );

      if (targetIndex < 0) {
        return;
      }

      slideToIndex(targetIndex);
    },
    [photos, slideToIndex],
  );

  const slideByDirection = useCallback(
    (direction: 'next' | 'previous') => {
      const targetIndex = getDetailViewerNeighborIndex(
        viewerIndex,
        totalPhotos,
        direction,
      );

      if (targetIndex === null) {
        return;
      }

      slideToIndex(targetIndex);
    },
    [slideToIndex, totalPhotos, viewerIndex],
  );

  const handleMobilePhotoGesture = (
    deltaX: number,
    deltaY: number,
    elapsed: number,
  ) => {
    if (isImageZoomed || typeof window === 'undefined') {
      return;
    }

    const isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;

    if (!isMobileViewport || isMobileInspectorOpen) {
      return;
    }

    const now = Date.now();

    if (now - lastMobilePhotoGestureAtRef.current < 450) {
      return;
    }

    const isIntentionalSwipe =
      deltaY <= -MOBILE_INFO_SWIPE_DISTANCE &&
      Math.abs(deltaY) > Math.abs(deltaX) * 1.2 &&
      elapsed < 900;

    if (isIntentionalSwipe) {
      lastMobilePhotoGestureAtRef.current = now;
      openMobileInspector();
    }
  };

  const closeMobileInspector = () => {
    setIsMobileInspectorExpanded(false);
    setIsMobileInspectorOpen(false);
    setIsMobileInspectorDragging(false);
    inspectorHandleDragYRef.current = 0;
  };

  const queueMobileInspectorHeight = (height: number) => {
    inspectorDragHeightRef.current = height;

    if (inspectorDragFrameRef.current) {
      return;
    }

    inspectorDragFrameRef.current = window.requestAnimationFrame(() => {
      inspectorDragFrameRef.current = undefined;
      mobileInspectorRef.current?.style.setProperty(
        '--mobile-inspector-height',
        `${inspectorDragHeightRef.current}px`,
      );
    });
  };

  const settleMobileInspectorHeight = (expanded: boolean) => {
    const targetHeight = expanded
      ? mobileInspectorExpandedHeight
      : mobileInspectorCollapsedHeight;

    window.requestAnimationFrame(() => {
      mobileInspectorRef.current?.style.setProperty(
        '--mobile-inspector-height',
        targetHeight,
      );
    });
  };

  const toggleMobileInspectorHeight = () => {
    if (inspectorHandleDragHandledRef.current) {
      inspectorHandleDragHandledRef.current = false;
      return;
    }

    setIsMobileInspectorExpanded((current) => !current);
  };

  const handleInspectorHandleTouchStart = (
    event: ReactTouchEvent<HTMLButtonElement>,
  ) => {
    if (event.touches.length !== 1) {
      inspectorHandleDragHandledRef.current = false;
      inspectorHandleTouchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];

    if (!touch) {
      inspectorHandleDragHandledRef.current = false;
      inspectorHandleTouchStartRef.current = null;
      return;
    }

    inspectorHandleDragHandledRef.current = false;
    inspectorHandleDragYRef.current = 0;
    const { collapsed, expanded } = getMobileInspectorHeights();
    const startHeight = isMobileInspectorExpanded ? expanded : collapsed;

    inspectorDragHeightRef.current = startHeight;
    mobileInspectorRef.current?.style.setProperty(
      '--mobile-inspector-height',
      `${startHeight}px`,
    );
    inspectorHandleTouchStartRef.current = {
      time: Date.now(),
      x: touch.clientX,
      y: touch.clientY,
    };
    setIsMobileInspectorDragging(true);
  };

  const handleInspectorHandleTouchMove = (
    event: ReactTouchEvent<HTMLButtonElement>,
  ) => {
    const start = inspectorHandleTouchStartRef.current;

    if (!start || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    const deltaY = touch.clientY - start.y;
    const { collapsed, expanded, range } = getMobileInspectorHeights();
    const minDragY = isMobileInspectorExpanded ? 0 : -range;
    const maxDragY = isMobileInspectorExpanded ? range : 0;
    const clampedDragY = Math.min(Math.max(deltaY, minDragY), maxDragY);
    const baseHeight = isMobileInspectorExpanded ? expanded : collapsed;
    const nextHeight = Math.min(
      expanded,
      Math.max(collapsed, baseHeight - clampedDragY),
    );

    inspectorHandleDragYRef.current = clampedDragY;
    queueMobileInspectorHeight(nextHeight);

    if (Math.abs(clampedDragY) > 2) {
      event.preventDefault();
    }
  };

  const handleInspectorHandleTouchEnd = (
    event: ReactTouchEvent<HTMLButtonElement>,
  ) => {
    const start = inspectorHandleTouchStartRef.current;
    const dragY = inspectorHandleDragYRef.current;

    inspectorHandleTouchStartRef.current = null;
    inspectorHandleDragYRef.current = 0;

    if (!start) {
      setIsMobileInspectorDragging(false);
      settleMobileInspectorHeight(isMobileInspectorExpanded);
      return;
    }

    const touch = event.changedTouches[0];

    if (!touch) {
      setIsMobileInspectorDragging(false);
      settleMobileInspectorHeight(isMobileInspectorExpanded);
      return;
    }

    const deltaY = touch.clientY - start.y;
    const elapsed = Math.max(1, Date.now() - start.time);
    const velocityY = deltaY / elapsed;
    const { collapsed, range } = getMobileInspectorHeights();
    const midpoint = collapsed + range * 0.5;
    const currentHeight = inspectorDragHeightRef.current || collapsed;
    let shouldExpand = isMobileInspectorExpanded;

    if (
      !isMobileInspectorExpanded &&
      (dragY <= -MOBILE_INSPECTOR_DRAG_EXPAND_DISTANCE ||
        velocityY <= -MOBILE_INSPECTOR_SWIPE_VELOCITY ||
        currentHeight >= midpoint)
    ) {
      shouldExpand = true;
    } else if (
      isMobileInspectorExpanded &&
      (dragY >= MOBILE_INSPECTOR_DRAG_CLOSE_DISTANCE ||
        velocityY >= MOBILE_INSPECTOR_SWIPE_VELOCITY ||
        currentHeight <= midpoint)
    ) {
      shouldExpand = false;
    }

    if (inspectorDragFrameRef.current) {
      window.cancelAnimationFrame(inspectorDragFrameRef.current);
      inspectorDragFrameRef.current = undefined;
    }

    inspectorHandleDragHandledRef.current = Math.abs(dragY) > 2;
    setIsMobileInspectorExpanded(shouldExpand);
    setIsMobileInspectorDragging(false);
    settleMobileInspectorHeight(shouldExpand);
  };

  const handleInspectorHandleTouchCancel = () => {
    if (inspectorDragFrameRef.current) {
      window.cancelAnimationFrame(inspectorDragFrameRef.current);
      inspectorDragFrameRef.current = undefined;
    }

    inspectorHandleTouchStartRef.current = null;
    inspectorHandleDragYRef.current = 0;
    setIsMobileInspectorDragging(false);
    settleMobileInspectorHeight(isMobileInspectorExpanded);
  };

  const handlePhotoPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    if (!event.isPrimary) {
      photoPointerStartRef.current = null;
      return;
    }

    photoPointerStartRef.current = {
      time: Date.now(),
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePhotoPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    const start = photoPointerStartRef.current;
    photoPointerStartRef.current = null;

    if (!start || !event.isPrimary) {
      return;
    }

    handleMobilePhotoGesture(
      event.clientX - start.x,
      event.clientY - start.y,
      Date.now() - start.time,
    );
  };

  const sharePhoto = () => {
    if (typeof navigator === 'undefined') {
      return;
    }

    const shareUrl = window.location.href;

    if (navigator.share) {
      navigator
        .share({
          title: photoTitle,
          url: shareUrl,
        })
        .catch(() => undefined);
      return;
    }

    navigator.clipboard
      ?.writeText(shareUrl)
      .then(() => setShareStatus('已复制链接'))
      .catch(() => setShareStatus('复制失败'));
  };

  const handleReturnNavigation = (
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => {
    if (typeof window === 'undefined') {
      return;
    }

    event.preventDefault();

    if (
      shouldUseBrowserHistoryForReturn({
        historyLength: window.history.length,
        historyState: window.history.state,
      })
    ) {
      window.history.back();
      return;
    }

    router.replace(returnHref, undefined, { scroll: false }).catch((error) => {
      if (shouldHardNavigateAfterClientRouteFailure(error)) {
        window.location.href = returnHref;
      }
    });
  };

  const handleDetailPhotoLinkNavigation = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    targetPhoto: Photo,
  ) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    slideToPhoto(targetPhoto);
  };

  const scrollFilmstripWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const filmstrip = event.currentTarget;

    if (filmstrip.scrollWidth <= filmstrip.clientWidth) {
      return;
    }

    const scrollDistance =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    if (scrollDistance === 0) {
      return;
    }

    event.preventDefault();
    filmstrip.scrollLeft += scrollDistance;
    setFilmstripPreview(null);
  };

  const showFilmstripPreview = (
    item: Photo,
    itemTitle: string,
    event: ReactSyntheticEvent<HTMLAnchorElement>,
  ) => {
    const photoStage = photoStageRef.current;

    if (!photoStage) {
      return;
    }

    const dimensions = getFilmstripPreviewDimensions(item);
    const stageRect = photoStage.getBoundingClientRect();
    const thumbnailRect = event.currentTarget.getBoundingClientRect();
    const idealLeft =
      thumbnailRect.left -
      stageRect.left +
      thumbnailRect.width / 2 -
      dimensions.width / 2;
    const minLeft = 12;
    const maxLeft = Math.max(minLeft, stageRect.width - dimensions.width - 12);
    const left = Math.min(Math.max(minLeft, idealLeft), maxLeft);

    setFilmstripPreview({
      dimensions,
      left,
      photo: item,
      title: itemTitle,
    });
  };

  return (
    <main className="photo-detail-page h-[100svh] overflow-hidden bg-[#050505] text-stone-100 antialiased lg:h-screen">
      <Meta title={title} description={description} />
      <Head>
        {preloadLinks.map((link) => (
          <link
            key={`${link.rel}-${link.href}`}
            rel={link.rel}
            as="image"
            href={link.href}
          />
        ))}
        {livePhotoVideo ? (
          <link rel="preload" as="video" href={livePhotoVideo.videoUrl} />
        ) : null}
      </Head>

      <div
        className={`photo-detail-layout grid h-full lg:h-screen ${
          isInspectorCollapsed
            ? 'photo-detail-layout-collapsed lg:grid-cols-[minmax(0,1fr)]'
            : 'photo-detail-layout-open lg:grid-cols-[minmax(0,1fr)_408px]'
        }`}
      >
        <section
          ref={photoStageRef}
          className="photo-detail-stage relative h-full min-h-0 overflow-hidden bg-[#0b0807] lg:h-screen"
        >
          {detailBackground.previousSrc ? (
            <img
              key={`previous-${detailBackground.previousSrc}`}
              src={detailBackground.previousSrc}
              alt=""
              aria-hidden="true"
              className="photo-detail-glass-background photo-detail-glass-background-previous"
              style={{ opacity: detailBackground.previousOpacity }}
            />
          ) : null}
          {detailBackground.currentSrc ? (
            <img
              key={`current-${detailBackground.currentSrc}`}
              src={detailBackground.currentSrc}
              alt=""
              aria-hidden="true"
              className="photo-detail-glass-background photo-detail-glass-background-current"
              style={
                {
                  '--detail-background-target-opacity':
                    detailBackground.currentOpacity,
                } as CSSProperties
              }
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-[#fff7ed]/[0.035] backdrop-blur-xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.16)_62%,rgba(0,0,0,0.38)_100%)]" />

          <div className="photo-detail-top-nav absolute left-4 top-4 z-40 hidden items-center gap-2 lg:flex">
            <Link
              href={returnHref}
              onClick={handleReturnNavigation}
              className="grid size-10 place-items-center rounded-full bg-black/45 text-stone-100 ring-1 ring-white/[0.09] backdrop-blur transition hover:bg-[#9db6b0] hover:text-[#17110e]"
              aria-label="Back to gallery"
            >
              <ArrowLeftIcon className="size-5" />
            </Link>
            <div className="min-h-10 rounded-full bg-black/40 px-4 py-2.5 text-sm text-stone-300 ring-1 ring-white/[0.08] backdrop-blur">
              <span className="font-semibold leading-none text-stone-100">
                {photoTitle}
              </span>
              <span className="ml-2 text-xs tabular-nums text-stone-500">
                {activePosition}
              </span>
            </div>
          </div>

          <div className="absolute right-3 top-4 z-40 flex items-center gap-2 lg:right-4">
            {isInspectorCollapsed ? (
              <button
                type="button"
                onClick={() => setIsInspectorCollapsed(false)}
                className="photo-detail-inspector-open hidden size-10 place-items-center rounded-full bg-black/45 text-stone-100 ring-1 ring-white/[0.09] backdrop-blur transition hover:bg-[#9db6b0] hover:text-[#17110e] lg:grid"
                aria-label="Show inspector panel"
                aria-expanded="false"
              >
                <PanelIcon className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={sharePhoto}
              className="grid size-10 place-items-center rounded-full bg-black/30 text-stone-100/80 opacity-70 ring-1 ring-white/[0.06] backdrop-blur transition hover:bg-white/[0.12] hover:text-stone-100 hover:opacity-100 focus-visible:opacity-100"
              aria-label="Share photo"
            >
              <ShareIcon className="size-5" />
            </button>
            <Link
              href={returnHref}
              onClick={handleReturnNavigation}
              className="grid size-10 place-items-center rounded-full bg-black/30 text-stone-100/80 opacity-70 ring-1 ring-white/[0.06] backdrop-blur transition hover:bg-white/[0.12] hover:text-stone-100 hover:opacity-100 focus-visible:opacity-100"
              aria-label="Close photo"
            >
              <CloseIcon className="size-5" />
            </Link>
          </div>

          {shareStatus ? (
            <p className="absolute right-4 top-[136px] z-40 rounded-full bg-black/55 px-3 py-1.5 text-xs text-stone-300 ring-1 ring-white/[0.08] backdrop-blur lg:top-16">
              {shareStatus}
            </p>
          ) : null}

          <figure
            className="absolute inset-x-0 top-0 z-10 flex items-stretch justify-center overflow-hidden px-0"
            style={{ bottom: ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT }}
            onPointerDownCapture={handlePhotoPointerDown}
            onPointerUpCapture={handlePhotoPointerUp}
          >
            <Swiper
              className="size-full"
              initialSlide={viewerIndex}
              modules={[Virtual]}
              resistanceRatio={0.72}
              slidesPerView={1}
              speed={220}
              threshold={4}
              virtual
              onSlideChange={(swiper) => {
                setViewerIndex((currentIndex) =>
                  currentIndex === swiper.activeIndex
                    ? currentIndex
                    : swiper.activeIndex,
                );
              }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
            >
              {photos.map((item, index) => {
                const isActive = index === viewerIndex;
                const itemTitle = getPhotoTitle(item);
                const circularDistance = Math.min(
                  Math.abs(index - viewerIndex),
                  totalPhotos - Math.abs(index - viewerIndex),
                );
                const shouldLoadEagerly = circularDistance <= 2;

                return (
                  <SwiperSlide key={item.id} virtualIndex={index}>
                    <div
                      className="detail-transform-shell relative flex size-full items-center justify-center overflow-hidden opacity-100"
                      data-photo-id={item.id}
                    >
                      {isActive ? (
                        <TransformWrapper
                          initialScale={MIN_DETAIL_ZOOM}
                          minScale={MIN_DETAIL_ZOOM}
                          maxScale={MAX_DETAIL_ZOOM}
                          centerOnInit
                          centerZoomedOut
                          limitToBounds
                          smooth={false}
                          wheel={{
                            step: DETAIL_WHEEL_ZOOM_STEP,
                          }}
                          pinch={{
                            allowPanning: true,
                            step: 5,
                          }}
                          panning={{
                            disabled: !isImageZoomed,
                            velocityDisabled: false,
                          }}
                          doubleClick={{
                            animationTime: 180,
                            animationType: 'easeOut',
                            mode: 'toggle',
                            step: DETAIL_DOUBLE_CLICK_ZOOM_STEP,
                          }}
                          onTransform={(_ref, state) => {
                            const nextIsZoomed = state.scale > 1.01;

                            setIsImageZoomed((current) =>
                              current === nextIsZoomed ? current : nextIsZoomed,
                            );
                          }}
                        >
                          {({ resetTransform }) => (
                            <>
                              <DetailTransformResetter
                                photoId={photo.id}
                                resetTransform={resetTransform}
                              />
                              <TransformComponent
                                wrapperClass="!relative !h-full !w-full"
                                contentClass="!relative !flex !h-full !w-full !items-center !justify-center"
                                wrapperStyle={{
                                  cursor: isImageZoomed ? 'grab' : 'zoom-in',
                                  overflow: 'hidden',
                                  touchAction: isImageZoomed
                                    ? 'none'
                                    : 'pan-y pinch-zoom',
                                }}
                                contentStyle={{
                                  alignItems: 'center',
                                  height: '100%',
                                  justifyContent: 'center',
                                  width: '100%',
                                }}
                              >
                                <div
                                  ref={isActive ? detailImageFrameRef : null}
                                  className="relative size-full"
                                >
                                  {detailImage.loading && photo.thumbnail ? (
                                    <img
                                      src={photo.thumbnail}
                                      alt=""
                                      aria-hidden="true"
                                      draggable={false}
                                      className="absolute inset-0 z-0 size-full select-none object-contain shadow-2xl shadow-black/45"
                                    />
                                  ) : null}
                                  <img
                                    src={photo.src}
                                    alt={photoTitle}
                                    loading="eager"
                                    decoding="async"
                                    draggable={false}
                                    onError={() =>
                                      handleDetailImagePainted(photo.src)
                                    }
                                    onLoad={() =>
                                      handleDetailImagePainted(photo.src)
                                    }
                                    className="absolute inset-0 z-10 size-full select-none object-contain shadow-2xl shadow-black/45"
                                  />
                                  {livePhotoVideo ? (
                                    <video
                                      ref={livePhotoVideoRef}
                                      src={livePhotoVideo.videoUrl}
                                      aria-label={`${photoTitle} live photo video`}
                                      className={`pointer-events-none absolute inset-0 z-20 size-full select-none object-contain transition-opacity duration-150 ${
                                        isLivePhotoPlaying
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      }`}
                                      muted
                                      playsInline
                                      preload="metadata"
                                      onEnded={stopLivePhoto}
                                    />
                                  ) : null}
                                </div>
                                {detailImage.loading ? (
                                  <div
                                    className="pointer-events-none absolute bottom-4 right-4 z-30 grid size-9 place-items-center text-stone-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]"
                                    aria-hidden="true"
                                  >
                                    <svg
                                      viewBox="0 0 36 36"
                                      className="absolute inset-0 size-full -rotate-90"
                                    >
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="15.5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.4"
                                        className="text-white/25"
                                      />
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="15.5"
                                        fill="none"
                                        pathLength={100}
                                        stroke="currentColor"
                                        strokeDasharray={100}
                                        strokeDashoffset={
                                          100 - detailImage.progress
                                        }
                                        strokeLinecap="round"
                                        strokeWidth="2.4"
                                        className="text-[#c5dfd8]"
                                      />
                                    </svg>
                                    <span className="relative text-xs font-semibold tabular-nums">
                                      {detailImage.progress}
                                    </span>
                                  </div>
                                ) : null}
                              </TransformComponent>
                              {livePhotoVideo ? (
                                <button
                                  type="button"
                                  onFocus={playLivePhoto}
                                  onBlur={stopLivePhoto}
                                  onClick={toggleLivePhoto}
                                  onMouseEnter={playLivePhoto}
                                  onMouseLeave={stopLivePhoto}
                                  onPointerDown={playLivePhoto}
                                  onPointerUp={stopLivePhoto}
                                  onPointerCancel={stopLivePhoto}
                                  className={`absolute left-4 z-20 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 backdrop-blur transition ${
                                    isLivePhotoPlaying
                                      ? 'bg-[#9db6b0] text-[#17110e] ring-white/[0.18]'
                                      : 'bg-black/45 text-stone-200 ring-white/[0.08] hover:bg-white/[0.10]'
                                  }`}
                                  style={{ bottom: 14 }}
                                  aria-label={
                                    isLivePhotoPlaying
                                      ? 'Stop live photo'
                                      : 'Play live photo'
                                  }
                                >
                                  实况
                                </button>
                              ) : null}
                            </>
                          )}
                        </TransformWrapper>
                      ) : (
                        <img
                          src={item.src || item.thumbnail}
                          alt={itemTitle}
                          draggable={false}
                          loading={shouldLoadEagerly ? 'eager' : 'lazy'}
                          decoding="async"
                          className="size-full select-none object-contain shadow-2xl shadow-black/45"
                        />
                      )}
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </figure>

          {previousPhoto ? (
            <Link
              href={previousPhotoHref}
              replace={hasReturnSource}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                ) {
                  return;
                }

                event.preventDefault();
                slideByDirection('previous');
              }}
              aria-label={`Previous photo: ${getPhotoTitle(previousPhoto)}`}
              className="absolute left-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-stone-100 ring-1 ring-white/[0.11] backdrop-blur transition hover:bg-white/[0.12] hover:text-stone-100 sm:inline-flex"
            >
              <ArrowLeftIcon className="size-6" />
            </Link>
          ) : null}

          {nextPhoto ? (
            <Link
              href={nextPhotoHref}
              replace={hasReturnSource}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                ) {
                  return;
                }

                event.preventDefault();
                slideByDirection('next');
              }}
              aria-label={`Next photo: ${getPhotoTitle(nextPhoto)}`}
              className="absolute right-3 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-stone-100 ring-1 ring-white/[0.11] backdrop-blur transition hover:bg-white/[0.12] hover:text-stone-100 sm:inline-flex"
            >
              <ArrowRightIcon className="size-6" />
            </Link>
          ) : null}

          {shouldShowMobileDetailDrawerButton(isMobileInspectorOpen) ? (
            <button
              type="button"
              onClick={openMobileInspector}
              className="absolute z-50 grid size-10 place-items-center rounded-full bg-black/30 text-stone-100/80 opacity-75 ring-1 ring-white/[0.06] backdrop-blur transition hover:bg-white/[0.12] hover:text-stone-100 hover:opacity-100 focus-visible:opacity-100 lg:hidden"
              style={{
                bottom: getMobileDetailDrawerButtonBottom(
                  ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT,
                ),
                left: 'max(1rem, env(safe-area-inset-left))',
              }}
              aria-controls="photo-mobile-inspector"
              aria-expanded={isMobileInspectorOpen}
              aria-label="打开照片详情"
              title="详情"
            >
              <InfoIcon className="size-5" />
            </button>
          ) : null}

          {filmstripPreview ? (
            <div
              aria-hidden="true"
              data-qa="filmstrip-preview"
              className="pointer-events-none absolute z-50 overflow-hidden rounded-md border border-white/[0.10] bg-[#f7f2ec]/[0.12] p-[2px] shadow-2xl shadow-black/35 backdrop-blur-xl backdrop-saturate-150"
              style={{
                bottom: ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT + 12,
                height: filmstripPreview.dimensions.height,
                left: filmstripPreview.left,
                width: filmstripPreview.dimensions.width,
              }}
            >
              <img
                src={
                  filmstripPreview.photo.thumbnail || filmstripPreview.photo.src
                }
                alt=""
                aria-hidden="true"
                className="size-full rounded-[4px] object-cover"
              />
            </div>
          ) : null}

          <div
            data-qa="filmstrip-shell"
            className="absolute inset-x-0 bottom-0 z-40 border-t border-white/[0.09] bg-[#f7f2ec]/[0.08] shadow-[0_-18px_52px_rgba(247,242,236,0.08)] backdrop-blur-2xl"
            style={{ height: ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT }}
          >
            <div
              ref={filmstripRef}
              data-qa="filmstrip"
              onScroll={() => setFilmstripPreview(null)}
              onWheel={scrollFilmstripWithWheel}
              className="no-scrollbar flex h-full items-end overflow-x-auto overflow-y-hidden"
            >
              {filmstripPhotos.map((item) => {
                const itemTitle = getPhotoTitle(item);
                const isActive = item.id === photo.id;
                const thumbnailHeight = isActive
                  ? ACTIVE_FILMSTRIP_THUMBNAIL_HEIGHT
                  : DEFAULT_FILMSTRIP_THUMBNAIL_HEIGHT;
                const thumbnailWidth = getFilmstripThumbnailWidth(
                  item,
                  thumbnailHeight,
                );

                return (
                  <Link
                    key={item.id}
                    ref={isActive ? activeFilmstripItemRef : undefined}
                    href={buildSiblingPhotoHref(item.id)}
                    replace={hasReturnSource}
                    aria-label={`Open ${itemTitle}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(event) => {
                      if (!isActive) {
                        handleDetailPhotoLinkNavigation(event, item);
                      }
                    }}
                    onBlur={() => setFilmstripPreview(null)}
                    onFocus={(event) =>
                      showFilmstripPreview(item, itemTitle, event)
                    }
                    onMouseEnter={(event) =>
                      showFilmstripPreview(item, itemTitle, event)
                    }
                    onMouseLeave={() => setFilmstripPreview(null)}
                    className={`group relative shrink-0 overflow-hidden bg-black/25 shadow-[inset_0_0_0_0.35px_rgba(255,255,255,0.12)] outline-none transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9db6b0] ${
                      isActive ? 'z-10' : ''
                    }`}
                    style={{
                      height: thumbnailHeight,
                      width: thumbnailWidth,
                    }}
                  >
                    <img
                      src={item.thumbnail || item.src}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className={`size-full object-cover transition duration-200 ease-out group-hover:scale-[1.035] ${getFilmstripImageToneClass(
                        isActive,
                      )}`}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {isMobileInspectorOpen ? (
          <div
            id="photo-mobile-inspector"
            ref={mobileInspectorRef}
            className={`photo-mobile-inspector fixed inset-x-0 bottom-0 z-[60] flex max-h-[calc(100svh-32px)] flex-col overflow-hidden rounded-t-[28px] border border-white/[0.13] bg-[#211b17]/[0.82] text-stone-100 shadow-[0_-24px_70px_rgba(0,0,0,0.44)] backdrop-blur-2xl backdrop-brightness-105 backdrop-saturate-150 lg:hidden ${
              isMobileInspectorDragging
                ? 'transition-none'
                : 'transition-[height] duration-200 ease-out'
            }`}
            style={
              {
                '--mobile-inspector-height': mobileInspectorHeight,
                height: 'var(--mobile-inspector-height)',
              } as CSSProperties
            }
            role="region"
            aria-label="Photo information"
          >
            <button
              type="button"
              onClick={toggleMobileInspectorHeight}
              onTouchStart={handleInspectorHandleTouchStart}
              onTouchMove={handleInspectorHandleTouchMove}
              onTouchEnd={handleInspectorHandleTouchEnd}
              onTouchCancel={handleInspectorHandleTouchCancel}
              className="flex shrink-0 touch-none justify-center pb-4 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
              aria-label={
                isMobileInspectorExpanded
                  ? 'Collapse photo information'
                  : 'Expand photo information'
              }
              aria-expanded={isMobileInspectorExpanded}
            >
              <span className="h-1.5 w-16 rounded-full bg-white/20" />
            </button>

            <div className="flex shrink-0 items-center gap-3 px-6 pb-3">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 border-b border-white/[0.12]">
                <button
                  type="button"
                  aria-pressed={activeTab === 'info'}
                  onClick={() => setActiveTab('info')}
                  className={`flex items-center justify-center gap-2 px-2 pb-3 text-sm font-semibold transition ${
                    activeTab === 'info'
                      ? 'border-b border-white/45 text-white'
                      : 'border-b border-transparent text-stone-300 hover:text-white'
                  }`}
                >
                  <InfoIcon className="size-4" />
                  Info
                </button>
                <button
                  type="button"
                  aria-pressed={activeTab === 'comments'}
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center justify-center gap-2 px-2 pb-3 text-sm font-semibold transition ${
                    activeTab === 'comments'
                      ? 'border-b border-white/45 text-white'
                      : 'border-b border-transparent text-stone-300 hover:text-white'
                  }`}
                >
                  <CommentIcon className="size-4" />
                  Comments
                </button>
              </div>

              <button
                type="button"
                onClick={closeMobileInspector}
                className="grid size-9 shrink-0 place-items-center rounded-full text-stone-200 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Close photo information"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {activeTab === 'info' ? (
                <AfilmoryInfoPanel photo={photo} manifestItem={photoManifest} />
              ) : (
                <PhotoCommentsPanel className="min-h-0 flex-1 border-t-0 bg-transparent" />
              )}
            </div>
          </div>
        ) : null}

        {!isInspectorCollapsed ? (
          <aside className="photo-detail-inspector bg-[#171719]/78 hidden min-h-[520px] flex-col border-t border-white/[0.08] shadow-2xl shadow-black/40 backdrop-blur-2xl lg:flex lg:h-screen lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] p-4">
              <div className="inline-flex rounded-lg bg-white/[0.055] p-1 ring-1 ring-white/[0.07]">
                <button
                  type="button"
                  aria-pressed={activeTab === 'info'}
                  onClick={() => setActiveTab('info')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    activeTab === 'info'
                      ? 'bg-white/[0.10] text-stone-100'
                      : 'text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
                  }`}
                >
                  信息
                </button>
                <button
                  type="button"
                  aria-pressed={activeTab === 'comments'}
                  onClick={() => setActiveTab('comments')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    activeTab === 'comments'
                      ? 'bg-white/[0.10] text-stone-100'
                      : 'text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
                  }`}
                >
                  评论
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsInspectorCollapsed(true)}
                className="grid size-9 place-items-center rounded-full bg-white/[0.055] text-stone-400 ring-1 ring-white/[0.07] transition hover:bg-white/[0.10] hover:text-stone-100"
                aria-label="Hide inspector panel"
                aria-expanded="true"
              >
                <PanelIcon className="size-4" />
              </button>
            </div>

            {activeTab === 'info' ? (
              <AfilmoryInfoPanel photo={photo} manifestItem={photoManifest} />
            ) : (
              <PhotoCommentsPanel className="min-h-0 flex-1 border-t-0" />
            )}
          </aside>
        ) : null}

        {detailEntryTransition ? (
          <img
            src={detailEntryTransition.imageSrc}
            alt={detailEntryTransition.alt}
            aria-hidden="true"
            draggable={false}
            data-phase={detailEntryTransition.phase}
            className="gallery-detail-entry-transition pointer-events-none fixed left-0 top-0 z-[90] select-none object-cover"
            style={detailEntryTransitionStyle}
          />
        ) : null}
      </div>
      <style jsx global>{`
        @media (orientation: landscape) and (min-height: 621px) and (max-width: 1023px) {
          .photo-detail-page {
            height: 100svh !important;
            overflow: hidden !important;
          }

          .photo-detail-layout {
            height: 100svh !important;
          }

          .photo-detail-layout.photo-detail-layout-open {
            grid-template-columns: minmax(0, 1fr) minmax(280px, 34vw) !important;
          }

          .photo-detail-layout.photo-detail-layout-collapsed {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .photo-detail-stage {
            height: 100svh !important;
          }

          .photo-detail-top-nav {
            display: flex !important;
          }

          .photo-detail-inspector-open {
            display: grid !important;
          }

          .photo-mobile-inspector {
            display: none !important;
          }

          .photo-detail-inspector {
            border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-top: 0 !important;
            display: flex !important;
            height: 100svh !important;
            min-height: 0 !important;
          }
        }

        @media (orientation: landscape) and (min-height: 621px) and (max-width: 1023px) {
          .photo-detail-layout.photo-detail-layout-open {
            grid-template-columns: minmax(0, 1fr) minmax(252px, 32vw) !important;
          }

          .photo-detail-inspector > div:first-child {
            padding: 10px 12px !important;
          }
        }

        .gallery-detail-entry-transition {
          border-radius: 3px;
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.42);
          opacity: 1;
          transform-origin: left top;
          transition:
            transform ${GALLERY_DETAIL_TRANSITION_DURATION_MS}ms
              cubic-bezier(0.16, 1, 0.3, 1),
            width ${GALLERY_DETAIL_TRANSITION_DURATION_MS}ms
              cubic-bezier(0.16, 1, 0.3, 1),
            height ${GALLERY_DETAIL_TRANSITION_DURATION_MS}ms
              cubic-bezier(0.16, 1, 0.3, 1),
            border-radius ${GALLERY_DETAIL_TRANSITION_DURATION_MS}ms
              cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow ${GALLERY_DETAIL_TRANSITION_DURATION_MS}ms
              cubic-bezier(0.16, 1, 0.3, 1),
            opacity 110ms ease;
          will-change: transform, width, height, opacity;
        }

        .gallery-detail-entry-transition[data-phase='end'] {
          border-radius: 0;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
        }

        .gallery-detail-entry-transition[data-phase='fade'] {
          border-radius: 0;
          opacity: 0;
        }
      `}</style>
    </main>
  );
};

export default PhotoPage;
