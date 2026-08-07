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

export const movePhotoIdsToPosition = ({
  ids,
  selectedIds,
  targetIndex,
}: {
  ids: string[];
  selectedIds: string[];
  targetIndex: number;
}) => {
  const selectedSet = new Set(selectedIds);
  const movingIds = ids.filter((id) => selectedSet.has(id));

  if (movingIds.length === 0) {
    return ids;
  }

  const remainingIds = ids.filter((id) => !selectedSet.has(id));
  const insertIndex = Math.max(
    0,
    Math.min(Math.floor(targetIndex), remainingIds.length),
  );

  return [
    ...remainingIds.slice(0, insertIndex),
    ...movingIds,
    ...remainingIds.slice(insertIndex),
  ];
};

export const movePhotoIdsToFront = ({
  ids,
  selectedIds,
}: {
  ids: string[];
  selectedIds: string[];
}) => movePhotoIdsToPosition({ ids, selectedIds, targetIndex: 0 });

export type VerticalSortPointerRow = {
  bottom: number;
  id: string;
  top: number;
};

export type GridSortPointerItem = {
  bottom: number;
  id: string;
  left: number;
  right: number;
  top: number;
};

export const getGridSortPointerTarget = ({
  activeId,
  items,
  pointerX,
  pointerY,
}: {
  activeId?: string;
  items: GridSortPointerItem[];
  pointerX: number;
  pointerY: number;
}): { placement: 'after' | 'before'; targetId: string } | null => {
  const candidates = items.filter((item) => item.id !== activeId);

  if (candidates.length === 0) {
    return null;
  }

  const target = candidates.reduce((closest, item) => {
    const centerX = (item.left + item.right) / 2;
    const centerY = (item.top + item.bottom) / 2;
    const distance = (pointerX - centerX) ** 2 + (pointerY - centerY) ** 2;
    const closestCenterX = (closest.left + closest.right) / 2;
    const closestCenterY = (closest.top + closest.bottom) / 2;
    const closestDistance =
      (pointerX - closestCenterX) ** 2 + (pointerY - closestCenterY) ** 2;

    return distance < closestDistance ? item : closest;
  });
  const centerX = (target.left + target.right) / 2;
  const centerY = (target.top + target.bottom) / 2;
  const isSameRow = pointerY >= target.top && pointerY <= target.bottom;
  let placement: 'after' | 'before' = 'before';
  if (
    (isSameRow && pointerX >= centerX) ||
    (!isSameRow && pointerY >= centerY)
  ) {
    placement = 'after';
  }

  return {
    placement,
    targetId: target.id,
  };
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
