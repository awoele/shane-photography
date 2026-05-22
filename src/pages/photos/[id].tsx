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
  const isPortraitPhoto = photo.height > photo.width;
  const imageClassName = isPortraitPhoto
    ? 'block h-full w-auto max-w-full object-contain'
    : 'block h-auto max-h-full w-full object-contain';

  return (
    <main className="min-h-screen bg-[#18130f] py-5 text-stone-100 antialiased">
      <Meta title={title} description={description} />

      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
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
          <figure className="relative mx-[calc(50%-50vw)] flex h-[82svh] w-screen items-center justify-center overflow-hidden bg-[#11100e] lg:mx-0 lg:h-[calc(100vh-8rem)] lg:w-full lg:rounded-[18px] lg:border lg:border-white/[0.08]">
            <img
              src={photo.src}
              alt={photoTitle}
              loading="eager"
              decoding="async"
              className={imageClassName}
            />
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
