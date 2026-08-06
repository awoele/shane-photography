import type { Photo } from './photos';

export type HomeSearchTagMode = 'any' | 'all';

export type HomeSearchState = {
  query: string;
  selectedTags: string[];
  tagMode: HomeSearchTagMode;
};

export type HomeSearchOptionKind = 'category' | 'location' | 'tag';

export type HomeSearchOption = {
  count: number;
  kind: HomeSearchOptionKind;
  label: string;
  value: string;
};

const normalizeForSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const addCount = (
  counts: Map<string, { count: number; label: string }>,
  label: string,
) => {
  const normalized = normalizeForSearch(label);

  if (!normalized) {
    return;
  }

  const current = counts.get(normalized);

  counts.set(normalized, {
    count: (current?.count ?? 0) + 1,
    label: current?.label ?? label.trim(),
  });
};

const getPhotoSearchValues = (photo: Photo) =>
  [
    photo.title,
    photo.id,
    photo.category,
    photo.originalCategory,
    photo.description,
    photo.location,
    photo.camera,
    photo.lens,
    ...(photo.tags ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));

const getPhotoSelectableValues = (photo: Photo) =>
  new Set(
    [photo.category, photo.location, ...(photo.tags ?? [])]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeForSearch),
  );

export const buildHomeSearchOptions = (photos: Photo[]) => {
  const usedValues = new Set<string>();
  const categoryCounts = new Map<string, { count: number; label: string }>();
  const locationCounts = new Map<string, { count: number; label: string }>();
  const tagCounts = new Map<string, { count: number; label: string }>();
  const groups: Array<{
    counts: Map<string, { count: number; label: string }>;
    kind: HomeSearchOptionKind;
  }> = [
    { counts: categoryCounts, kind: 'category' },
    { counts: locationCounts, kind: 'location' },
    { counts: tagCounts, kind: 'tag' },
  ];

  photos.forEach((photo) => {
    addCount(categoryCounts, photo.category);
    addCount(locationCounts, photo.location);
    (photo.tags ?? []).forEach((tag) => addCount(tagCounts, tag));
  });

  return groups.flatMap(({ counts, kind }) =>
    Array.from(counts.entries())
      .filter(([normalized]) => {
        if (usedValues.has(normalized)) {
          return false;
        }

        usedValues.add(normalized);
        return true;
      })
      .sort(([, first], [, second]) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }

        return first.label.localeCompare(second.label);
      })
      .map(([, option]) => ({
        count: option.count,
        kind,
        label: option.label,
        value: option.label,
      })),
  );
};

export const filterHomePhotos = (
  photos: Photo[],
  { query, selectedTags, tagMode }: HomeSearchState,
) => {
  const queryTokens = normalizeForSearch(query).split(' ').filter(Boolean);
  const selectedValues = selectedTags.map(normalizeForSearch).filter(Boolean);

  return photos.filter((photo) => {
    if (queryTokens.length > 0) {
      const haystack = normalizeForSearch(
        getPhotoSearchValues(photo).join(' '),
      );

      if (!queryTokens.every((token) => haystack.includes(token))) {
        return false;
      }
    }

    if (selectedValues.length > 0) {
      const values = getPhotoSelectableValues(photo);
      const matches =
        tagMode === 'all'
          ? selectedValues.every((tag) => values.has(tag))
          : selectedValues.some((tag) => values.has(tag));

      if (!matches) {
        return false;
      }
    }

    return true;
  });
};
