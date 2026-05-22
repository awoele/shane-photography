/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PhotoLightbox } from '@/components/PhotoLightbox';
import { Meta } from '@/layout/Meta';
import {
  buildCategoryList,
  fetchPhotos,
  formatCategoryLabel,
  type Photo,
} from '@/lib/photos';
import { AppConfig } from '@/utils/AppConfig';

type IndexProps = {
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

type SortMode = 'random' | 'latest';

const CategoryButton = ({
  active,
  count,
  label,
  onClick,
}: CategoryButtonProps) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`group inline-flex items-center gap-2 rounded-full py-2 pl-4 pr-2.5 text-sm font-medium transition sm:pl-5 ${
      active
        ? 'bg-[#9db6b0] text-[#17110e]'
        : 'bg-[#26221e] text-stone-300 hover:bg-[#312b26] hover:text-stone-100'
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

const createSeededRandom = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
};

const shufflePhotos = (photos: Photo[], seed: number) => {
  const shuffled = [...photos];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    const currentPhoto = shuffled[index];
    const targetPhoto = shuffled[targetIndex];

    if (currentPhoto && targetPhoto) {
      shuffled[index] = targetPhoto;
      shuffled[targetIndex] = currentPhoto;
    }
  }

  return shuffled;
};

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

export const getServerSideProps: GetServerSideProps<IndexProps> = async ({
  res,
}) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const photos = await fetchPhotos({ cacheBust: true });

    return {
      props: {
        photos,
        loadError: '',
        randomSeed: Date.now(),
      },
    };
  } catch (error) {
    return {
      props: {
        photos: [],
        loadError:
          error instanceof Error
            ? error.message
            : 'Could not load remote photo data.',
        randomSeed: Date.now(),
      },
    };
  }
};

const Index: NextPage<IndexProps> = ({ photos, loadError, randomSeed }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('random');

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

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  return (
    <main className="min-h-screen bg-[#18130f] text-stone-100 antialiased">
      <Meta title={AppConfig.title} description={AppConfig.description} />

      <nav className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between border-b border-white/[0.07] px-4 sm:px-6">
        <Link href="/" className="text-base font-semibold text-stone-100">
          Shane
        </Link>

        <div className="flex items-center gap-5 text-sm font-medium text-stone-200">
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
            className="grid size-8 place-items-center rounded-full text-stone-200 transition hover:bg-[#26221e] hover:text-[#a9c2bb]"
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

      <section className="mx-auto max-w-[1120px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold text-[#7f9a95] sm:text-5xl">
            Photography Portfolio
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-base leading-7 text-stone-400">
            I may never become a great photographer, but I will become a version
            of myself who has witnessed countless landscapes.
          </p>
        </header>

        <div className="mt-9 flex flex-wrap justify-center gap-2.5">
          <CategoryButton
            active={activeCategory === 'all'}
            count={photos.length}
            label="All"
            onClick={() => setActiveCategory('all')}
          />
          {categories.map((category) => (
            <CategoryButton
              key={category}
              active={activeCategory === category}
              count={categoryCounts[category] ?? 0}
              label={formatCategoryLabel(category)}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>

        <div className="mt-5 flex justify-center">
          <div className="inline-flex rounded-full bg-[#211b17] p-1 ring-1 ring-white/[0.07]">
            <SortModeButton
              active={sortMode === 'random'}
              label="Random"
              onClick={() => setSortMode('random')}
            />
            <SortModeButton
              active={sortMode === 'latest'}
              label="Latest"
              onClick={() => setSortMode('latest')}
            />
          </div>
        </div>

        <section className="mt-10">
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
            <div className="columns-2 gap-3 md:columns-5 md:gap-4">
              {visiblePhotos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => openLightbox(index)}
                  className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-[10px] bg-[#211b17] text-left"
                  aria-label={`Open ${photo.title}`}
                >
                  <img
                    src={photo.thumbnail}
                    alt={photo.title}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full object-contain transition duration-500 group-hover:scale-[1.015] group-hover:brightness-110"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#18130f]/75 to-transparent px-3 pb-3 pt-10 text-xs font-medium text-stone-100 opacity-0 transition duration-300 group-hover:opacity-100">
                    {photo.title}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={visiblePhotos}
          activeIndex={lightboxIndex}
          onClose={closeLightbox}
          onSelectIndex={setLightboxIndex}
        />
      ) : null}
    </main>
  );
};

export default Index;
