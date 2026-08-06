type DetailPreloadPhoto = {
  src: string;
  thumbnail: string;
};

export type DetailImagePreloadLink = {
  href: string;
  rel: 'prefetch' | 'preload';
};

const addUniqueLink = (
  links: DetailImagePreloadLink[],
  seen: Set<string>,
  href: string | undefined,
  rel: DetailImagePreloadLink['rel'],
) => {
  if (!href || seen.has(href)) {
    return;
  }

  seen.add(href);
  links.push({ href, rel });
};

export const createDetailImagePreloadLinks = ({
  nextPhoto,
  photo,
  previousPhoto,
}: {
  nextPhoto: DetailPreloadPhoto | null;
  photo: DetailPreloadPhoto;
  previousPhoto: DetailPreloadPhoto | null;
}): DetailImagePreloadLink[] => {
  const links: DetailImagePreloadLink[] = [];
  const seen = new Set<string>();

  addUniqueLink(links, seen, photo.src, 'preload');
  addUniqueLink(links, seen, photo.thumbnail, 'prefetch');
  addUniqueLink(links, seen, previousPhoto?.thumbnail, 'prefetch');
  addUniqueLink(links, seen, nextPhoto?.thumbnail, 'prefetch');

  return links;
};
