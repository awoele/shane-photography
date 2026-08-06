export const movePhotoIdBeforeTarget = ({
  activeId,
  ids,
  placement = 'before',
  targetId,
}: {
  activeId: string;
  ids: string[];
  placement?: 'after' | 'before';
  targetId: string;
}) => {
  if (activeId === targetId) {
    return ids;
  }

  const activeIndex = ids.indexOf(activeId);
  const targetIndex = ids.indexOf(targetId);

  if (activeIndex < 0 || targetIndex < 0) {
    return ids;
  }

  const nextIds = [...ids];
  const [active] = nextIds.splice(activeIndex, 1);
  const nextTargetIndex = nextIds.indexOf(targetId);
  const insertIndex =
    placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;

  nextIds.splice(insertIndex, 0, active as string);

  return nextIds;
};

export type VerticalSortPointerRow = {
  bottom: number;
  id: string;
  top: number;
};

export const getVerticalSortPointerTarget = ({
  pointerY,
  rows,
}: {
  pointerY: number;
  rows: VerticalSortPointerRow[];
}): { placement: 'after' | 'before'; targetId: string } | null => {
  if (rows.length === 0) {
    return null;
  }

  const sortedRows = [...rows].sort((a, b) => a.top - b.top);
  const firstRow = sortedRows[0];
  const lastRow = sortedRows[sortedRows.length - 1];

  if (!firstRow || !lastRow) {
    return null;
  }

  if (pointerY <= firstRow.top) {
    return { placement: 'before', targetId: firstRow.id };
  }

  if (pointerY >= lastRow.bottom) {
    return { placement: 'after', targetId: lastRow.id };
  }

  let closestRow = firstRow;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const row of sortedRows) {
    const middle = row.top + (row.bottom - row.top) / 2;
    const distance = Math.abs(pointerY - middle);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestRow = row;
    }
  }

  const closestMiddle =
    closestRow.top + (closestRow.bottom - closestRow.top) / 2;

  return {
    placement: pointerY > closestMiddle ? 'after' : 'before',
    targetId: closestRow.id,
  };
};

export const applySavedSortOrderToPhotos = <
  PhotoItem extends { id: string; sortOrder?: number },
>({
  ids,
  photos,
  sortStart = 1,
}: {
  ids: string[];
  photos: PhotoItem[];
  sortStart?: number;
}) => {
  const nextSortOrderById = new Map(
    ids.map((id, index) => [id, sortStart + index]),
  );

  return photos.map((photo) => {
    const sortOrder = nextSortOrderById.get(photo.id);

    if (sortOrder === undefined) {
      return photo;
    }

    return {
      ...photo,
      sortOrder,
    };
  });
};
