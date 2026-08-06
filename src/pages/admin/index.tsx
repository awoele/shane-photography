/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  PointerEvent,
  ReactNode,
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Meta } from '@/layout/Meta';
import {
  applySavedSortOrderToPhotos,
  getGridSortPointerTarget,
  movePhotoIdBeforeTarget,
} from '@/lib/adminPhotoSort';
import { comparePhotosByManagedOrder, formatCategoryLabel } from '@/lib/photos';
import type {
  ImportReviewCandidate,
  ImportReviewSnapshot,
} from '@/lib/server/importReview';
import type {
  CmsPhoto,
  CmsPhotoStatus,
  CmsProcessingJob,
  CmsSettings,
  CmsStats,
} from '@/lib/server/photoCms';
import { getChunkedUploadParts } from '@/lib/uploadProxy';

type AdminModule =
  | 'editor'
  | 'library'
  | 'queue'
  | 'review'
  | 'sort'
  | 'settings'
  | 'upload';
type AdminStatusFilter = CmsPhotoStatus | 'all' | 'removed';

type AdminPageProps = {
  initialJobs: CmsProcessingJob[];
  initialPhotos: CmsPhoto[];
  initialSettings: CmsSettings;
  initialStats: CmsStats;
};

type AdminPhotosResponse = {
  error?: string;
  photos?: CmsPhoto[];
  stats?: CmsStats;
};

type AdminJobsResponse = {
  error?: string;
  job?: CmsProcessingJob;
  jobs?: CmsProcessingJob[];
};

type AdminSettingsResponse = {
  error?: string;
  settings?: CmsSettings;
};

type AdminEditDraft = {
  category: string;
  dateTaken: string;
  description: string;
  featured: boolean;
  location: string;
  sortOrder: string;
  status: CmsPhotoStatus;
  tags: string;
  title: string;
};

type UploadItemStatus = 'failed' | 'success' | 'uploading' | 'waiting';
type UploadItemRole = 'image' | 'live-video';

type UploadItem = {
  error: string;
  file: File;
  id: string;
  livePhotoPairKey: string;
  objectPath: string;
  previewUrl: string;
  progress: number;
  role: UploadItemRole;
  status: UploadItemStatus;
  title: string;
};

type UploadUrlResponse =
  | {
      metadataPath: string;
      objectPath: string;
      signedUrl: string;
    }
  | {
      error: string;
    };

type ProcessIncomingResponse = {
  detail?: unknown;
  error?: string;
  failed?: number;
  processed?: number;
  scanned?: number;
  status?: number;
};

type ImportReviewResponse = {
  archived?: string[];
  error?: string;
  snapshot?: ImportReviewSnapshot;
};

type ApiErrorResponse = {
  detail?: unknown;
  error: string;
};

const CATEGORIES = [
  'alex-webb',
  'beauty',
  'color',
  'cute',
  'design',
  'favourites',
  'mark',
  'nature',
  'night',
  'portrait',
  'street',
  'travel',
] as const;

const STATUS_OPTIONS: AdminStatusFilter[] = [
  'all',
  'published',
  'draft',
  'hidden',
  'removed',
];

const IMAGE_CONTENT_TYPE_LIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

const LIVE_VIDEO_CONTENT_TYPE_LIST = ['video/mp4', 'video/quicktime'] as const;

const IMAGE_CONTENT_TYPES = new Set<string>(IMAGE_CONTENT_TYPE_LIST);
const LIVE_VIDEO_CONTENT_TYPES = new Set<string>(LIVE_VIDEO_CONTENT_TYPE_LIST);
const ALLOWED_CONTENT_TYPES = new Set<string>([
  ...IMAGE_CONTENT_TYPE_LIST,
  ...LIVE_VIDEO_CONTENT_TYPE_LIST,
]);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  png: 'image/png',
  webp: 'image/webp',
};

const UPLOAD_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,video/quicktime,video/mp4,.mov,.MOV,.mp4,.MP4';

const MODULES: Array<{
  id: AdminModule;
  label: string;
}> = [
  { id: 'library', label: '图库' },
  { id: 'upload', label: '上传' },
  { id: 'review', label: '导入确认' },
  { id: 'sort', label: '排序' },
  { id: 'editor', label: '照片编辑' },
  { id: 'queue', label: '处理队列' },
  { id: 'settings', label: '设置' },
];

const STATUS_LABELS: Record<AdminStatusFilter, string> = {
  all: '全部',
  draft: '草稿',
  hidden: '隐藏',
  published: '已发布',
  removed: '已移除',
};

const getPhotoWorkflowLabel = (photo: CmsPhoto) =>
  photo.deleted ? STATUS_LABELS.removed : STATUS_LABELS[photo.status];

const parseIntegerInput = (value: string, fallback = 1) => {
  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const UPLOAD_STATUS_LABELS: Record<UploadItemStatus, string> = {
  failed: '失败',
  success: '已上传',
  uploading: '上传中',
  waiting: '等待中',
};

const JOB_STATUS_LABELS: Record<CmsProcessingJob['status'], string> = {
  completed: '已完成',
  failed: '失败',
  processing: '处理中',
  queued: '排队中',
};

const STEP_STATUS_LABELS: Record<CmsProcessingJob['exifStatus'], string> = {
  completed: '完成',
  failed: '失败',
  pending: '等待中',
  skipped: '跳过',
};

const STAGE_LABELS: Record<string, string> = {
  Completed: '已完成',
  Failed: '失败',
  Uploaded: '已上传',
  'Processing metadata': '正在处理元数据',
};

const SERVICE_STATUS_LABELS = {
  configured: '已配置',
  missing: '未配置',
} as const;

const formatJobStage = (stage: string) => STAGE_LABELS[stage] ?? stage;

const inputClassName =
  'h-10 min-w-0 rounded-full border border-white/[0.08] bg-white/[0.05] px-4 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const fieldClassName =
  'w-full rounded-md border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const selectThemeClassName =
  'appearance-none bg-[#2a241f] text-stone-100 [color-scheme:dark] [&_option]:bg-[#2a241f] [&_option]:text-stone-100';

const compactSelectClassName = `${inputClassName} ${selectThemeClassName} w-full min-w-0 pr-9 sm:w-auto sm:min-w-[120px]`;

const fieldSelectClassName = `${fieldClassName} ${selectThemeClassName}`;

const buttonClassName =
  'inline-flex min-w-0 items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';

const panelClassName = 'rounded-lg border border-white/[0.07] bg-[#1c1713]';

const getUniqueCategories = (photos: CmsPhoto[]) =>
  Array.from(
    new Set(photos.map((photo) => photo.category).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second));

const formatTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const createEditDraft = (photo?: CmsPhoto): AdminEditDraft => ({
  category: photo?.category ?? '',
  dateTaken: photo?.dateTaken || photo?.date || '',
  description: photo?.description ?? '',
  featured: photo?.featured === true,
  location: photo?.location ?? '',
  sortOrder:
    typeof photo?.sortOrder === 'number' && Number.isFinite(photo.sortOrder)
      ? String(photo.sortOrder)
      : '',
  status: photo?.status ?? 'draft',
  tags: (photo?.tags ?? []).join(', '),
  title: photo?.title ?? '',
});

const isEditDraftChanged = (
  photo: CmsPhoto | undefined,
  draft: AdminEditDraft,
) =>
  Boolean(
    photo &&
      (draft.category !== photo.category ||
        draft.dateTaken !== (photo.dateTaken || photo.date || '') ||
        draft.description !== photo.description ||
        draft.featured !== photo.featured ||
        draft.location !== photo.location ||
        draft.sortOrder !==
          (typeof photo.sortOrder === 'number'
            ? String(photo.sortOrder)
            : '') ||
        draft.status !== photo.status ||
        draft.tags !== (photo.tags ?? []).join(', ') ||
        draft.title !== photo.title),
  );

const toEditPatch = (draft: AdminEditDraft) => ({
  category: draft.category,
  dateTaken: draft.dateTaken,
  description: draft.description,
  featured: draft.featured,
  location: draft.location,
  ...(draft.sortOrder.trim()
    ? { sortOrder: Number.parseInt(draft.sortOrder, 10) }
    : {}),
  status: draft.status,
  tags: formatTags(draft.tags),
  title: draft.title,
});

const inferContentType = (file: File) => {
  if (ALLOWED_CONTENT_TYPES.has(file.type)) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? '';
};

const isImageContentType = (contentType: string) =>
  IMAGE_CONTENT_TYPES.has(contentType);

const isLiveVideoContentType = (contentType: string) =>
  LIVE_VIDEO_CONTENT_TYPES.has(contentType);

const removeExtension = (filename: string) =>
  filename.replace(/\.[^/.]+$/, '').trim() || filename;

const getUploadPairKey = (filename: string) =>
  removeExtension(filename)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || removeExtension(filename).toLowerCase();

const getUploadRole = (file: File): UploadItemRole => {
  const contentType = inferContentType(file);

  return isLiveVideoContentType(contentType) ? 'live-video' : 'image';
};

const isLivePhotoPaired = (item: UploadItem, items: UploadItem[]) =>
  items.some(
    (other) =>
      other.id !== item.id &&
      other.livePhotoPairKey === item.livePhotoPairKey &&
      other.role !== item.role,
  );

const getUploadItemIssue = (item: UploadItem, items: UploadItem[]) => {
  const contentType = inferContentType(item.file);

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return `不支持的上传格式：${item.file.name}。`;
  }

  if (item.role === 'live-video' && !isLivePhotoPaired(item, items)) {
    return 'Live Photo 视频需要同名照片配对。';
  }

  return '';
};

const getProcessIncomingButtonLabel = ({
  canProcessIncoming,
  isProcessingIncoming,
}: {
  canProcessIncoming: boolean;
  isProcessingIncoming: boolean;
}) => {
  if (isProcessingIncoming) {
    return '处理中...';
  }

  return canProcessIncoming ? '处理已上传照片' : '扫描待导入照片';
};

const IMPORT_REVIEW_STATUS_LABELS: Record<
  ImportReviewCandidate['status'],
  string
> = {
  complete: '可导入',
  'missing-sidecar': '缺少元数据',
  'orphan-json': '孤立元数据',
};

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) {
    return '—';
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

const getRecommendedImportPaths = (snapshot: ImportReviewSnapshot | null) =>
  snapshot?.candidates
    .filter((candidate) => candidate.recommended && candidate.objectPath)
    .map((candidate) => candidate.objectPath as string) ?? [];

const getAllCompleteImportPaths = (snapshot: ImportReviewSnapshot | null) =>
  snapshot?.candidates
    .filter(
      (candidate) =>
        candidate.status === 'complete' && Boolean(candidate.objectPath),
    )
    .map((candidate) => candidate.objectPath as string) ?? [];

const getImportArchivePaths = (candidates: ImportReviewCandidate[]) =>
  Array.from(
    new Set(candidates.flatMap((candidate) => candidate.archivePaths)),
  );

const getImportCandidateClassName = (candidate: ImportReviewCandidate) => {
  if (candidate.recommended) {
    return 'border-[#9db6b0]/50 bg-[#9db6b0]/10';
  }

  if (candidate.status === 'complete') {
    return 'border-amber-200/20 bg-amber-300/[0.06]';
  }

  return 'border-red-300/20 bg-red-400/[0.06]';
};

const createBatchId = () => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 17);
  const random = Math.random().toString(36).slice(2, 8);

  return `batch-${timestamp}-${random}`;
};

const getFallbackFileTitle = (file: File) => removeExtension(file.name);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getExistingBatchTitleMax = ({
  category,
  photos,
  prefix,
}: {
  category: string;
  photos: CmsPhoto[];
  prefix: string;
}) => {
  const cleanPrefix = prefix.trim();

  if (!cleanPrefix) {
    return 0;
  }

  const titlePattern = new RegExp(
    `^${escapeRegExp(cleanPrefix)}[\\s_-]*(\\d+)$`,
    'i',
  );

  return photos.reduce((maxNumber, photo) => {
    if (photo.category !== category && photo.originalCategory !== category) {
      return maxNumber;
    }

    const match = photo.title.trim().match(titlePattern);

    if (!match) {
      return maxNumber;
    }

    return Math.max(maxNumber, Number.parseInt(match[1] || '0', 10));
  }, 0);
};

const formatUploadTitleNumber = (value: number, maxValue: number) =>
  String(value).padStart(Math.max(2, String(maxValue).length), '0');

const getSequencedUploadTitle = ({
  maxValue,
  prefix,
  value,
}: {
  maxValue: number;
  prefix: string;
  value: number;
}) => `${prefix.trim()} ${formatUploadTitleNumber(value, maxValue)}`;

const createUploadTitleMap = ({
  batchTitlePrefix,
  category,
  items,
  photos,
}: {
  batchTitlePrefix: string;
  category: string;
  items: UploadItem[];
  photos: CmsPhoto[];
}) => {
  const prefix = batchTitlePrefix.trim();
  const titleMap = new Map<string, string>();

  if (!prefix) {
    items.forEach((item) => {
      titleMap.set(item.id, getFallbackFileTitle(item.file));
    });

    return titleMap;
  }

  const imageItems = items.filter((item) => item.role === 'image');
  let nextNumber =
    getExistingBatchTitleMax({
      category,
      photos,
      prefix,
    }) + 1;
  const finalNumber = Math.max(nextNumber, nextNumber + imageItems.length - 1);
  const imageTitleByPairKey = new Map<string, string>();

  items.forEach((item) => {
    if (item.role !== 'image') {
      return;
    }

    const title = getSequencedUploadTitle({
      maxValue: finalNumber,
      prefix,
      value: nextNumber,
    });

    titleMap.set(item.id, title);
    imageTitleByPairKey.set(item.livePhotoPairKey, title);
    nextNumber += 1;
  });

  items.forEach((item) => {
    if (titleMap.has(item.id)) {
      return;
    }

    titleMap.set(
      item.id,
      imageTitleByPairKey.get(item.livePhotoPairKey) ??
        getFallbackFileTitle(item.file),
    );
  });

  return titleMap;
};

const createUploadId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as
      | ApiErrorResponse
      | ProcessIncomingResponse
      | UploadUrlResponse;

    if ('error' in data) {
      const errorData = data as ApiErrorResponse;

      return errorData.detail
        ? `${errorData.error} ${JSON.stringify(errorData.detail)}`
        : errorData.error;
    }
  } catch (_error) {
    // The response may not be JSON if the request fails before reaching Next.js.
  }

  return `请求失败，状态码 ${response.status}。`;
}

const uploadFileThroughSiteProxy = async ({
  contentType,
  file,
  objectPath,
  onProgress,
  password,
}: {
  contentType: string;
  file: File;
  objectPath: string;
  onProgress: (progress: number) => void;
  password: string;
}) => {
  const uploadId = createUploadId();
  const parts = getChunkedUploadParts(file.size);
  const totalChunks = parts.length;

  if (totalChunks === 0) {
    throw new Error('上传文件为空。');
  }

  /* eslint-disable no-await-in-loop */
  for (const part of parts) {
    const response = await fetch('/api/upload-chunk/', {
      body: file.slice(part.start, part.end, contentType),
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Admin-Upload-Password': password,
        'X-Upload-Action': 'chunk',
        'X-Upload-Chunk-Index': String(part.index),
        'X-Upload-Content-Type': contentType,
        'X-Upload-Id': uploadId,
        'X-Upload-Object-Path': objectPath,
        'X-Upload-Total-Chunks': String(totalChunks),
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    onProgress(Math.min(95, Math.round(((part.index + 1) / totalChunks) * 95)));
  }
  /* eslint-enable no-await-in-loop */

  const completeResponse = await fetch('/api/upload-chunk/', {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Admin-Upload-Password': password,
      'X-Upload-Action': 'complete',
      'X-Upload-Chunk-Index': '0',
      'X-Upload-Content-Type': contentType,
      'X-Upload-Id': uploadId,
      'X-Upload-Object-Path': objectPath,
      'X-Upload-Total-Chunks': String(totalChunks),
    },
    method: 'POST',
  });

  if (!completeResponse.ok) {
    throw new Error(await getErrorMessage(completeResponse));
  }

  onProgress(100);
};

const StatPanel = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.04] p-3 sm:p-4">
    <p className="truncate text-xs text-stone-400 sm:text-sm">{label}</p>
    <p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{value}</p>
  </div>
);

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({
  res,
}) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const { getCmsSettings, getCmsStats, listCmsPhotos, listProcessingJobs } =
    await import('@/lib/server/photoCms');

  const [initialPhotos, initialStats, initialJobs, initialSettings] =
    await Promise.all([
      listCmsPhotos({ includeDeleted: true, status: 'all' }),
      getCmsStats(),
      listProcessingJobs(),
      getCmsSettings(),
    ]);

  return {
    props: {
      initialJobs,
      initialPhotos,
      initialSettings,
      initialStats,
    },
  };
};

const AdminPage: NextPage<AdminPageProps> = ({
  initialJobs,
  initialPhotos,
  initialSettings,
  initialStats,
}) => {
  const [activeModule, setActiveModule] = useState<AdminModule>('library');
  const [photos, setPhotos] = useState(initialPhotos);
  const [sortSourcePhotos, setSortSourcePhotos] = useState(initialPhotos);
  const [jobs, setJobs] = useState(initialJobs);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsDraft, setSettingsDraft] = useState(initialSettings);
  const [stats, setStats] = useState(initialStats);
  const [selectedPhotoId, setSelectedPhotoId] = useState(
    initialPhotos[0]?.id ?? '',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftPhoto, setDraftPhoto] = useState(() =>
    createEditDraft(initialPhotos[0]),
  );
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AdminStatusFilter>('all');
  const [category, setCategory] = useState('all');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState<CmsPhotoStatus | ''>('');
  const [bulkSortStart, setBulkSortStart] = useState('1');
  const [bulkTitlePrefix, setBulkTitlePrefix] = useState('');
  const [bulkTitleStart, setBulkTitleStart] = useState('1');
  const [sortCategory, setSortCategory] = useState<string>(CATEGORIES[0]);
  const [sortDraftIds, setSortDraftIds] = useState<string[]>([]);
  const [sortDragId, setSortDragId] = useState('');
  const [sortDragPosition, setSortDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const sortDragIdRef = useRef('');
  const sortPressTimerRef = useRef<number | null>(null);
  const sortPointerItemsRef = useRef<
    Array<{
      bottom: number;
      id: string;
      left: number;
      right: number;
      top: number;
    }>
  >([]);
  const sortPointerScrollYRef = useRef(0);
  const sortLastTargetRef = useRef('');
  const sortPointerStartRef = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [uploadPassword, setUploadPassword] = useState('');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadCategory, setUploadCategory] = useState('portrait');
  const [batchTitlePrefix, setBatchTitlePrefix] = useState('');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [uploadedObjectPaths, setUploadedObjectPaths] = useState<string[]>([]);
  const [canProcessIncoming, setCanProcessIncoming] = useState(false);
  const [importReview, setImportReview] = useState<ImportReviewSnapshot | null>(
    null,
  );
  const [selectedImportPaths, setSelectedImportPaths] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingIncoming, setIsProcessingIncoming] = useState(false);
  const [isLoadingImportReview, setIsLoadingImportReview] = useState(false);
  const [isArchivingImports, setIsArchivingImports] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0],
    [photos, selectedPhotoId],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...CATEGORIES,
          ...getUniqueCategories(photos),
          ...getUniqueCategories(sortSourcePhotos),
        ]),
      ).sort((first, second) => first.localeCompare(second)),
    [photos, sortSourcePhotos],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPhotos = useMemo(
    () =>
      selectedIds
        .map((id) => photos.find((photo) => photo.id === id))
        .filter((photo): photo is CmsPhoto => Boolean(photo)),
    [photos, selectedIds],
  );
  const sortCategoryPhotos = useMemo(
    () =>
      sortSourcePhotos
        .filter((photo) => !photo.deleted && photo.category === sortCategory)
        .sort(comparePhotosByManagedOrder),
    [sortCategory, sortSourcePhotos],
  );
  const sortPhotosById = useMemo(
    () => new Map(sortCategoryPhotos.map((photo) => [photo.id, photo])),
    [sortCategoryPhotos],
  );
  const sortDraftPhotos = useMemo(
    () =>
      sortDraftIds
        .map((id) => sortPhotosById.get(id))
        .filter((photo): photo is CmsPhoto => Boolean(photo)),
    [sortDraftIds, sortPhotosById],
  );
  const draggedSortPhoto = useMemo(
    () => (sortDragId ? sortPhotosById.get(sortDragId) : undefined),
    [sortDragId, sortPhotosById],
  );
  const canonicalSortIds = useMemo(
    () => sortCategoryPhotos.map((photo) => photo.id),
    [sortCategoryPhotos],
  );
  const isSortDirty =
    sortDraftIds.length === canonicalSortIds.length &&
    sortDraftIds.some((id, index) => id !== canonicalSortIds[index]);
  const visiblePhotoIds = useMemo(
    () => photos.map((photo) => photo.id),
    [photos],
  );
  const areAllVisiblePhotosSelected =
    visiblePhotoIds.length > 0 &&
    visiblePhotoIds.every((id) => selectedSet.has(id));
  const selectedPhotoKey = selectedPhoto?.id ?? '';
  const removedCount = useMemo(
    () => photos.filter((photo) => photo.deleted).length,
    [photos],
  );
  const hasRemovedSelected = selectedPhotos.some((photo) => photo.deleted);
  const hasDraftChanges = useMemo(
    () => isEditDraftChanged(selectedPhoto, draftPhoto),
    [draftPhoto, selectedPhoto],
  );
  const successfulUploads = useMemo(
    () => uploadItems.filter((item) => item.status === 'success').length,
    [uploadItems],
  );
  const failedUploads = useMemo(
    () => uploadItems.filter((item) => item.status === 'failed').length,
    [uploadItems],
  );
  const selectedImportSet = useMemo(
    () => new Set(selectedImportPaths),
    [selectedImportPaths],
  );
  const selectedImportCandidates = useMemo(
    () =>
      importReview?.candidates.filter(
        (candidate) =>
          candidate.objectPath && selectedImportSet.has(candidate.objectPath),
      ) ?? [],
    [importReview, selectedImportSet],
  );
  const nonRecommendedImportCandidates = useMemo(
    () =>
      importReview?.candidates.filter((candidate) => !candidate.recommended) ??
      [],
    [importReview],
  );
  const uploadPreviewTitleMap = useMemo(
    () =>
      createUploadTitleMap({
        batchTitlePrefix,
        category: uploadCategory,
        items: uploadItems,
        photos,
      }),
    [batchTitlePrefix, photos, uploadCategory, uploadItems],
  );

  const refreshPhotos = async () => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set('query', query.trim());
    }

    if (status !== 'all') {
      params.set('status', status);
    }

    if (category !== 'all') {
      params.set('category', category);
    }

    const response = await fetch(`/api/admin/photos/?${params.toString()}`);
    const data = (await response.json()) as AdminPhotosResponse;

    if (!response.ok || data.error || !data.photos || !data.stats) {
      throw new Error(data.error || '无法刷新照片列表。');
    }

    const nextPhotos = data.photos;

    setPhotos(nextPhotos);
    setStats(data.stats);
    setSelectedPhotoId((current) =>
      nextPhotos.find((photo) => photo.id === current)
        ? current
        : nextPhotos[0]?.id ?? '',
    );
    setSelectedIds((current) =>
      current.filter((id) => nextPhotos.some((photo) => photo.id === id)),
    );
  };

  const refreshSortPhotos = async () => {
    const response = await fetch('/api/admin/photos/?status=all');
    const data = (await response.json()) as AdminPhotosResponse;

    if (!response.ok || data.error || !data.photos) {
      throw new Error(data.error || '无法刷新排序照片。');
    }

    setSortSourcePhotos(data.photos);
  };

  const refreshJobs = async () => {
    const response = await fetch('/api/admin/processing/');
    const data = (await response.json()) as AdminJobsResponse;

    if (!response.ok || data.error || !data.jobs) {
      throw new Error(data.error || '无法刷新处理队列。');
    }

    setJobs(data.jobs);
  };

  const refreshSettings = async () => {
    const response = await fetch('/api/admin/settings/');
    const data = (await response.json()) as AdminSettingsResponse;

    if (!response.ok || data.error || !data.settings) {
      throw new Error(data.error || '无法刷新设置。');
    }

    setSettings(data.settings);
    setSettingsDraft(data.settings);
  };

  const loadPhotosForUploadTitlePlan = async () => {
    if (!batchTitlePrefix.trim()) {
      return photos;
    }

    try {
      const response = await fetch('/api/admin/photos/?status=all');
      const data = (await response.json()) as AdminPhotosResponse;

      if (response.ok && !data.error && data.photos) {
        return data.photos;
      }
    } catch (_error) {
      // 后台命名计划允许回退到当前已经加载的照片。
    }

    return photos;
  };

  const refreshImportReview = async (
    options: { selectRecommended?: boolean } = {},
  ) => {
    setIsLoadingImportReview(true);
    setError('');

    try {
      const response = await fetch('/api/admin/import-review/');
      const data = (await response.json()) as ImportReviewResponse;

      if (!response.ok || data.error || !data.snapshot) {
        throw new Error(data.error || '无法加载导入确认。');
      }

      setImportReview(data.snapshot);

      if (options.selectRecommended !== false) {
        setSelectedImportPaths(getRecommendedImportPaths(data.snapshot));
      } else {
        setSelectedImportPaths((current) =>
          current.filter((objectPath) =>
            data.snapshot?.candidates.some(
              (candidate) => candidate.objectPath === objectPath,
            ),
          ),
        );
      }

      return data.snapshot;
    } finally {
      setIsLoadingImportReview(false);
    }
  };

  const toggleImportPath = (objectPath: string) => {
    setSelectedImportPaths((current) =>
      current.includes(objectPath)
        ? current.filter((item) => item !== objectPath)
        : [...current, objectPath],
    );
  };

  const archiveImportCandidates = async (
    candidates: ImportReviewCandidate[],
  ) => {
    const objectPaths = getImportArchivePaths(candidates);

    if (objectPaths.length === 0) {
      setError('没有选择要归档的导入对象。');
      return;
    }

    setIsArchivingImports(true);
    setError('');

    try {
      const response = await fetch('/api/admin/import-review/', {
        body: JSON.stringify({
          action: 'archive',
          objectPaths,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const data = (await response.json()) as ImportReviewResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法归档导入对象。');
      }

      if (data.snapshot) {
        setImportReview(data.snapshot);
        setSelectedImportPaths(getRecommendedImportPaths(data.snapshot));
      } else {
        await refreshImportReview({ selectRecommended: true });
      }

      setMessage(
        `已归档 ${data.archived?.length ?? objectPaths.length} 个导入对象。`,
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : '无法归档导入对象。',
      );
    } finally {
      setIsArchivingImports(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshPhotos().catch((refreshError) => {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : '无法刷新照片列表。',
        );
      });
    }, 180);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, status]);

  useEffect(() => {
    setDraftPhoto(createEditDraft(selectedPhoto));
    setMessage('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhotoKey]);

  useEffect(() => {
    if (activeModule !== 'review' || importReview || isLoadingImportReview) {
      return;
    }

    refreshImportReview().catch((reviewError) => {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : '无法加载导入确认。',
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== 'sort') {
      return;
    }

    refreshSortPhotos().catch((sortRefreshError) => {
      setError(
        sortRefreshError instanceof Error
          ? sortRefreshError.message
          : '无法刷新排序照片。',
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  useEffect(() => {
    if (!categories.includes(sortCategory)) {
      setSortCategory(categories[0] ?? CATEGORIES[0]);
    }
  }, [categories, sortCategory]);

  useEffect(() => {
    setSortDraftIds(canonicalSortIds);
    sortDragIdRef.current = '';
    setSortDragId('');
  }, [canonicalSortIds, sortCategory]);

  const updateDraft = <Key extends keyof AdminEditDraft>(
    key: Key,
    value: AdminEditDraft[Key],
  ) => {
    setDraftPhoto((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateUploadItems = (id: string, patch: Partial<UploadItem>) => {
    setUploadItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  };

  const resetResultState = () => {
    setMessage('');
    setError('');
    setUploadedObjectPaths([]);
    setCanProcessIncoming(false);
  };

  const setFiles = (files: File[]) => {
    setUploadItems(
      files.map((file, index) => {
        const role = getUploadRole(file);

        return {
          error: '',
          file,
          id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
          livePhotoPairKey: getUploadPairKey(file.name),
          objectPath: '',
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          role,
          status: 'waiting',
          title: '',
        };
      }),
    );
    resetResultState();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.currentTarget.files ?? []));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const setActiveSortDragId = (photoId: string) => {
    sortDragIdRef.current = photoId;
    setSortDragId(photoId);
  };

  const getSortPointerItems = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-sort-photo-id]'))
      .map((item) => {
        const rect = item.getBoundingClientRect();

        return {
          bottom: rect.bottom,
          id: item.dataset.sortPhotoId ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
        };
      })
      .filter((item) => item.id);

  const reorderSortDraft = (
    targetId: string,
    placement: 'after' | 'before' = 'before',
  ) => {
    const activeId = sortDragIdRef.current || sortDragId;

    if (!activeId || activeId === targetId) {
      return;
    }

    setSortDraftIds((current) =>
      movePhotoIdBeforeTarget({
        activeId,
        ids: current,
        placement,
        targetId,
      }),
    );
  };

  const handleSortPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    photoId: string,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    sortPointerStartRef.current = {
      id: photoId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    const {
      clientX: pointerX,
      clientY: pointerY,
      currentTarget: element,
      pointerId,
    } = event;

    const beginDrag = () => {
      if (
        sortPointerStartRef.current?.pointerId !== pointerId ||
        !sortPointerStartRef.current
      ) {
        return;
      }

      sortPressTimerRef.current = null;
      event.preventDefault();
      try {
        element.setPointerCapture(pointerId);
      } catch (_error) {
        // The pointer may have ended before a long press timer fired.
      }
      setActiveSortDragId(photoId);
      setSortDragPosition({ x: pointerX, y: pointerY });
      sortPointerItemsRef.current = getSortPointerItems();
      sortPointerScrollYRef.current = window.scrollY;
      sortLastTargetRef.current = '';
    };

    if (event.pointerType === 'mouse') {
      beginDrag();
      return;
    }

    sortPressTimerRef.current = window.setTimeout(beginDrag, 240);
  };

  const clearSortPointerState = () => {
    if (sortPressTimerRef.current !== null) {
      window.clearTimeout(sortPressTimerRef.current);
      sortPressTimerRef.current = null;
    }

    sortPointerStartRef.current = null;
    sortPointerItemsRef.current = [];
    sortPointerScrollYRef.current = 0;
    sortLastTargetRef.current = '';
  };

  const scrollSortListNearViewportEdge = (pointerY: number) => {
    const edgeSize = 80;
    const maxStep = 28;

    if (pointerY < edgeSize) {
      window.scrollBy(0, -maxStep);
      return;
    }

    if (pointerY > window.innerHeight - edgeSize) {
      window.scrollBy(0, maxStep);
    }
  };

  const moveSortDragToPointer = (pointerX: number, pointerY: number) => {
    const scrollDelta = window.scrollY - sortPointerScrollYRef.current;
    const items = sortPointerItemsRef.current.map((item) => ({
      ...item,
      bottom: item.bottom + scrollDelta,
      top: item.top + scrollDelta,
    }));

    const target = getGridSortPointerTarget({
      activeId: sortDragIdRef.current || sortDragId,
      items,
      pointerX,
      pointerY,
    });

    if (target) {
      const targetKey = `${target.targetId}:${target.placement}`;

      if (targetKey === sortLastTargetRef.current) {
        return;
      }

      sortLastTargetRef.current = targetKey;
      reorderSortDraft(target.targetId, target.placement);
    }
  };

  const handleSortPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!sortDragIdRef.current && !sortDragId) {
      const start = sortPointerStartRef.current;

      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      ) {
        clearSortPointerState();
      }

      return;
    }

    event.preventDefault();
    setSortDragPosition({ x: event.clientX, y: event.clientY });
    scrollSortListNearViewportEdge(event.clientY);
    moveSortDragToPointer(event.clientX, event.clientY);
  };

  const handleSortPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    clearSortPointerState();
    setActiveSortDragId('');
    setSortDragPosition(null);
  };

  const resetCategorySort = () => {
    clearSortPointerState();
    setSortDraftIds(canonicalSortIds);
    setActiveSortDragId('');
    setSortDragPosition(null);
  };

  const getVisibleSortDraftIds = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-sort-photo-id]'))
      .map((row) => row.dataset.sortPhotoId ?? '')
      .filter(Boolean);

  const saveCategorySort = async () => {
    const visibleDraftIds = getVisibleSortDraftIds();
    const idsToSave =
      visibleDraftIds.length === sortDraftIds.length
        ? visibleDraftIds
        : sortDraftIds;

    if (idsToSave.length === 0) {
      setMessage('');
      setError('这个分类里没有可排序的照片。');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({
          action: 'sequence',
          ids: idsToSave,
          sortStart: 1,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法保存分类排序。');
      }

      const applySavedSort = (currentPhotos: CmsPhoto[]) =>
        applySavedSortOrderToPhotos({
          ids: idsToSave,
          photos: currentPhotos,
          sortStart: 1,
        });

      setPhotos(applySavedSort);
      setSortSourcePhotos(applySavedSort);
      setSortDraftIds(idsToSave);
      setMessage(
        `已保存 ${data.updated ?? idsToSave.length} 张 ${formatCategoryLabel(
          sortCategory,
        )} 照片的排序。`,
      );
    } catch (sortError) {
      setError(
        sortError instanceof Error ? sortError.message : '无法保存分类排序。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveSelectedPhoto = async () => {
    if (!selectedPhoto || !hasDraftChanges) {
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/api/admin/photos/${selectedPhoto.id}/`, {
        body: JSON.stringify(toEditPatch(draftPhoto)),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        photo?: CmsPhoto;
      };

      if (!response.ok || data.error || !data.photo) {
        throw new Error(data.error || '无法更新照片。');
      }

      const nextPhoto = data.photo;

      setPhotos((current) =>
        current.map((photo) =>
          photo.id === selectedPhoto.id ? (nextPhoto as CmsPhoto) : photo,
        ),
      );
      setDraftPhoto(createEditDraft(nextPhoto));
      setMessage('照片已保存。');
      await refreshPhotos();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '无法更新照片。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applyBulkUpdate = async () => {
    if (selectedIds.length === 0) {
      setMessage('');
      setError('请先选择要移动的照片。');
      return;
    }

    if (!bulkCategory && !bulkStatus) {
      setMessage('');
      setError('请选择目标分类或发布状态。');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({
          ids: selectedIds,
          patch: {
            ...(bulkCategory ? { category: bulkCategory } : {}),
            ...(bulkStatus ? { status: bulkStatus } : {}),
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法更新所选照片。');
      }

      await refreshPhotos();
      setSelectedIds([]);
      setBulkCategory('');
      setBulkStatus('');
      const updatedCount = data.updated ?? 0;

      if (updatedCount === 0) {
        setMessage('');
        setError('没有照片被更新，请刷新后确认所选照片仍存在。');
      } else if (bulkCategory && !bulkStatus) {
        setMessage(
          `已移动 ${updatedCount} 张照片到 ${formatCategoryLabel(bulkCategory)}。`,
        );
      } else {
        setMessage(`已更新 ${updatedCount} 张照片。`);
      }
    } catch (bulkError) {
      setError(
        bulkError instanceof Error ? bulkError.message : '无法更新所选照片。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applySelectedSortOrder = async () => {
    if (selectedIds.length === 0) {
      setMessage('');
      setError('请先选择要排序的照片。');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({
          action: 'sequence',
          ids: selectedIds,
          sortStart: parseIntegerInput(bulkSortStart, 1),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法更新所选照片排序。');
      }

      await refreshPhotos();
      setMessage(`已按当前选择顺序写入 ${data.updated ?? 0} 张照片的排序。`);
    } catch (sortError) {
      setError(
        sortError instanceof Error
          ? sortError.message
          : '无法更新所选照片排序。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applySelectedTitleSequence = async () => {
    if (selectedIds.length === 0) {
      setMessage('');
      setError('请先选择要重命名的照片。');
      return;
    }

    const titlePrefix = bulkTitlePrefix.trim();

    if (!titlePrefix) {
      setMessage('');
      setError('请输入标题前缀，例如 kathy。');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({
          action: 'sequence',
          ids: selectedIds,
          titlePrefix,
          titleStart: parseIntegerInput(bulkTitleStart, 1),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法重命名所选照片。');
      }

      await refreshPhotos();
      setBulkTitlePrefix('');
      setMessage(`已按当前选择顺序重命名 ${data.updated ?? 0} 张照片。`);
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : '无法重命名所选照片。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const restoreSelectedPhotos = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({
          action: 'restore',
          ids: selectedIds,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法恢复所选照片。');
      }

      await refreshPhotos();
      setSelectedIds([]);
      setMessage(`已恢复 ${data.updated ?? 0} 张照片。`);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : '无法恢复所选照片。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedPhotos = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/photos/bulk/', {
        body: JSON.stringify({ ids: selectedIds }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      });
      const data = (await response.json()) as {
        deleted?: number;
        error?: string;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法移除所选照片。');
      }

      await refreshPhotos();
      setSelectedIds([]);
      setMessage(
        `已从公开库移出 ${data.deleted ?? 0} 张照片，可在“已移除”中恢复。`,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : '无法移除所选照片。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const selectVisiblePhotos = () => {
    setSelectedIds(visiblePhotoIds);
  };

  const clearSelectedPhotos = () => {
    setSelectedIds([]);
  };

  const registerProcessingJob = async (
    item: UploadItem,
    objectPath: string,
  ) => {
    const response = await fetch('/api/admin/processing/', {
      body: JSON.stringify({
        filename: item.file.name,
        id: objectPath,
        objectPath,
        stage: '已上传',
        thumbnail: item.previewUrl,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const data = (await response.json()) as AdminJobsResponse;

    if (!response.ok || data.error || !data.job) {
      throw new Error(data.error || '处理队列登记失败。');
    }
  };

  const processIncoming = async (
    passwordValue = uploadPassword.trim(),
    objectPaths = uploadedObjectPaths,
  ) => {
    if (!passwordValue) {
      setError('请输入后台密码。');
      return;
    }

    setIsProcessingIncoming(true);
    setMessage(
      objectPaths.length > 0
        ? '正在处理已上传照片...'
        : '正在扫描待导入照片...',
    );
    setError('');

    try {
      const response = await fetch('/api/process-incoming/', {
        body: JSON.stringify({
          objectPaths,
          password: passwordValue,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const data = (await response.json()) as ProcessIncomingResponse;
      const processed = data.processed ?? 0;
      const failed = data.failed ?? 0;
      const scanned = data.scanned ?? processed + failed;

      if (failed > 0) {
        setError(
          `已处理 ${processed}/${scanned} 张，失败 ${failed} 张。请查看处理队列里的具体错误。`,
        );
      } else {
        setMessage(`已处理 ${processed}/${scanned} 张照片。`);
      }
      setCanProcessIncoming(false);
      await Promise.all([refreshJobs(), refreshPhotos()]);
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : '无法处理待导入照片。',
      );
      await refreshJobs().catch(() => undefined);
    } finally {
      setIsProcessingIncoming(false);
    }
  };

  const processSelectedImports = async () => {
    if (selectedImportPaths.length === 0) {
      setError('请至少选择一项可导入照片。');
      return;
    }

    await processIncoming(uploadPassword.trim(), selectedImportPaths);
    setSelectedImportPaths([]);
    await refreshImportReview({ selectRecommended: true }).catch(() => {
      // Processing may have removed every incoming object; the main result message is still useful.
    });
  };

  const uploadSelectedFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const passwordValue = uploadPassword.trim();

    if (!passwordValue) {
      setError('请输入后台密码。');
      return;
    }

    if (uploadItems.length === 0) {
      setError('请至少选择一张照片或一组 Live Photo。');
      return;
    }

    const invalidItem = uploadItems.find(
      (item) => !ALLOWED_CONTENT_TYPES.has(inferContentType(item.file)),
    );

    if (invalidItem) {
      setError(`不支持的上传格式：${invalidItem.file.name}。`);
      return;
    }

    const imageItems = uploadItems.filter((item) =>
      isImageContentType(inferContentType(item.file)),
    );

    if (imageItems.length === 0) {
      setError('请至少选择一张照片。Live Photo 视频必须和同名照片配对。');
      return;
    }

    const unpairedVideo = uploadItems.find(
      (item) =>
        item.role === 'live-video' && !isLivePhotoPaired(item, uploadItems),
    );

    if (unpairedVideo) {
      setError(
        `${unpairedVideo.file.name} 需要一张同名照片才能作为 Live Photo 上传。`,
      );
      return;
    }

    const titlePlanPhotos = await loadPhotosForUploadTitlePlan();
    const uploadTitleMap = createUploadTitleMap({
      batchTitlePrefix,
      category: uploadCategory,
      items: uploadItems,
      photos: titlePlanPhotos,
    });
    const batchId = createBatchId();
    const uploadPlan = uploadItems.map((item) => ({
      ...item,
      error: '',
      objectPath: '',
      progress: 0,
      status: 'waiting' as UploadItemStatus,
      title: uploadTitleMap.get(item.id) ?? getFallbackFileTitle(item.file),
    }));
    const successfulPhotoObjectPaths: string[] = [];
    let successfulFileCount = 0;

    setUploadItems(uploadPlan);
    setIsUploading(true);
    resetResultState();

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < uploadPlan.length; index += 1) {
      const item = uploadPlan[index] as UploadItem;
      const contentType = inferContentType(item.file);
      const livePhotoPairKey = isLivePhotoPaired(item, uploadPlan)
        ? item.livePhotoPairKey
        : '';

      updateUploadItems(item.id, {
        error: '',
        progress: 0,
        status: 'uploading',
      });

      try {
        const response = await fetch('/api/create-upload-url/', {
          body: JSON.stringify({
            batchId,
            batchIndex: index + 1,
            category: uploadCategory,
            contentType,
            description: uploadDescription,
            filename: item.file.name,
            livePhotoPairKey,
            location: uploadLocation,
            password: passwordValue,
            role: item.role,
            title: item.title,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response));
        }

        const data = (await response.json()) as UploadUrlResponse;

        if ('error' in data) {
          throw new Error(data.error);
        }

        const updateItemProgress = (progress: number) =>
          updateUploadItems(item.id, { progress });

        await uploadFileThroughSiteProxy({
          contentType,
          file: item.file,
          objectPath: data.objectPath,
          onProgress: updateItemProgress,
          password: passwordValue,
        });

        successfulFileCount += 1;

        if (item.role === 'image') {
          await registerProcessingJob(item, data.objectPath);
          successfulPhotoObjectPaths.push(data.objectPath);
        }

        updateUploadItems(item.id, {
          objectPath: data.objectPath,
          progress: 100,
          status: 'success',
        });
      } catch (uploadError) {
        updateUploadItems(item.id, {
          error:
            uploadError instanceof Error
              ? uploadError.message
              : '上传失败，请重试。',
          status: 'failed',
        });
      }
    }
    /* eslint-enable no-await-in-loop */

    setIsUploading(false);
    setUploadedObjectPaths(successfulPhotoObjectPaths);
    await refreshJobs().catch(() => undefined);

    const uploadFailedCount = uploadPlan.length - successfulFileCount;

    if (successfulPhotoObjectPaths.length === 0) {
      setError('没有可处理的已上传照片，请检查失败的上传项。');
      return;
    }

    setCanProcessIncoming(true);
    setMessage(
      `已上传 ${successfulFileCount} 个文件。处理前请确认 ${successfulPhotoObjectPaths.length} 张照片；失败 ${uploadFailedCount} 个。`,
    );

    if (autoProcess) {
      setActiveModule('review');
      await refreshImportReview({ selectRecommended: true });
    }
  };

  const retryJob = async (id: string) => {
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/processing/', {
        body: JSON.stringify({ action: 'retry', id }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const data = (await response.json()) as AdminJobsResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || '无法重试处理任务。');
      }

      await refreshJobs();
      setMessage('任务已重新加入队列。');
    } catch (retryError) {
      setError(
        retryError instanceof Error ? retryError.message : '无法重试处理任务。',
      );
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/settings/', {
        body: JSON.stringify({
          defaultPublishStatus: settingsDraft.defaultPublishStatus,
          manifestCacheEnabled: settingsDraft.manifestCacheEnabled,
          storageBucket: settingsDraft.storageBucket,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const data = (await response.json()) as AdminSettingsResponse;

      if (!response.ok || data.error || !data.settings) {
        throw new Error(data.error || '无法保存设置。');
      }

      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setMessage('设置已保存。');
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : '无法保存设置。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const refreshManifest = async () => {
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/settings/', {
        method: 'POST',
      });
      const data = (await response.json()) as AdminSettingsResponse;

      if (!response.ok || data.error || !data.settings) {
        throw new Error(data.error || '无法刷新 Manifest 缓存。');
      }

      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setMessage('Manifest 缓存已刷新。');
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : '无法刷新 Manifest 缓存。',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderLibrary = () => (
    <section className="grid min-h-[calc(100vh-220px)] min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`${panelClassName} min-w-0 overflow-hidden`}>
        <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] p-3 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className={`${inputClassName} col-span-2 w-full sm:min-w-[220px] sm:flex-1`}
            placeholder="搜索标题、标签、相机、地点"
          />
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.currentTarget.value as AdminStatusFilter)
            }
            className={compactSelectClassName}
          >
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {STATUS_LABELS[item]}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            className={compactSelectClassName}
          >
            <option value="all">全部分类</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {formatCategoryLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="sticky bottom-2 z-20 grid grid-cols-2 items-center gap-2 border-y border-white/[0.07] bg-[#1c1713]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl sm:flex sm:flex-wrap sm:p-3 lg:static lg:bottom-auto lg:z-auto lg:border-b lg:border-t-0 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none">
          <span className="col-span-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 sm:mr-1">
            已选择 {selectedIds.length} / 当前显示 {photos.length}
          </span>
          <button
            type="button"
            onClick={selectVisiblePhotos}
            disabled={
              isSaving || areAllVisiblePhotosSelected || photos.length === 0
            }
            className={`${buttonClassName} w-full !py-1.5 text-xs text-[#c5dfd8] ring-1 ring-[#9db6b0]/25 hover:bg-[#9db6b0]/10 sm:w-auto`}
          >
            选择当前
          </button>
          <button
            type="button"
            onClick={clearSelectedPhotos}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} w-full !py-1.5 text-xs text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
          >
            清空
          </button>
          <select
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.currentTarget.value)}
            className={`${compactSelectClassName} !h-9 text-xs sm:max-w-[150px]`}
          >
            <option value="">移动分类</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {formatCategoryLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={bulkStatus}
            onChange={(event) =>
              setBulkStatus(event.currentTarget.value as CmsPhotoStatus | '')
            }
            className={`${compactSelectClassName} !h-9 text-xs sm:max-w-[132px]`}
          >
            <option value="">设置状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="hidden">隐藏</option>
          </select>
          <button
            type="button"
            onClick={applyBulkUpdate}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} w-full bg-[#9db6b0] !py-1.5 text-xs text-[#17110e] sm:w-auto`}
          >
            应用
          </button>
          <input
            value={bulkSortStart}
            onChange={(event) => setBulkSortStart(event.currentTarget.value)}
            className={`${inputClassName} !h-9 w-full px-3 text-xs sm:w-20`}
            inputMode="numeric"
            placeholder="排序"
            aria-label="排序起始值"
          />
          <button
            type="button"
            onClick={applySelectedSortOrder}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} w-full !py-1.5 text-xs text-[#c5dfd8] ring-1 ring-[#9db6b0]/25 hover:bg-[#9db6b0]/10 sm:w-auto`}
          >
            写入排序
          </button>
          <input
            value={bulkTitlePrefix}
            onChange={(event) => setBulkTitlePrefix(event.currentTarget.value)}
            className={`${inputClassName} !h-9 w-full px-3 text-xs sm:w-28`}
            placeholder="kathy"
            aria-label="批量标题前缀"
          />
          <input
            value={bulkTitleStart}
            onChange={(event) => setBulkTitleStart(event.currentTarget.value)}
            className={`${inputClassName} !h-9 w-full px-3 text-xs sm:w-16`}
            inputMode="numeric"
            placeholder="1"
            aria-label="批量标题起始值"
          />
          <button
            type="button"
            onClick={applySelectedTitleSequence}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} w-full !py-1.5 text-xs text-[#c5dfd8] ring-1 ring-[#9db6b0]/25 hover:bg-[#9db6b0]/10 sm:w-auto`}
          >
            重命名
          </button>
          <button
            type="button"
            onClick={restoreSelectedPhotos}
            disabled={
              isSaving || selectedIds.length === 0 || !hasRemovedSelected
            }
            className={`${buttonClassName} w-full !py-1.5 text-xs text-emerald-100 ring-1 ring-emerald-300/20 hover:bg-emerald-400/10 sm:w-auto`}
          >
            恢复
          </button>
          <button
            type="button"
            onClick={deleteSelectedPhotos}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} w-full !py-1.5 text-xs text-red-200 ring-1 ring-red-300/20 hover:bg-red-400/10 sm:w-auto`}
          >
            移除
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-3 xl:grid-cols-5">
          {photos.map((photo) => {
            const isSelected = selectedSet.has(photo.id);
            const isActive = selectedPhoto?.id === photo.id;
            const hasMovedCategory =
              Boolean(photo.originalCategory) &&
              photo.originalCategory !== photo.category;
            let ringClassName = 'ring-1 ring-white/[0.06]';

            if (photo.deleted) {
              ringClassName = 'ring-1 ring-red-300/25';
            }

            if (isActive) {
              ringClassName = 'ring-2 ring-[#9db6b0]';
            }

            return (
              <article
                key={photo.id}
                className={`group relative overflow-hidden rounded-md bg-black ${
                  photo.deleted ? 'opacity-70' : ''
                } ${ringClassName}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhotoId(photo.id);
                  }}
                  className="block aspect-[4/5] w-full overflow-hidden text-left"
                >
                  <img
                    src={photo.thumbnail || photo.src}
                    alt={photo.title}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition duration-200 group-hover:scale-[1.03]"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <span className="block truncate text-sm font-semibold">
                      {photo.title}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          photo.deleted
                            ? 'bg-red-500/20 text-red-100'
                            : 'bg-black/45 text-stone-300'
                        }`}
                      >
                        {getPhotoWorkflowLabel(photo)}
                      </span>
                      <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs text-stone-300">
                        {formatCategoryLabel(photo.category)}
                      </span>
                      {typeof photo.sortOrder === 'number' ? (
                        <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs text-stone-300">
                          #{photo.sortOrder}
                        </span>
                      ) : null}
                      {hasMovedCategory ? (
                        <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-xs text-amber-100">
                          原分类{' '}
                          {formatCategoryLabel(photo.originalCategory || '')}
                        </span>
                      ) : null}
                      {photo.featured ? (
                        <span className="rounded-full bg-[#9db6b0]/20 px-2 py-0.5 text-xs text-[#c5dfd8]">
                          精选
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhotoId(photo.id);
                    setActiveModule('editor');
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-stone-100 opacity-0 backdrop-blur transition hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
                >
                  编辑
                </button>
                <label className="absolute left-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 backdrop-blur">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(photo.id)}
                    className="size-4 accent-[#9db6b0]"
                    aria-label={`选择 ${photo.title}`}
                  />
                </label>
              </article>
            );
          })}
        </div>
      </div>

      <aside className={`${panelClassName} min-w-0 p-3 sm:p-4`}>
        <h2 className="text-lg font-semibold">图库操作</h2>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          搜索会覆盖标题、标签、相机、镜头、分类、描述和地点。移除后的照片仍可在后台恢复，
          但不会出现在公开图库中。
        </p>
        <div className="mt-5 space-y-3 text-sm">
          <p className="flex justify-between text-stone-400">
            <span>公开可见</span>
            <strong className="text-stone-100">
              {stats.statusCounts.published}
            </strong>
          </p>
          <p className="flex justify-between text-stone-400">
            <span>草稿</span>
            <strong className="text-stone-100">
              {stats.statusCounts.draft}
            </strong>
          </p>
          <p className="flex justify-between text-stone-400">
            <span>隐藏</span>
            <strong className="text-stone-100">
              {stats.statusCounts.hidden}
            </strong>
          </p>
          <p className="flex justify-between text-stone-400">
            <span>当前移除</span>
            <strong className="text-stone-100">{removedCount}</strong>
          </p>
        </div>
      </aside>
    </section>
  );

  const renderUpload = () => (
    <form
      className={`${panelClassName} min-w-0 p-3 sm:p-5`}
      onSubmit={uploadSelectedFiles}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">后台密码</span>
            <input
              type="password"
              autoComplete="current-password"
              className={`${fieldSelectClassName} rounded-full`}
              value={uploadPassword}
              onChange={(event) => setUploadPassword(event.currentTarget.value)}
              disabled={isUploading || isProcessingIncoming}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">分类</span>
            <select
              className={`${fieldClassName} rounded-full`}
              value={uploadCategory}
              onChange={(event) => setUploadCategory(event.currentTarget.value)}
              disabled={isUploading || isProcessingIncoming}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {formatCategoryLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">批量标题前缀</span>
            <input
              className={`${fieldClassName} rounded-full`}
              value={batchTitlePrefix}
              onChange={(event) =>
                setBatchTitlePrefix(event.currentTarget.value)
              }
              disabled={isUploading || isProcessingIncoming}
              placeholder="Tokyo Evening"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">地点</span>
            <input
              className={`${fieldClassName} rounded-full`}
              value={uploadLocation}
              onChange={(event) => setUploadLocation(event.currentTarget.value)}
              disabled={isUploading || isProcessingIncoming}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">描述</span>
            <textarea
              className={`${fieldClassName} min-h-28 resize-y`}
              value={uploadDescription}
              onChange={(event) =>
                setUploadDescription(event.currentTarget.value)
              }
              disabled={isUploading || isProcessingIncoming}
            />
          </label>
          <label className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={autoProcess}
              onChange={(event) => setAutoProcess(event.currentTarget.checked)}
              disabled={isUploading || isProcessingIncoming}
              className="size-4 accent-[#9db6b0]"
            />
            上传后打开导入确认
          </label>
          <button
            type="submit"
            disabled={isUploading || isProcessingIncoming}
            className={`${buttonClassName} w-full bg-[#9db6b0] py-3 text-[#17110e]`}
          >
            {isUploading ? '上传中...' : '批量上传'}
          </button>
          <button
            type="button"
            onClick={() => processIncoming()}
            disabled={isUploading || isProcessingIncoming}
            className={`${buttonClassName} w-full text-[#c5dfd8] ring-1 ring-[#9db6b0]/30 hover:bg-[#9db6b0]/10`}
          >
            {getProcessIncomingButtonLabel({
              canProcessIncoming,
              isProcessingIncoming,
            })}
          </button>
        </div>

        <div className="space-y-4">
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="grid min-h-[180px] cursor-pointer place-items-center rounded-lg border border-dashed border-white/[0.18] bg-white/[0.035] p-4 text-center transition hover:border-[#9db6b0]/60 hover:bg-white/[0.055] sm:min-h-[220px] sm:p-6"
          >
            <input
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              onChange={handleFileChange}
              disabled={isUploading || isProcessingIncoming}
            />
            <span>
              <span className="block text-lg font-semibold">
                拖拽照片到这里
              </span>
              <span className="mt-2 block text-sm text-stone-400">
                支持 JPG、PNG、WebP、HEIC、HEIF，以及同名配对的 MOV/MP4 Live
                Photo。 上传会通过站点代理分片完成，更适合手机浏览器。
              </span>
            </span>
          </label>

          {uploadItems.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-stone-400">
                <span>
                  已上传 {successfulUploads} / {uploadItems.length}
                </span>
                <span>失败 {failedUploads}</span>
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {uploadItems.map((item) => {
                  const title =
                    item.title ||
                    uploadPreviewTitleMap.get(item.id) ||
                    getFallbackFileTitle(item.file);
                  const itemIssue = getUploadItemIssue(item, uploadItems);
                  const hasLivePair = isLivePhotoPaired(item, uploadItems);

                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.04]"
                    >
                      {item.role === 'image' ? (
                        <img
                          src={item.previewUrl}
                          alt={title}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      ) : (
                        <div className="grid aspect-[4/3] place-items-center bg-black/35 px-4 text-center">
                          <span className="text-sm font-semibold text-[#c5dfd8]">
                            Live Photo 视频
                          </span>
                          <span className="mt-1 block text-xs text-stone-500">
                            {hasLivePair ? '已按文件名配对' : '等待同名照片'}
                          </span>
                        </div>
                      )}
                      <div className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {title}
                            </p>
                            <p className="truncate text-xs text-stone-500">
                              {item.file.name}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                item.status === 'failed'
                                  ? 'bg-red-400/10 text-red-200'
                                  : 'bg-[#9db6b0]/10 text-[#c9d8d4]'
                              }`}
                            >
                              {UPLOAD_STATUS_LABELS[item.status]}
                            </span>
                            {hasLivePair ? (
                              <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-xs text-emerald-100">
                                Live
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-[#9db6b0] transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        {item.objectPath ? (
                          <p className="break-all text-xs text-stone-500">
                            {item.objectPath}
                          </p>
                        ) : null}
                        {itemIssue ? (
                          <p className="text-xs leading-5 text-amber-100">
                            {itemIssue}
                          </p>
                        ) : null}
                        {item.error ? (
                          <p className="text-xs leading-5 text-red-200">
                            {item.error}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );

  const renderImportReview = () => {
    const summary = importReview?.summary;

    return (
      <section className="space-y-4">
        <div className={`${panelClassName} min-w-0 p-3 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">导入确认</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
                处理前先确认 incoming
                里的对象。重复组里会默认选中最新且完整的一组，
                避免同一批照片被反复导入。
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <button
                type="button"
                onClick={() => refreshImportReview()}
                disabled={isLoadingImportReview}
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                {isLoadingImportReview ? '刷新中...' : '刷新'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedImportPaths(
                    getRecommendedImportPaths(importReview),
                  )
                }
                disabled={!importReview}
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                选择推荐项
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedImportPaths(
                    getAllCompleteImportPaths(importReview),
                  )
                }
                disabled={!importReview}
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                选择全部可导入
              </button>
              <button
                type="button"
                onClick={() => setSelectedImportPaths([])}
                disabled={selectedImportPaths.length === 0}
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                清空
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
            <StatPanel label="待导入" value={summary?.total ?? 0} />
            <StatPanel label="推荐" value={summary?.recommended ?? 0} />
            <StatPanel label="可导入" value={summary?.complete ?? 0} />
            <StatPanel label="重复" value={summary?.duplicates ?? 0} />
            <StatPanel
              label="需检查"
              value={
                (summary?.missingSidecar ?? 0) + (summary?.orphanJson ?? 0)
              }
            />
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border border-white/[0.07] bg-white/[0.035] p-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm text-stone-400">
              已选择{' '}
              <strong className="text-stone-100">
                {selectedImportPaths.length}
              </strong>{' '}
              项可导入照片。
            </p>
            <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <button
                type="button"
                onClick={processSelectedImports}
                disabled={
                  isProcessingIncoming || selectedImportPaths.length === 0
                }
                className={`${buttonClassName} w-full bg-[#9db6b0] text-[#17110e] hover:bg-[#b7cec8] sm:w-auto`}
              >
                {isProcessingIncoming ? '处理中...' : '处理所选'}
              </button>
              <button
                type="button"
                onClick={() =>
                  archiveImportCandidates(selectedImportCandidates)
                }
                disabled={
                  isArchivingImports || selectedImportCandidates.length === 0
                }
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                归档所选
              </button>
              <button
                type="button"
                onClick={() =>
                  archiveImportCandidates(nonRecommendedImportCandidates)
                }
                disabled={
                  isArchivingImports ||
                  nonRecommendedImportCandidates.length === 0
                }
                className={`${buttonClassName} w-full text-amber-100 ring-1 ring-amber-200/20 hover:bg-amber-200/10 sm:w-auto`}
              >
                归档非推荐项
              </button>
            </div>
          </div>
        </div>

        {importReview ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {importReview.candidates.map((candidate) => {
              const canSelect =
                candidate.status === 'complete' &&
                Boolean(candidate.objectPath);
              const isSelected = Boolean(
                candidate.objectPath &&
                  selectedImportSet.has(candidate.objectPath),
              );
              const updatedLabel = candidate.updated
                ? candidate.updated.replace('T', ' ').slice(0, 16)
                : '—';

              return (
                <article
                  key={candidate.id}
                  className={`overflow-hidden rounded-lg border ${getImportCandidateClassName(
                    candidate,
                  )}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      candidate.objectPath
                        ? toggleImportPath(candidate.objectPath)
                        : undefined
                    }
                    disabled={!canSelect}
                    className="block w-full text-left disabled:cursor-default"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.04]">
                      {candidate.previewUrl ? (
                        <img
                          src={candidate.previewUrl}
                          alt={candidate.filename}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center px-4 text-center text-sm text-stone-400">
                          无预览图
                        </div>
                      )}
                      <span className="absolute left-3 top-3 grid size-6 place-items-center rounded-full bg-black/45 ring-1 ring-white/15">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          disabled={!canSelect}
                          className="size-4 accent-[#9db6b0]"
                        />
                      </span>
                      {candidate.recommended ? (
                        <span className="absolute right-3 top-3 rounded-full bg-[#9db6b0] px-2 py-1 text-xs font-semibold text-[#17110e]">
                          推荐
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {candidate.filename}
                        </p>
                        <p className="text-xs text-[#9db6b0]">
                          {formatCategoryLabel(candidate.category)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-black/20 px-2 py-1 text-xs text-stone-300">
                        {IMPORT_REVIEW_STATUS_LABELS[candidate.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-400">
                      <span>{formatFileSize(candidate.size)}</span>
                      <span className="text-right">{updatedLabel}</span>
                      <span>重复 {candidate.duplicateCount}</span>
                      <span className="truncate text-right">
                        {candidate.objectPath ? '图片 + JSON' : '仅元数据'}
                      </span>
                    </div>
                    {candidate.reasons.length > 0 ? (
                      <p className="text-xs leading-5 text-amber-100">
                        {candidate.reasons.join(', ')}
                      </p>
                    ) : null}
                    <p className="break-all text-xs leading-5 text-stone-500">
                      {candidate.objectPath ?? candidate.metadataPath}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            className={`${panelClassName} grid min-h-[300px] place-items-center p-6 text-center text-sm text-stone-400`}
          >
            {isLoadingImportReview
              ? '正在加载待导入照片...'
              : '还没有加载导入确认。'}
          </div>
        )}
      </section>
    );
  };

  const renderSort = () => (
    <section className="space-y-4">
      <div className={`${panelClassName} min-w-0 p-3 sm:p-5`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">分类排序</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
              按住照片卡片拖动，设置单个分类里的手动顺序。保存后会从 1 到{' '}
              {sortDraftIds.length || 0} 写入
              sortOrder，公开分类页会优先使用这个顺序。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[220px_auto_auto] sm:items-center">
            <select
              value={sortCategory}
              onChange={(event) => setSortCategory(event.currentTarget.value)}
              className={`${compactSelectClassName} h-10`}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {formatCategoryLabel(item)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetCategorySort}
              disabled={isSaving || !isSortDirty}
              className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
            >
              重置
            </button>
            <button
              type="button"
              onClick={saveCategorySort}
              disabled={isSaving || sortDraftIds.length === 0}
              className={`${buttonClassName} w-full bg-[#9db6b0] text-[#17110e] hover:bg-[#b7cec8] sm:w-auto`}
            >
              {isSaving ? '保存中...' : '保存排序'}
            </button>
          </div>
        </div>
      </div>

      <div className={`${panelClassName} min-w-0 overflow-hidden p-3 sm:p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-400">
          <span>
            {formatCategoryLabel(sortCategory)} · {sortDraftPhotos.length}{' '}
            张照片
          </span>
          <span>{isSortDirty ? '有未保存排序' : '当前排序已保存'}</span>
        </div>

        {draggedSortPhoto && sortDragPosition ? (
          <div
            className="pointer-events-none fixed z-[80] w-[min(42vw,180px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-[#9db6b0] bg-[#17110e] shadow-2xl shadow-black/50"
            style={{ left: sortDragPosition.x, top: sortDragPosition.y }}
          >
            <div className="aspect-[4/3] overflow-hidden bg-black">
              <img
                src={draggedSortPhoto.thumbnail || draggedSortPhoto.src}
                alt=""
                draggable={false}
                className="size-full object-cover"
              />
            </div>
            <p className="truncate px-2 py-1.5 text-xs font-semibold text-stone-100">
              {draggedSortPhoto.title}
            </p>
          </div>
        ) : null}

        {sortDraftPhotos.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {sortDraftPhotos.map((photo, index) => {
              const isDragging = sortDragId === photo.id;

              return (
                <button
                  type="button"
                  key={photo.id}
                  data-sort-photo-id={photo.id}
                  aria-label={`按住拖动排序 ${photo.title}`}
                  onPointerCancel={handleSortPointerEnd}
                  onPointerDown={(event) =>
                    handleSortPointerDown(event, photo.id)
                  }
                  onPointerMove={handleSortPointerMove}
                  onPointerUp={handleSortPointerEnd}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  className={`group min-w-0 select-none overflow-hidden rounded-lg border bg-white/[0.035] text-left transition touch-pan-y [-webkit-touch-callout:none] ${
                    isDragging
                      ? 'z-10 scale-[1.02] border-[#9db6b0] bg-[#9db6b0]/10 opacity-25 shadow-xl shadow-black/30 touch-none'
                      : 'border-white/[0.08] hover:border-[#9db6b0]/50'
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-black">
                    <img
                      src={photo.thumbnail || photo.src}
                      alt={photo.title}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-stone-100 backdrop-blur">
                      {index + 1}
                    </span>
                  </div>
                  <p className="truncate px-2 py-2 text-xs font-semibold text-stone-100 sm:text-sm">
                    {photo.title}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 grid min-h-[220px] place-items-center rounded-lg border border-dashed border-white/[0.12] text-center text-sm text-stone-500">
            这个分类里没有照片。
          </div>
        )}
      </div>
    </section>
  );

  const renderEditor = () => (
    <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className={`${panelClassName} min-w-0 overflow-hidden`}>
        {selectedPhoto ? (
          <img
            src={selectedPhoto.src}
            alt={selectedPhoto.title}
            className="max-h-[42vh] w-full object-contain sm:max-h-[calc(100vh-260px)]"
          />
        ) : (
          <div className="grid min-h-[420px] place-items-center text-sm text-stone-400">
            请从图库中选择一张照片。
          </div>
        )}
      </div>

      <aside className={`${panelClassName} min-w-0 p-3 sm:p-4`}>
        {selectedPhoto ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveSelectedPhoto();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm uppercase tracking-[0.18em] text-[#9db6b0]">
                  {formatCategoryLabel(selectedPhoto.category)}
                </p>
                <h2 className="truncate text-xl font-semibold">
                  {selectedPhoto.title}
                </h2>
              </div>
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm text-stone-300">
                {getPhotoWorkflowLabel(selectedPhoto)}
              </span>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-stone-400">标题</span>
              <input
                className={fieldClassName}
                value={draftPhoto.title}
                onChange={(event) =>
                  updateDraft('title', event.currentTarget.value)
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">分类</span>
                <input
                  className={fieldSelectClassName}
                  list="admin-category-options"
                  value={draftPhoto.category}
                  onChange={(event) =>
                    updateDraft('category', event.currentTarget.value)
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">状态</span>
                <select
                  className={fieldClassName}
                  value={draftPhoto.status}
                  onChange={(event) =>
                    updateDraft(
                      'status',
                      event.currentTarget.value as CmsPhotoStatus,
                    )
                  }
                >
                  <option value="published">已发布</option>
                  <option value="draft">草稿</option>
                  <option value="hidden">隐藏</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">排序值</span>
                <input
                  className={fieldClassName}
                  inputMode="numeric"
                  value={draftPhoto.sortOrder}
                  onChange={(event) =>
                    updateDraft('sortOrder', event.currentTarget.value)
                  }
                  placeholder="auto"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-stone-400">标签</span>
              <input
                className={fieldClassName}
                value={draftPhoto.tags}
                onChange={(event) =>
                  updateDraft('tags', event.currentTarget.value)
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">地点</span>
                <input
                  className={fieldClassName}
                  value={draftPhoto.location}
                  onChange={(event) =>
                    updateDraft('location', event.currentTarget.value)
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">日期</span>
                <input
                  className={fieldClassName}
                  value={draftPhoto.dateTaken}
                  onChange={(event) =>
                    updateDraft('dateTaken', event.currentTarget.value)
                  }
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-stone-400">描述</span>
              <textarea
                className={`${fieldClassName} min-h-28`}
                value={draftPhoto.description}
                onChange={(event) =>
                  updateDraft('description', event.currentTarget.value)
                }
              />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={draftPhoto.featured}
                onChange={(event) =>
                  updateDraft('featured', event.currentTarget.checked)
                }
                className="size-4 accent-[#9db6b0]"
              />
              设为精选照片
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setDraftPhoto(createEditDraft(selectedPhoto))}
                disabled={isSaving || !hasDraftChanges}
                className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
              >
                重置
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasDraftChanges}
                className={`${buttonClassName} w-full bg-[#9db6b0] text-[#17110e] hover:bg-[#b7cec8] sm:w-auto`}
              >
                {isSaving ? '保存中...' : '保存照片'}
              </button>
            </div>
            <datalist id="admin-category-options">
              {categories.map((item) => (
                <option key={item} value={item}>
                  {formatCategoryLabel(item)}
                </option>
              ))}
            </datalist>
            <div className="rounded-md bg-white/[0.04] p-3 text-xs leading-5 text-stone-400">
              <p>ID: {selectedPhoto.id}</p>
              <p>
                分类：{formatCategoryLabel(selectedPhoto.category)}
                {selectedPhoto.originalCategory &&
                selectedPhoto.originalCategory !== selectedPhoto.category
                  ? ` · 原分类 ${formatCategoryLabel(
                      selectedPhoto.originalCategory,
                    )}`
                  : ''}
              </p>
              {typeof selectedPhoto.sortOrder === 'number' ? (
                <p>排序值：{selectedPhoto.sortOrder}</p>
              ) : null}
              <p>
                尺寸：{selectedPhoto.width} x {selectedPhoto.height}
              </p>
              <p className="break-all">源文件：{selectedPhoto.src}</p>
            </div>
          </form>
        ) : (
          <div className="grid min-h-[360px] place-items-center text-sm text-stone-400">
            请选择要编辑的照片。
          </div>
        )}
      </aside>
    </section>
  );

  const renderQueue = () => (
    <section className={`${panelClassName} min-w-0 overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-3 sm:items-center sm:p-4">
        <div>
          <h2 className="text-lg font-semibold">处理队列</h2>
          <p className="mt-1 text-sm text-stone-400">
            查看缩略图、EXIF 和 Live Photo 的处理状态。
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshJobs()}
          className={`${buttonClassName} shrink-0 text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
        >
          刷新
        </button>
      </div>
      <div className="divide-y divide-white/[0.07]">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <article
              key={job.id}
              className="grid gap-3 p-3 sm:grid-cols-[80px_minmax(0,1fr)_140px] sm:p-4"
            >
              <div className="size-20 overflow-hidden rounded-md bg-white/[0.04]">
                {job.thumbnail ? (
                  <img
                    src={job.thumbnail}
                    alt={job.filename}
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{job.filename}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      job.status === 'failed'
                        ? 'bg-red-400/10 text-red-200'
                        : 'bg-[#9db6b0]/10 text-[#c9d8d4]'
                    }`}
                  >
                    {JOB_STATUS_LABELS[job.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-400">
                  {formatJobStage(job.stage)}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-stone-400 sm:grid-cols-3">
                  <span>缩略图：{job.thumbnail ? '完成' : '等待中'}</span>
                  <span>EXIF：{STEP_STATUS_LABELS[job.exifStatus]}</span>
                  <span>
                    Live Photo：{STEP_STATUS_LABELS[job.livePhotoStatus]}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#9db6b0]"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                {job.error ? (
                  <p className="mt-2 text-xs leading-5 text-red-200">
                    {job.error}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-stretch sm:justify-end">
                <button
                  type="button"
                  onClick={() => retryJob(job.id)}
                  disabled={job.status !== 'failed'}
                  className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
                >
                  重试
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="grid min-h-[260px] place-items-center text-sm text-stone-400">
            还没有处理任务。
          </div>
        )}
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`${panelClassName} min-w-0 space-y-4 p-3 sm:p-5`}>
        <label className="block space-y-1">
          <span className="text-sm text-stone-400">存储桶</span>
          <input
            className={fieldSelectClassName}
            value={settingsDraft.storageBucket}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                storageBucket: event.currentTarget.value,
              }))
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-stone-400">默认发布状态</span>
          <select
            className={fieldClassName}
            value={settingsDraft.defaultPublishStatus}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                defaultPublishStatus: event.currentTarget
                  .value as CmsPhotoStatus,
              }))
            }
          >
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="hidden">隐藏</option>
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={settingsDraft.manifestCacheEnabled}
            onChange={(event) =>
              setSettingsDraft((current) => ({
                ...current,
                manifestCacheEnabled: event.currentTarget.checked,
              }))
            }
            className="size-4 accent-[#9db6b0]"
          />
          启用 Manifest 缓存
        </label>
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => refreshSettings()}
            className={`${buttonClassName} w-full text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06] sm:w-auto`}
          >
            重置
          </button>
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving}
            className={`${buttonClassName} w-full bg-[#9db6b0] text-[#17110e] sm:w-auto`}
          >
            保存设置
          </button>
          <button
            type="button"
            onClick={refreshManifest}
            disabled={isSaving}
            className={`${buttonClassName} w-full text-[#c5dfd8] ring-1 ring-[#9db6b0]/30 hover:bg-[#9db6b0]/10 sm:w-auto`}
          >
            刷新 Manifest
          </button>
        </div>
      </div>
      <aside
        className={`${panelClassName} min-w-0 space-y-3 p-3 text-sm sm:p-4`}
      >
        <h2 className="text-lg font-semibold">运行状态</h2>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>上传服务</span>
          <strong className="text-stone-100">
            {settings.uploadFunctionConfigured
              ? SERVICE_STATUS_LABELS.configured
              : SERVICE_STATUS_LABELS.missing}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>处理服务</span>
          <strong className="text-stone-100">
            {settings.processFunctionConfigured
              ? SERVICE_STATUS_LABELS.configured
              : SERVICE_STATUS_LABELS.missing}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>Manifest 版本</span>
          <strong className="truncate text-stone-100">
            {settings.manifestCacheVersion}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>上次刷新</span>
          <strong className="truncate text-stone-100">
            {settings.lastManifestRefreshAt || '从未刷新'}
          </strong>
        </p>
      </aside>
    </section>
  );

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'editor':
        return renderEditor();
      case 'queue':
        return renderQueue();
      case 'review':
        return renderImportReview();
      case 'sort':
        return renderSort();
      case 'settings':
        return renderSettings();
      case 'upload':
        return renderUpload();
      case 'library':
      default:
        return renderLibrary();
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#15110e] text-stone-100 antialiased">
      <Meta
        title="照片后台 - Xuan Yi Afilmory Gallery"
        description="管理 Xuan Yi Afilmory Gallery 照片。"
      />

      <header className="bg-[#181613]/92 sticky top-0 z-30 border-b border-white/[0.07] p-3 backdrop-blur-xl sm:p-4 sm:px-6">
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9db6b0]">
              Afilmory 后台
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">
              画廊管理
            </h1>
          </div>
          <div className="grid min-w-0 gap-2 text-sm min-[430px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              href="/"
              className="inline-flex min-w-0 items-center justify-center rounded-full px-4 py-2 text-stone-300 ring-1 ring-white/[0.08] transition hover:bg-white/[0.06] hover:text-white"
            >
              查看网站
            </Link>
            <Link
              href="/api/afilmory-manifest/"
              className="inline-flex min-w-0 items-center justify-center rounded-full bg-[#9db6b0] px-4 py-2 font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
            >
              Manifest
            </Link>
          </div>
        </div>

        <nav className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-0 sm:mt-4 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {MODULES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveModule(item.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeModule === item.id
                  ? 'bg-[#9db6b0] text-[#17110e]'
                  : 'bg-white/[0.05] text-stone-300 hover:bg-white/[0.08]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:px-6">
        <StatPanel label="全部" value={stats.total} />
        <StatPanel label="已发布" value={stats.statusCounts.published} />
        <StatPanel label="草稿" value={stats.statusCounts.draft} />
        <StatPanel label="隐藏" value={stats.statusCounts.hidden} />
      </section>

      <section className="px-3 pb-6 sm:px-6">
        {(message || error) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {message ? (
              <p className="rounded-full bg-[#9db6b0]/10 px-4 py-2 text-sm text-[#c9d8d4] ring-1 ring-[#9db6b0]/20">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-full bg-red-400/10 px-4 py-2 text-sm text-red-200 ring-1 ring-red-300/20">
                {error}
              </p>
            ) : null}
          </div>
        )}

        {renderActiveModule()}
      </section>
    </main>
  );
};

export default AdminPage;
