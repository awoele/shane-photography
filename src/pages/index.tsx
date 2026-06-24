/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Meta } from '@/layout/Meta';
import { buildMasonryColumns, getMasonryColumnCount } from '@/lib/masonry';
import { buildPhotoDetailHref } from '@/lib/navigation';
import {
  buildCategoryList,
  formatCategoryLabel,
  type Photo,
  type PhotoSortMode,
  shufflePhotos,
} from '@/lib/photos';
import {
  isSlideMobileViewport,
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
  photo: Photo;
  returnHref: string;
};

const INITIAL_GALLERY_WIDTH = 1920;

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

const ProofPhotoCard = ({ index, photo, returnHref }: ProofPhotoCardProps) => {
  const [imageSource, setImageSource] = useState(photo.thumbnail || photo.src);
  const [failed, setFailed] = useState(false);
  const eager = index < 16;

  useEffect(() => {
    setImageSource(photo.thumbnail || photo.src);
    setFailed(false);
  }, [photo.src, photo.thumbnail]);

  const handleImageError = () => {
    if (imageSource !== photo.src) {
      setImageSource(photo.src);
      return;
    }

    setFailed(true);
  };

  return (
    <Link
      href={buildPhotoDetailHref(photo.id, returnHref)}
      prefetch={false}
      className="group relative block w-full break-inside-avoid overflow-hidden rounded-[3px] bg-[#211b17] text-left"
      style={{
        aspectRatio: getPhotoAspectRatio(photo),
      }}
      aria-label={`Open ${photo.title}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(110deg,#211b17_0%,#2a241f_38%,#211b17_72%)]"
      />
      {!failed ? (
        <img
          src={imageSource}
          alt={photo.title}
          width={photo.width || undefined}
          height={photo.height || undefined}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={handleImageError}
          className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.02] group-hover:brightness-110"
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
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const { fetchManagedPhotoSet } = await import(
      '@/lib/server/photoCmsManifest'
    );
    const { photos } = await fetchManagedPhotoSet({ cacheBust: true });

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
  const categoriesRef = useRef<HTMLDivElement | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const slideFullscreenPrepareTried = useRef(false);
  const [galleryWidth, setGalleryWidth] = useState(INITIAL_GALLERY_WIDTH);
  const router = useRouter();

  const categories = useMemo(() => buildCategoryList(photos), [photos]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    photos.forEach((photo) => {
      counts[photo.category] = (counts[photo.category] ?? 0) + 1;
    });

    return counts;
  }, [photos]);

  const randomizedPhotos = useMemo(
    () => shufflePhotos(photos, randomSeed),
    [photos, randomSeed],
  );

  const orderedPhotos = sortMode === 'random' ? randomizedPhotos : photos;

  const visiblePhotos = useMemo(() => {
    if (activeCategory === 'all') {
      return orderedPhotos;
    }

    return orderedPhotos.filter((photo) => photo.category === activeCategory);
  }, [activeCategory, orderedPhotos]);

  const masonryColumnCount = useMemo(
    () => getMasonryColumnCount(galleryWidth, visiblePhotos.length),
    [galleryWidth, visiblePhotos.length],
  );

  const masonryColumns = useMemo(
    () => buildMasonryColumns(visiblePhotos, masonryColumnCount),
    [masonryColumnCount, visiblePhotos],
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

  const slideHref = useMemo(
    () => currentGalleryHref.replace(/^\//, '/slide'),
    [currentGalleryHref],
  );

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
      if (!isSlideMobileViewport()) {
        return;
      }

      event.preventDefault();
      requestSlideLandscape()
        .catch(() => undefined)
        .finally(() => {
          router.push(slideHref).catch(() => undefined);
        });
    },
    [router, slideHref],
  );

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
    const galleryElement = galleryRef.current;

    if (!galleryElement) {
      return undefined;
    }

    const updateGalleryWidth = () => {
      setGalleryWidth(galleryElement.getBoundingClientRect().width);
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#16110e] text-stone-100 antialiased">
      <Meta title={AppConfig.title} description={AppConfig.description} />

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#181613]/90 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <nav className="flex h-14 w-full items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="truncate text-base font-semibold text-stone-100"
            >
              Shane
            </Link>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-500">
              {photos.length}
            </span>
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
              className="grid size-9 place-items-center rounded-lg bg-white/[0.04] text-stone-300 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-[#a9c2bb]"
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

      <section className="w-full px-3 pb-5 pt-9 sm:px-5 sm:pb-7 sm:pt-14">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold text-[#8ea6a2] sm:text-6xl">
            Photography Portfolio
          </h1>
          <p className="mx-auto mt-5 max-w-[620px] text-base leading-8 text-stone-100 sm:text-lg">
            I may never become a great photographer, but I will become a version
            of myself who has witnessed countless landscapes.
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
            title="No photos here yet"
            message="Choose another category or add more photos to photos.json."
          />
        ) : null}

        {!loadError && visiblePhotos.length > 0 ? (
          <div ref={galleryRef} className="flex w-full items-start gap-1">
            {masonryColumns.map((column, columnIndex) => (
              <div
                key={column.photos[0]?.id ?? `column-${columnIndex}`}
                className="flex min-w-0 flex-1 flex-col gap-1"
              >
                {column.photos.map((photo, photoIndex) => (
                  <ProofPhotoCard
                    key={photo.id}
                    index={columnIndex + photoIndex * masonryColumns.length}
                    photo={photo}
                    returnHref={currentGalleryHref}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default Index;
