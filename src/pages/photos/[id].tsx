/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';

import { PhotoCommentsPanel } from '@/components/PhotoCommentsPanel';
import { PhotoInfoPanel } from '@/components/PhotoInfoPanel';
import { Meta } from '@/layout/Meta';
import {
  fetchPhotos,
  findPhotoById,
  getPhotoTitle,
  type Photo,
} from '@/lib/photos';
import { AppConfig } from '@/utils/AppConfig';

type PhotoPageProps = {
  photo: Photo;
};

export const getServerSideProps: GetServerSideProps<PhotoPageProps> = async ({
  params,
  res,
}) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    return {
      notFound: true,
    };
  }

  const photos = await fetchPhotos({ cacheBust: true });
  const photo = findPhotoById(photos, id);

  if (!photo) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      photo,
    },
  };
};

const PhotoPage: NextPage<PhotoPageProps> = ({ photo }) => {
  const photoTitle = getPhotoTitle(photo);
  const title = `${photoTitle} | ${AppConfig.site_name}`;
  const description = photo.description || AppConfig.description;

  return (
    <main className="min-h-screen bg-[#18130f] px-4 py-5 text-stone-100 antialiased sm:px-6 lg:px-8">
      <Meta title={title} description={description} />

      <div className="mx-auto w-full max-w-[1280px]">
        <nav className="flex h-14 items-center justify-between border-b border-white/[0.07]">
          <Link
            href="/"
            className="text-sm text-stone-300 transition hover:text-[#a9c2bb]"
          >
            Back to gallery
          </Link>
          <span className="text-xs uppercase tracking-[0.22em] text-stone-500">
            Photo detail
          </span>
        </nav>

        <article className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <figure className="relative flex min-h-[72svh] items-center justify-center overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#11100e] p-4 sm:p-8 lg:min-h-[calc(100vh-8rem)]">
            <div className="relative inline-flex max-h-full max-w-full items-center justify-center">
              <img
                src={photo.src}
                alt={photoTitle}
                loading="eager"
                decoding="async"
                className="max-h-[calc(100vh-9rem)] max-w-full object-contain"
              />
            </div>
          </figure>

          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#1d1915] lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
            <PhotoInfoPanel
              photo={photo}
              className="shrink-0 overflow-y-auto p-5 lg:max-h-[48%]"
            />
            <PhotoCommentsPanel className="min-h-0 flex-1" />
          </aside>
        </article>
      </div>
    </main>
  );
};

export default PhotoPage;
