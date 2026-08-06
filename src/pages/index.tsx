/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Meta } from '@/layout/Meta';
import {
  createGalleryDetailTransitionPayload,
  GALLERY_DETAIL_TRANSITION_STORAGE_KEY,
} from '@/lib/galleryDetailTransition';
import { getOrderedGalleryPhotos } from '@/lib/galleryOrdering';
import {
  getGalleryLoadRootMargin,
  getInitialGalleryRenderLimit,
  getNextGalleryRenderLimit,
  shouldRenderGalleryLoadSentinel,
} from '@/lib/galleryRenderWindow';
import {
  buildHomeSearchOptions,
  filterHomePhotos,
  type HomeSearchOption,
  type HomeSearchTagMode,
} from '@/lib/homeSearch';
import { isRenderableImageComplete } from '@/lib/imageLoadState';
import {
  buildMasonryColumns,
  getMasonryColumnCount,
  getMasonryColumnKey,
  normalizeMasonryContainerWidth,
} from '@/lib/masonry';
import {
  buildPhotoDetailHref,
  createGalleryScrollSnapshot,
  GALLERY_SCROLL_STORAGE_KEY,
  readGalleryScrollSnapshot,
  readGalleryWidthSnapshot,
} from '@/lib/navigation';
import {
  buildCategoryList,
  formatCategoryLabel,
  type Photo,
  type PhotoSortMode,
} from '@/lib/photos';
import { PUBLIC_GALLERY_CACHE_CONTROL } from '@/lib/server/cacheHeaders';
import {
  isSlideMobileViewport,
  isWeChatBrowser,
  requestSlideFullscreen,
  requestSlideLandscape,
} from '@/lib/slideOrientation';
import { AppConfig } from '@/utils/AppConfig';

type IndexProps = {
  initialCategory: string;
  initialSortMode: PhotoSortMode;
  photos: Photo[];
  loadError: string;
  randomSeed: number;
};

const NAV_LINKS = [
  { href: '/blog', label: 'Blog' },
  { href: '/projects', label: 'Projects' },
  { href: '/links', label: 'Links' },
  { href: '/about', label: 'About' },
];

type CategoryButtonProps = {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
};

type ProofPhotoCardProps = {
  index: number;
  onOpenPhoto: () => void;
  photo: Photo;
  returnHref: string;
};

type SearchDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onRemoveTag: (tag: string) => void;
  onReset: () => void;
  onSelectOption: (option: HomeSearchOption) => void;
  onTagModeChange: (mode: HomeSearchTagMode) => void;
  options: HomeSearchOption[];
  query: string;
  resultCount: number;
  selectedTags: string[];
  tagMode: HomeSearchTagMode;
};

const INITIAL_GALLERY_WIDTH = 1920;
const PROOF_IMAGE_SIZES =
  '(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 17vw';

const createRandomSeed = () =>
  Date.now() + Math.floor(Math.random() * 2147483647);

const getPhotoAspectRatio = (photo: Photo) => {
  if (photo.width > 0 && photo.height > 0) {
    return `${photo.width} / ${photo.height}`;
  }

  return '3 / 2';
};

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getInitialSortMode = (
  value: string | string[] | undefined,
): PhotoSortMode => (getQueryValue(value) === 'latest' ? 'latest' : 'random');

const getInitialCategory = (
  value: string | string[] | undefined,
  photos: Photo[],
) => {
  const category = getQueryValue(value);

  if (!category || category === 'all') {
    return 'all';
  }

  return photos.some((photo) => photo.category === category) ? category : 'all';
};

const getInitialSeed = (value: string | string[] | undefined) => {
  const seed = Number.parseInt(getQueryValue(value) ?? '', 10);

  return Number.isFinite(seed) && seed > 0 ? seed : createRandomSeed();
};

const buildGalleryHref = ({
  category,
  seed,
  sortMode,
}: {
  category: string;
  seed: number;
  sortMode: PhotoSortMode;
}) => {
  const params = new URLSearchParams({
    sort: sortMode,
  });

  if (category !== 'all') {
    params.set('category', category);
  }

  if (sortMode === 'random') {
    params.set('seed', String(seed));
  }

  return `/?${params.toString()}`;
};

const getInitialGalleryWidth = ({
  category,
  seed,
  sortMode,
}: {
  category: string;
  seed: number;
  sortMode: PhotoSortMode;
}) => {
  if (typeof window === 'undefined') {
    return INITIAL_GALLERY_WIDTH;
  }

  const href = buildGalleryHref({ category, seed, sortMode });
  const viewportWidth = normalizeMasonryContainerWidth(
    window.innerWidth || INITIAL_GALLERY_WIDTH,
  );

  return (
    readGalleryWidthSnapshot(
      window.sessionStorage.getItem(GALLERY_SCROLL_STORAGE_KEY),
      href,
    ) ?? viewportWidth
  );
};

const getGalleryRenderWidthBand = (galleryWidth: number) => {
  if (galleryWidth >= 1024) {
    return 'desktop';
  }

  if (galleryWidth >= 768) {
    return 'tablet';
  }

  return 'mobile';
};

const CategoryButton = ({
  active,
  count,
  label,
  onClick,
}: CategoryButtonProps) => (
  <button
    type="button"
    aria-label={`${label}, ${count} photos`}
    aria-pressed={active}
    onClick={onClick}
    className={`group inline-flex shrink-0 items-center gap-2 rounded-full py-2 pl-3.5 pr-2.5 text-sm font-medium transition sm:pl-4 ${
      active
        ? 'bg-[#9db6b0] text-[#15110e]'
        : 'bg-white/[0.055] text-stone-300 ring-1 ring-white/[0.06] hover:bg-white/[0.09] hover:text-stone-100'
    }`}
  >
    <span>{label}</span>
    <span
      className={`rounded-full px-2 py-0.5 text-xs tabular-nums transition ${
        active
          ? 'bg-[#17110e]/15 text-[#17110e]'
          : 'bg-white/[0.06] text-stone-500 group-hover:text-stone-300'
      }`}
    >
      {count}
    </span>
  </button>
);

type StatusPanelProps = {
  title: string;
  message: string;
};

const StatusPanel = ({ title, message }: StatusPanelProps) => (
  <div className="mx-auto max-w-xl py-14 text-center">
    <h2 className="text-lg font-medium text-stone-200">{title}</h2>
    <p className="mt-3 text-sm leading-6 text-stone-500">{message}</p>
  </div>
);

const SortModeButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
      active
        ? 'bg-[#9db6b0] text-[#17110e]'
        : 'text-stone-400 hover:bg-white/[0.05] hover:text-stone-100'
    }`}
  >
    {label}
  </button>
);

const getSearchOptionLabel = (option: HomeSearchOption) =>
  option.kind === 'category' ? formatCategoryLabel(option.label) : option.label;

const getSearchOptionDescription = (kind: HomeSearchOption['kind']) => {
  if (kind === 'category') {
    return 'Category filter';
  }

  if (kind === 'location') {
    return 'Location filter';
  }

  return 'Tag filter';
};

const TagIcon = ({ className = 'size-5' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
  >
    <path d="M20 10.5 13.5 4H5v8.5L11.5 19a2.1 2.1 0 0 0 3 0l5.5-5.5a2.1 2.1 0 0 0 0-3Z" />
    <circle cx="9" cy="8" r="1.2" />
  </svg>
);

const SearchDialog = ({
  isOpen,
  onClose,
  onQueryChange,
  onRemoveTag,
  onReset,
  onSelectOption,
  onTagModeChange,
  options,
  query,
  resultCount,
  selectedTags,
  tagMode,
}: SearchDialogProps) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const selectedTagSet = new Set(selectedTags);

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-2 pb-2 pt-16 backdrop-blur-xl sm:px-4 sm:pb-4"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            onClose();
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Search photos"
          className="home-search-sheet flex max-h-[min(82vh,760px)] w-full max-w-[900px] flex-col overflow-hidden rounded-t-[28px] border border-white/[0.13] bg-[#211b17]/[0.84] text-stone-100 shadow-[0_-24px_70px_rgba(0,0,0,0.44)] backdrop-blur-2xl backdrop-brightness-105 backdrop-saturate-150 sm:rounded-[28px]"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-3 h-1.5 w-16 shrink-0 rounded-full bg-white/20"
          />
          <div className="flex items-center gap-3 border-b border-white/[0.1] px-5 pb-4 pt-3">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5 shrink-0 text-stone-400"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search photos..."
              className="min-w-0 flex-1 bg-transparent text-lg font-medium text-stone-100 outline-none placeholder:text-stone-500"
            />
            <button
              type="button"
              onClick={onReset}
              className="hidden rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-stone-300 transition hover:border-[#9db6b0]/45 hover:bg-[#9db6b0]/10 hover:text-[#dce9e5] sm:inline-flex"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-stone-300 transition hover:border-[#9db6b0]/45 hover:bg-[#9db6b0]/10 hover:text-[#dce9e5]"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.035] px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-400">
              <TagIcon className="size-4" />
              <span>Match:</span>
            </div>
            <div className="inline-flex rounded-full bg-white/[0.05] p-1 ring-1 ring-white/[0.07]">
              <button
                type="button"
                aria-pressed={tagMode === 'any'}
                onClick={() => onTagModeChange('any')}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  tagMode === 'any'
                    ? 'bg-[#9db6b0] text-[#17110e]'
                    : 'text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
                }`}
              >
                Any tag
              </button>
              <button
                type="button"
                aria-pressed={tagMode === 'all'}
                onClick={() => onTagModeChange('all')}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  tagMode === 'all'
                    ? 'bg-[#9db6b0] text-[#17110e]'
                    : 'text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
                }`}
              >
                All tags
              </button>
            </div>
          </div>

          {selectedTags.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-b border-white/[0.05] px-5 py-3">
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className="hover:bg-[#9db6b0]/22 inline-flex items-center gap-2 rounded-full bg-[#9db6b0]/15 px-3 py-1.5 text-sm font-semibold text-[#c8dbd6] ring-1 ring-[#9db6b0]/25 transition"
                >
                  <span>{formatCategoryLabel(tag)}</span>
                  <span aria-hidden="true" className="text-stone-400">
                    x
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
            {options.map((option) => {
              const selected = selectedTagSet.has(option.value);

              return (
                <button
                  key={`${option.kind}-${option.value}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectOption(option)}
                  className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition ${
                    selected
                      ? 'bg-[#9db6b0]/[0.14]'
                      : 'hover:bg-white/[0.045] focus:bg-white/[0.06]'
                  }`}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-stone-400 ring-1 ring-white/[0.06]">
                    <TagIcon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-stone-100">
                      {getSearchOptionLabel(option)}
                    </span>
                    <span className="mt-1 block text-sm text-stone-500">
                      {getSearchOptionDescription(option.kind)}
                    </span>
                  </span>
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold tabular-nums text-stone-400">
                    {option.count}
                  </span>
                </button>
              );
            })}
          </div>

          <footer className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 text-sm text-stone-500">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-md border border-[#2f5f82]/60 px-1.5 py-0.5 text-xs text-[#9db6b0]">
                  ↑↓
                </span>
                Navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-md border border-[#2f5f82]/60 px-1.5 py-0.5 text-xs text-[#9db6b0]">
                  ↵
                </span>
                Select
              </span>
            </div>
            <span className="font-semibold tabular-nums text-stone-400">
              {resultCount} results
            </span>
          </footer>
        </section>
      </div>
      <style jsx global>{`
        @keyframes home-search-sheet-in {
          from {
            opacity: 0;
            transform: translate3d(0, 22px, 0) scale(0.985);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        .home-search-sheet {
          animation: home-search-sheet-in 220ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }
      `}</style>
    </>
  );
};

const ProofPhotoCard = ({
  index,
  onOpenPhoto,
  photo,
  returnHref,
}: ProofPhotoCardProps) => {
  const [imageSource, setImageSource] = useState(photo.thumbnail || photo.src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const eager = index < 4;

  const syncLoadedImageState = useCallback(() => {
    if (isRenderableImageComplete(imageRef.current)) {
      setLoaded(true);
    }
  }, []);

  const setImageElement = useCallback(
    (element: HTMLImageElement | null) => {
      imageRef.current = element;
      syncLoadedImageState();
    },
    [syncLoadedImageState],
  );

  useEffect(() => {
    setImageSource(photo.thumbnail || photo.src);
    setFailed(false);
    setLoaded(false);
  }, [photo.src, photo.thumbnail]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(syncLoadedImageState);
    window.addEventListener('pageshow', syncLoadedImageState);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pageshow', syncLoadedImageState);
    };
  }, [imageSource, syncLoadedImageState]);

  const handleImageError = () => {
    if (imageSource !== photo.src) {
      setImageSource(photo.src);
      return;
    }

    setFailed(true);
  };

  const handleOpenPhotoClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    onOpenPhoto();

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const sourceElement = imageRef.current ?? event.currentTarget;
    const sourceRect = sourceElement.getBoundingClientRect();
    const payload = createGalleryDetailTransitionPayload({
      imageSrc:
        imageRef.current?.currentSrc ||
        imageRef.current?.src ||
        photo.thumbnail ||
        photo.src,
      now: Date.now(),
      photoId: photo.id,
      rect: {
        height: sourceRect.height,
        left: sourceRect.left,
        top: sourceRect.top,
        width: sourceRect.width,
      },
    });

    if (!payload) {
      window.sessionStorage.removeItem(GALLERY_DETAIL_TRANSITION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      GALLERY_DETAIL_TRANSITION_STORAGE_KEY,
      JSON.stringify(payload),
    );
  };

  return (
    <Link
      href={buildPhotoDetailHref(photo.id, returnHref)}
      prefetch={false}
      onClick={handleOpenPhotoClick}
      onPointerDown={onOpenPhoto}
      onTouchStart={onOpenPhoto}
      className="proof-photo-card group relative block w-full break-inside-avoid overflow-hidden rounded-[3px] bg-white/[0.025] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_52px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
      style={{
        aspectRatio: getPhotoAspectRatio(photo),
      }}
      aria-label={`Open ${photo.title}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden transition-opacity duration-500 ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {photo.thumbnail ? (
          <img
            src={photo.thumbnail}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="saturate-125 absolute inset-0 size-full scale-105 object-cover opacity-75 blur-lg"
          />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(237,244,241,0.46)_0%,rgba(185,204,198,0.34)_48%,rgba(92,77,66,0.16)_100%)]" />
        )}
        <span className="absolute inset-0 bg-[#f7f2ec]/[0.08] backdrop-blur-md" />
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16)_0%,rgba(157,182,176,0.09)_48%,rgba(24,19,15,0.04)_100%)]" />
        <span className="absolute inset-0 animate-pulse bg-white/[0.025]" />
      </span>
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.04),rgba(157,182,176,0.05),rgba(0,0,0,0.025))] transition-opacity duration-500 ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {!failed ? (
        <img
          ref={setImageElement}
          src={imageSource}
          alt={photo.title}
          width={photo.width || undefined}
          height={photo.height || undefined}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          sizes={PROOF_IMAGE_SIZES}
          onError={handleImageError}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.02] group-hover:brightness-110 ${
            loaded ? 'blur-0' : 'scale-[1.02] blur-sm'
          }`}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-stone-500">
          Image unavailable
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#18130f]/75 to-transparent px-3 pb-3 pt-10 text-xs font-medium text-stone-100 opacity-0 transition duration-300 group-hover:opacity-100">
        {photo.title}
      </span>
    </Link>
  );
};

export const getServerSideProps: GetServerSideProps<IndexProps> = async ({
  query,
  res,
}) => {
  res.setHeader('Cache-Control', PUBLIC_GALLERY_CACHE_CONTROL);

  try {
    const { fetchManagedPhotoSet } = await import(
      '@/lib/server/photoCmsManifest'
    );
    const { photos } = await fetchManagedPhotoSet();

    return {
      props: {
        initialCategory: getInitialCategory(query.category, photos),
        initialSortMode: getInitialSortMode(query.sort),
        photos,
        loadError: '',
        randomSeed: getInitialSeed(query.seed),
      },
    };
  } catch (error) {
    return {
      props: {
        initialCategory: 'all',
        initialSortMode: getInitialSortMode(query.sort),
        photos: [],
        loadError:
          error instanceof Error
            ? error.message
            : 'Could not load remote photo data.',
        randomSeed: getInitialSeed(query.seed),
      },
    };
  }
};

const Index: NextPage<IndexProps> = ({
  initialCategory,
  initialSortMode,
  photos,
  loadError,
  randomSeed: initialRandomSeed,
}) => {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [sortMode, setSortMode] = useState<PhotoSortMode>(initialSortMode);
  const [randomSeed, setRandomSeed] = useState(initialRandomSeed);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchTags, setSelectedSearchTags] = useState<string[]>([]);
  const [searchTagMode, setSearchTagMode] = useState<HomeSearchTagMode>('any');
  const categoriesRef = useRef<HTMLDivElement | null>(null);
  const galleryLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const galleryRenderResetKeyRef = useRef('');
  const slideFullscreenPrepareTried = useRef(false);
  const [galleryWidth, setGalleryWidth] = useState(() =>
    getInitialGalleryWidth({
      category: initialCategory,
      seed: initialRandomSeed,
      sortMode: initialSortMode,
    }),
  );
  const router = useRouter();

  const categories = useMemo(() => buildCategoryList(photos), [photos]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    photos.forEach((photo) => {
      counts[photo.category] = (counts[photo.category] ?? 0) + 1;
    });

    return counts;
  }, [photos]);

  const categoryFilteredPhotos = useMemo(
    () =>
      getOrderedGalleryPhotos({
        category: activeCategory,
        photos,
        seed: randomSeed,
        sortMode,
      }),
    [activeCategory, photos, randomSeed, sortMode],
  );

  const visiblePhotos = useMemo(
    () =>
      filterHomePhotos(categoryFilteredPhotos, {
        query: searchQuery,
        selectedTags: selectedSearchTags,
        tagMode: searchTagMode,
      }),
    [categoryFilteredPhotos, searchQuery, searchTagMode, selectedSearchTags],
  );

  const currentGalleryHref = useMemo(
    () =>
      buildGalleryHref({
        category: activeCategory,
        seed: randomSeed,
        sortMode,
      }),
    [activeCategory, randomSeed, sortMode],
  );

  const [galleryRenderLimit, setGalleryRenderLimit] = useState(() =>
    getInitialGalleryRenderLimit(galleryWidth, visiblePhotos.length),
  );
  const galleryRenderWidthBand = getGalleryRenderWidthBand(galleryWidth);

  const galleryRenderResetKey = useMemo(
    () =>
      [
        activeCategory,
        galleryRenderWidthBand,
        sortMode,
        randomSeed,
        searchQuery.trim(),
        selectedSearchTags.join('\0'),
        searchTagMode,
      ].join('|'),
    [
      activeCategory,
      galleryRenderWidthBand,
      randomSeed,
      searchQuery,
      searchTagMode,
      selectedSearchTags,
      sortMode,
    ],
  );

  const getGalleryInitialRenderLimitForState = useCallback(() => {
    const restoreScrollY =
      typeof window === 'undefined'
        ? null
        : readGalleryScrollSnapshot(
            window.sessionStorage.getItem(GALLERY_SCROLL_STORAGE_KEY),
            currentGalleryHref,
          );

    if (restoreScrollY !== null && restoreScrollY > 0) {
      return visiblePhotos.length;
    }

    return getInitialGalleryRenderLimit(galleryWidth, visiblePhotos.length);
  }, [currentGalleryHref, galleryWidth, visiblePhotos.length]);

  const renderedVisiblePhotos = useMemo(
    () => visiblePhotos.slice(0, galleryRenderLimit),
    [galleryRenderLimit, visiblePhotos],
  );

  const canRenderMoreGalleryPhotos = shouldRenderGalleryLoadSentinel(
    galleryRenderLimit,
    visiblePhotos.length,
  );

  const searchOptions = useMemo(() => buildHomeSearchOptions(photos), [photos]);

  const visibleSearchOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return searchOptions
      .filter((option) => {
        if (!query) {
          return true;
        }

        return [
          option.value,
          getSearchOptionLabel(option),
          option.kind,
          getSearchOptionDescription(option.kind),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 80);
  }, [searchOptions, searchQuery]);

  const masonryColumnCount = useMemo(
    () => getMasonryColumnCount(galleryWidth, renderedVisiblePhotos.length),
    [galleryWidth, renderedVisiblePhotos.length],
  );

  const masonryColumns = useMemo(
    () => buildMasonryColumns(renderedVisiblePhotos, masonryColumnCount),
    [masonryColumnCount, renderedVisiblePhotos],
  );

  const slideHref = useMemo(
    () => currentGalleryHref.replace(/^\//, '/slide'),
    [currentGalleryHref],
  );

  const saveGalleryScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      GALLERY_SCROLL_STORAGE_KEY,
      createGalleryScrollSnapshot(
        currentGalleryHref,
        window.scrollY,
        Date.now(),
        galleryRef.current?.getBoundingClientRect().width ?? galleryWidth,
      ),
    );
  }, [currentGalleryHref, galleryWidth]);

  const loadMoreGalleryPhotos = useCallback(() => {
    setGalleryRenderLimit((currentLimit) =>
      getNextGalleryRenderLimit({
        containerWidth: galleryWidth,
        currentLimit,
        photoCount: visiblePhotos.length,
      }),
    );
  }, [galleryWidth, visiblePhotos.length]);

  const prepareSlideFullscreen = useCallback(() => {
    if (slideFullscreenPrepareTried.current || !isSlideMobileViewport()) {
      return;
    }

    slideFullscreenPrepareTried.current = true;
    requestSlideFullscreen().catch(() => {
      slideFullscreenPrepareTried.current = false;
    });
  }, []);

  const openSlideView = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      saveGalleryScrollPosition();

      if (!isSlideMobileViewport()) {
        return;
      }

      event.preventDefault();
      requestSlideLandscape()
        .catch(() => undefined)
        .finally(() => {
          if (isWeChatBrowser()) {
            window.location.replace(slideHref);
            return;
          }

          router.push(slideHref).catch(() => undefined);
        });
    },
    [router, saveGalleryScrollPosition, slideHref],
  );

  useEffect(() => {
    const nextInitialLimit = getGalleryInitialRenderLimitForState();

    setGalleryRenderLimit((currentLimit) => {
      if (galleryRenderResetKeyRef.current !== galleryRenderResetKey) {
        galleryRenderResetKeyRef.current = galleryRenderResetKey;
        return nextInitialLimit;
      }

      return Math.min(
        visiblePhotos.length,
        Math.max(currentLimit, nextInitialLimit),
      );
    });
  }, [
    galleryRenderResetKey,
    getGalleryInitialRenderLimitForState,
    visiblePhotos.length,
  ]);

  useEffect(() => {
    if (!canRenderMoreGalleryPhotos) {
      return undefined;
    }

    const sentinel = galleryLoadMoreRef.current;

    if (!sentinel) {
      return undefined;
    }

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      loadMoreGalleryPhotos();
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreGalleryPhotos();
        }
      },
      {
        rootMargin: getGalleryLoadRootMargin(galleryWidth),
      },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [canRenderMoreGalleryPhotos, galleryWidth, loadMoreGalleryPhotos]);

  useEffect(() => {
    if (!router.isReady || router.asPath === currentGalleryHref) {
      return;
    }

    router.replace(currentGalleryHref, undefined, {
      scroll: false,
      shallow: true,
    });
  }, [currentGalleryHref, router]);

  useEffect(() => {
    const activeButton = categoriesRef.current?.querySelector<HTMLElement>(
      'button[aria-pressed="true"]',
    );

    activeButton?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    });
  }, [activeCategory]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !router.isReady ||
      visiblePhotos.length === 0
    ) {
      return undefined;
    }

    const scrollY = readGalleryScrollSnapshot(
      window.sessionStorage.getItem(GALLERY_SCROLL_STORAGE_KEY),
      currentGalleryHref,
    );

    if (scrollY === null) {
      return undefined;
    }

    window.sessionStorage.removeItem(GALLERY_SCROLL_STORAGE_KEY);

    const restoreScroll = () => {
      window.scrollTo(0, scrollY);
    };

    const frameId = window.requestAnimationFrame(restoreScroll);
    const timeoutId = window.setTimeout(restoreScroll, 140);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [currentGalleryHref, router.isReady, visiblePhotos.length]);

  useEffect(() => {
    const galleryElement = galleryRef.current;

    if (!galleryElement) {
      return undefined;
    }

    const updateGalleryWidth = () => {
      const nextGalleryWidth = normalizeMasonryContainerWidth(
        galleryElement.getBoundingClientRect().width,
      );

      setGalleryWidth((currentGalleryWidth) =>
        currentGalleryWidth === nextGalleryWidth
          ? currentGalleryWidth
          : nextGalleryWidth,
      );
    };

    updateGalleryWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateGalleryWidth);

      return () => window.removeEventListener('resize', updateGalleryWidth);
    }

    const resizeObserver = new ResizeObserver(updateGalleryWidth);
    resizeObserver.observe(galleryElement);

    return () => resizeObserver.disconnect();
  }, []);

  const showRandomOrder = () => {
    setRandomSeed(createRandomSeed());
    setSortMode('random');
  };

  const showLatestOrder = () => {
    setSortMode('latest');
  };

  const selectCategory = (category: string) => {
    setActiveCategory(category);
  };

  const selectSearchOption = (option: HomeSearchOption) => {
    setSelectedSearchTags((currentTags) =>
      currentTags.includes(option.value)
        ? currentTags.filter((tag) => tag !== option.value)
        : [...currentTags, option.value],
    );
  };

  const resetSearch = () => {
    setSearchQuery('');
    setSelectedSearchTags([]);
    setSearchTagMode('any');
  };

  const searchIsActive =
    searchQuery.trim().length > 0 || selectedSearchTags.length > 0;

  return (
    <main className="gallery-page min-h-screen bg-[#16110e] text-stone-100 antialiased">
      <Meta title={AppConfig.title} description={AppConfig.description} />

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#181613]/90 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <nav className="flex h-14 w-full items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="truncate text-base font-semibold text-stone-100 transition hover:text-[#a9c2bb]"
            >
              Xuan Yi
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm font-medium text-stone-200">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hidden transition hover:text-[#a9c2bb] sm:inline"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              aria-label="Search"
              onClick={() => setIsSearchOpen(true)}
              className="grid size-9 place-items-center rounded-[12px] border border-white/[0.1] bg-[#f7f2ec]/[0.07] text-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:border-[#9db6b0]/35 hover:bg-[#9db6b0]/[0.12] hover:text-[#dce9e5]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </div>
        </nav>
      </header>

      <SearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onQueryChange={setSearchQuery}
        onRemoveTag={(tag) =>
          setSelectedSearchTags((currentTags) =>
            currentTags.filter((currentTag) => currentTag !== tag),
          )
        }
        onReset={resetSearch}
        onSelectOption={selectSearchOption}
        onTagModeChange={setSearchTagMode}
        options={visibleSearchOptions}
        query={searchQuery}
        resultCount={visiblePhotos.length}
        selectedTags={selectedSearchTags}
        tagMode={searchTagMode}
      />

      <section className="w-full px-3 pb-5 pt-9 sm:px-5 sm:pb-7 sm:pt-14">
        <header className="mx-auto flex max-w-[1180px] flex-col items-center text-center">
          <h1 className="w-full whitespace-nowrap text-center text-[clamp(2rem,7vw,5.6rem)] font-bold leading-none tracking-[0.14em] text-[#8ea6a2] sm:tracking-[0.205em]">
            MYSTIC ONE AURA
          </h1>
          <p className="mx-auto mt-5 max-w-full text-base leading-8 text-stone-100 sm:text-lg lg:whitespace-nowrap">
            A visual sanctuary of light, shadows, and the unseen aura of
            countless landscapes.
          </p>
        </header>

        <div ref={categoriesRef} className="mt-8 w-full sm:mt-10">
          <div className="no-scrollbar mx-auto flex w-full flex-wrap justify-center gap-2 overflow-x-auto pb-1">
            <CategoryButton
              active={activeCategory === 'all'}
              count={photos.length}
              label="All"
              onClick={() => selectCategory('all')}
            />
            {categories.map((category) => (
              <CategoryButton
                key={category}
                active={activeCategory === category}
                count={categoryCounts[category] ?? 0}
                label={formatCategoryLabel(category)}
                onClick={() => selectCategory(category)}
              />
            ))}
          </div>

          <div className="no-scrollbar mx-auto mt-3 flex w-full flex-wrap justify-center gap-2 overflow-x-auto pb-1">
            <div className="inline-flex rounded-full bg-white/[0.05] p-1 ring-1 ring-white/[0.07]">
              <SortModeButton
                active={sortMode === 'random'}
                label="Random"
                onClick={showRandomOrder}
              />
              <SortModeButton
                active={sortMode === 'latest'}
                label="Latest"
                onClick={showLatestOrder}
              />
            </div>
            <div className="inline-flex rounded-full bg-white/[0.05] p-1 ring-1 ring-white/[0.07]">
              <span className="rounded-full bg-[#9db6b0] px-4 py-2 text-sm font-medium text-[#17110e]">
                Proof View
              </span>
              <Link
                href={slideHref}
                onClick={openSlideView}
                onPointerDown={prepareSlideFullscreen}
                onTouchStart={prepareSlideFullscreen}
                className="rounded-full px-4 py-2 text-sm font-medium text-stone-400 transition hover:bg-white/[0.06] hover:text-stone-100"
              >
                Slide View
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-1 pb-16 pt-1">
        {loadError ? (
          <StatusPanel title="Photos are not available" message={loadError} />
        ) : null}

        {!loadError && visiblePhotos.length === 0 ? (
          <StatusPanel
            title={searchIsActive ? 'No matching photos' : 'No photos here yet'}
            message={
              searchIsActive
                ? 'Reset search or try a different tag combination.'
                : 'Choose another category or add more photos to photos.json.'
            }
          />
        ) : null}

        {!loadError && visiblePhotos.length > 0 ? (
          <>
            <div ref={galleryRef} className="flex w-full items-start gap-1">
              {masonryColumns.map((column, columnIndex) => (
                <div
                  key={getMasonryColumnKey(columnIndex)}
                  className="flex min-w-0 flex-1 flex-col gap-1"
                >
                  {column.photos.map((photo, photoIndex) => (
                    <ProofPhotoCard
                      key={photo.id}
                      index={columnIndex + photoIndex * masonryColumns.length}
                      onOpenPhoto={saveGalleryScrollPosition}
                      photo={photo}
                      returnHref={currentGalleryHref}
                    />
                  ))}
                </div>
              ))}
            </div>
            {canRenderMoreGalleryPhotos ? (
              <div
                ref={galleryLoadMoreRef}
                aria-hidden="true"
                className="h-16 w-full"
              />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
};

export default Index;
