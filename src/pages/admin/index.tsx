/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { Meta } from '@/layout/Meta';
import { formatCategoryLabel } from '@/lib/photos';
import type {
  CmsPhoto,
  CmsPhotoStatus,
  CmsProcessingJob,
  CmsSettings,
  CmsStats,
} from '@/lib/server/photoCms';

type AdminModule = 'editor' | 'library' | 'queue' | 'settings' | 'upload';

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

const STATUS_OPTIONS: Array<CmsPhotoStatus | 'all'> = [
  'all',
  'published',
  'draft',
  'hidden',
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
  { id: 'library', label: 'Library' },
  { id: 'upload', label: 'Upload' },
  { id: 'editor', label: 'Photo Editor' },
  { id: 'queue', label: 'Processing Queue' },
  { id: 'settings', label: 'Settings' },
];

const STATUS_LABELS: Record<CmsPhotoStatus | 'all', string> = {
  all: 'All',
  draft: 'Draft',
  hidden: 'Hidden',
  published: 'Published',
};

const UPLOAD_STATUS_LABELS: Record<UploadItemStatus, string> = {
  failed: 'Failed',
  success: 'Uploaded',
  uploading: 'Uploading',
  waiting: 'Waiting',
};

const inputClassName =
  'h-10 rounded-full border border-white/[0.08] bg-white/[0.05] px-4 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const fieldClassName =
  'w-full rounded-md border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const selectThemeClassName =
  'appearance-none bg-[#2a241f] text-stone-100 [color-scheme:dark] [&_option]:bg-[#2a241f] [&_option]:text-stone-100';

const compactSelectClassName = `${inputClassName} ${selectThemeClassName} min-w-[120px] pr-9`;

const fieldSelectClassName = `${fieldClassName} ${selectThemeClassName}`;

const buttonClassName =
  'rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';

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
    return `Unsupported upload format: ${item.file.name}.`;
  }

  if (item.role === 'live-video' && !isLivePhotoPaired(item, items)) {
    return `Live Photo video needs an image with the same filename.`;
  }

  return '';
};

const formatIndex = (index: number, total: number) =>
  String(index + 1).padStart(Math.max(2, String(total).length), '0');

const createBatchId = () => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 17);
  const random = Math.random().toString(36).slice(2, 8);

  return `batch-${timestamp}-${random}`;
};

const getFileTitle = (
  file: File,
  index: number,
  total: number,
  batchTitlePrefix: string,
) => {
  const prefix = batchTitlePrefix.trim();

  if (prefix) {
    return `${prefix} ${formatIndex(index, total)}`;
  }

  return removeExtension(file.name);
};

const uploadFileToSignedUrl = (
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (progress: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('PUT', signedUrl);
    request.setRequestHeader('Content-Type', contentType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${request.status}.`));
    };

    request.onerror = () => {
      reject(new Error('Network error while uploading the image.'));
    };

    request.send(file);
  });

const getErrorMessage = async (response: Response) => {
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

  return `Request failed with status ${response.status}.`;
};

const StatPanel = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-4">
    <p className="text-sm text-stone-400">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
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
      listCmsPhotos({ status: 'all' }),
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
  const [status, setStatus] = useState<CmsPhotoStatus | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState<CmsPhotoStatus | ''>('');
  const [uploadPassword, setUploadPassword] = useState('');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadCategory, setUploadCategory] = useState('portrait');
  const [batchTitlePrefix, setBatchTitlePrefix] = useState('');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [uploadedObjectPaths, setUploadedObjectPaths] = useState<string[]>([]);
  const [canProcessIncoming, setCanProcessIncoming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingIncoming, setIsProcessingIncoming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0],
    [photos, selectedPhotoId],
  );
  const categories = useMemo(() => getUniqueCategories(photos), [photos]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visiblePhotoIds = useMemo(
    () => photos.map((photo) => photo.id),
    [photos],
  );
  const areAllVisiblePhotosSelected =
    visiblePhotoIds.length > 0 &&
    visiblePhotoIds.every((id) => selectedSet.has(id));
  const selectedPhotoKey = selectedPhoto?.id ?? '';
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
      throw new Error(data.error || 'Could not refresh photos.');
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

  const refreshJobs = async () => {
    const response = await fetch('/api/admin/processing/');
    const data = (await response.json()) as AdminJobsResponse;

    if (!response.ok || data.error || !data.jobs) {
      throw new Error(data.error || 'Could not refresh processing queue.');
    }

    setJobs(data.jobs);
  };

  const refreshSettings = async () => {
    const response = await fetch('/api/admin/settings/');
    const data = (await response.json()) as AdminSettingsResponse;

    if (!response.ok || data.error || !data.settings) {
      throw new Error(data.error || 'Could not refresh settings.');
    }

    setSettings(data.settings);
    setSettingsDraft(data.settings);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshPhotos().catch((refreshError) => {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Could not refresh photos.',
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
        throw new Error(data.error || 'Could not update photo.');
      }

      const nextPhoto = data.photo;

      setPhotos((current) =>
        current.map((photo) =>
          photo.id === selectedPhoto.id ? (nextPhoto as CmsPhoto) : photo,
        ),
      );
      setDraftPhoto(createEditDraft(nextPhoto));
      setMessage('Photo saved.');
      await refreshPhotos();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not update photo.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applyBulkUpdate = async () => {
    if (selectedIds.length === 0 || (!bulkCategory && !bulkStatus)) {
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
        throw new Error(data.error || 'Could not update selected photos.');
      }

      await refreshPhotos();
      setSelectedIds([]);
      setBulkCategory('');
      setBulkStatus('');
      if (bulkCategory && !bulkStatus) {
        setMessage(
          `Moved ${data.updated ?? 0} photos to ${formatCategoryLabel(
            bulkCategory,
          )}.`,
        );
      } else {
        setMessage(`Updated ${data.updated ?? 0} photos.`);
      }
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : 'Could not update selected photos.',
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
        throw new Error(data.error || 'Could not delete selected photos.');
      }

      await refreshPhotos();
      setSelectedIds([]);
      setMessage(`Deleted ${data.deleted ?? 0} photos.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete selected photos.',
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
    await fetch('/api/admin/processing/', {
      body: JSON.stringify({
        filename: item.file.name,
        id: objectPath,
        objectPath,
        stage: 'Uploaded',
        thumbnail: item.previewUrl,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  };

  const processIncoming = async (
    passwordValue = uploadPassword.trim(),
    objectPaths = uploadedObjectPaths,
  ) => {
    if (!passwordValue) {
      setError('Admin password is required.');
      return;
    }

    if (objectPaths.length === 0) {
      setError('There are no uploaded images to process.');
      return;
    }

    setIsProcessingIncoming(true);
    setMessage('Processing incoming photos...');
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

      setMessage(
        `Processed ${processed} of ${scanned} photos. Failed ${failed}.`,
      );
      setCanProcessIncoming(false);
      await Promise.all([refreshJobs(), refreshPhotos()]);
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : 'Could not process incoming photos.',
      );
      await refreshJobs().catch(() => undefined);
    } finally {
      setIsProcessingIncoming(false);
    }
  };

  const uploadSelectedFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const passwordValue = uploadPassword.trim();

    if (!passwordValue) {
      setError('Admin password is required.');
      return;
    }

    if (uploadItems.length === 0) {
      setError('Choose at least one image or Live Photo pair.');
      return;
    }

    const invalidItem = uploadItems.find(
      (item) => !ALLOWED_CONTENT_TYPES.has(inferContentType(item.file)),
    );

    if (invalidItem) {
      setError(`Unsupported upload format: ${invalidItem.file.name}.`);
      return;
    }

    const imageItems = uploadItems.filter((item) =>
      isImageContentType(inferContentType(item.file)),
    );

    if (imageItems.length === 0) {
      setError(
        'Choose at least one image. Live Photo videos must be paired with an image.',
      );
      return;
    }

    const unpairedVideo = uploadItems.find(
      (item) =>
        item.role === 'live-video' && !isLivePhotoPaired(item, uploadItems),
    );

    if (unpairedVideo) {
      setError(
        `${unpairedVideo.file.name} needs an image with the same filename for Live Photo upload.`,
      );
      return;
    }

    const batchId = createBatchId();
    const uploadPlan = uploadItems.map((item, index) => ({
      ...item,
      error: '',
      objectPath: '',
      progress: 0,
      status: 'waiting' as UploadItemStatus,
      title: getFileTitle(
        item.file,
        index,
        uploadItems.length,
        batchTitlePrefix,
      ),
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

        await uploadFileToSignedUrl(
          data.signedUrl,
          item.file,
          contentType,
          (progress) => updateUploadItems(item.id, { progress }),
        );

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
              : 'Upload failed. Please try again.',
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
      setError(
        'No uploaded photos can be processed. Check failed image uploads.',
      );
      return;
    }

    setCanProcessIncoming(true);
    setMessage(
      `Uploaded ${successfulFileCount} files. Queued ${successfulPhotoObjectPaths.length} photos. Failed ${uploadFailedCount}.`,
    );

    if (autoProcess) {
      await processIncoming(passwordValue, successfulPhotoObjectPaths);
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
        throw new Error(data.error || 'Could not retry processing job.');
      }

      await refreshJobs();
      setMessage('Job queued for retry.');
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'Could not retry processing job.',
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
        throw new Error(data.error || 'Could not save settings.');
      }

      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setMessage('Settings saved.');
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : 'Could not save settings.',
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
        throw new Error(data.error || 'Could not refresh manifest cache.');
      }

      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setMessage('Manifest cache refreshed.');
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : 'Could not refresh manifest cache.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderLibrary = () => (
    <section className="grid min-h-[calc(100vh-220px)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={panelClassName}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className={`${inputClassName} min-w-[220px] flex-1`}
            placeholder="Search title, tag, camera, location"
          />
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.currentTarget.value as CmsPhotoStatus | 'all')
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
            <option value="all">All Categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {formatCategoryLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] p-3">
          <span className="text-sm text-stone-400">
            已选择 {selectedIds.length} / 当前 {photos.length}
          </span>
          <button
            type="button"
            onClick={selectVisiblePhotos}
            disabled={
              isSaving || areAllVisiblePhotosSelected || photos.length === 0
            }
            className={`${buttonClassName} text-[#c5dfd8] ring-1 ring-[#9db6b0]/25 hover:bg-[#9db6b0]/10`}
          >
            全选当前筛选
          </button>
          <button
            type="button"
            onClick={clearSelectedPhotos}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
          >
            清空选择
          </button>
          <select
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.currentTarget.value)}
            className={compactSelectClassName}
          >
            <option value="">移动到分类</option>
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
            className={compactSelectClassName}
          >
            <option value="">修改状态</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="hidden">Hidden</option>
          </select>
          <button
            type="button"
            onClick={applyBulkUpdate}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} bg-[#9db6b0] text-[#17110e]`}
          >
            应用更改
          </button>
          <button
            type="button"
            onClick={deleteSelectedPhotos}
            disabled={isSaving || selectedIds.length === 0}
            className={`${buttonClassName} text-red-200 ring-1 ring-red-300/20 hover:bg-red-400/10`}
          >
            删除所选
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-3 xl:grid-cols-5">
          {photos.map((photo) => {
            const isSelected = selectedSet.has(photo.id);
            const isActive = selectedPhoto?.id === photo.id;

            return (
              <article
                key={photo.id}
                className={`group relative overflow-hidden rounded-md bg-black ${
                  isActive
                    ? 'ring-2 ring-[#9db6b0]'
                    : 'ring-1 ring-white/[0.06]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhotoId(photo.id);
                    setActiveModule('editor');
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
                      <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs text-stone-300">
                        {STATUS_LABELS[photo.status]}
                      </span>
                      {photo.featured ? (
                        <span className="rounded-full bg-[#9db6b0]/20 px-2 py-0.5 text-xs text-[#c5dfd8]">
                          Featured
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <label className="absolute left-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 backdrop-blur">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(photo.id)}
                    className="size-4 accent-[#9db6b0]"
                    aria-label={`Select ${photo.title}`}
                  />
                </label>
              </article>
            );
          })}
        </div>
      </div>

      <aside className={`${panelClassName} p-4`}>
        <h2 className="text-lg font-semibold">Library controls</h2>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Search covers title, tags, camera, lens, category, description, and
          location. Hidden photos stay in the library but disappear from the
          public gallery.
        </p>
        <div className="mt-5 space-y-3 text-sm">
          <p className="flex justify-between text-stone-400">
            <span>Visible</span>
            <strong className="text-stone-100">
              {stats.statusCounts.published}
            </strong>
          </p>
          <p className="flex justify-between text-stone-400">
            <span>Draft</span>
            <strong className="text-stone-100">
              {stats.statusCounts.draft}
            </strong>
          </p>
          <p className="flex justify-between text-stone-400">
            <span>Hidden</span>
            <strong className="text-stone-100">
              {stats.statusCounts.hidden}
            </strong>
          </p>
        </div>
      </aside>
    </section>
  );

  const renderUpload = () => (
    <form
      className={`${panelClassName} p-4 sm:p-5`}
      onSubmit={uploadSelectedFiles}
    >
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">Admin password</span>
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
            <span className="text-sm text-stone-400">Category</span>
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
            <span className="text-sm text-stone-400">Batch title prefix</span>
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
            <span className="text-sm text-stone-400">Location</span>
            <input
              className={`${fieldClassName} rounded-full`}
              value={uploadLocation}
              onChange={(event) => setUploadLocation(event.currentTarget.value)}
              disabled={isUploading || isProcessingIncoming}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-stone-400">Description</span>
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
            Process incoming photos after upload
          </label>
          <button
            type="submit"
            disabled={isUploading || isProcessingIncoming}
            className={`${buttonClassName} w-full bg-[#9db6b0] py-3 text-[#17110e]`}
          >
            {isUploading ? 'Uploading...' : 'Upload batch'}
          </button>
          {canProcessIncoming ? (
            <button
              type="button"
              onClick={() => processIncoming()}
              disabled={isUploading || isProcessingIncoming}
              className={`${buttonClassName} w-full text-[#c5dfd8] ring-1 ring-[#9db6b0]/30 hover:bg-[#9db6b0]/10`}
            >
              {isProcessingIncoming ? 'Processing...' : 'Process incoming now'}
            </button>
          ) : null}
        </div>

        <div className="space-y-4">
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="grid min-h-[220px] cursor-pointer place-items-center rounded-lg border border-dashed border-white/[0.18] bg-white/[0.035] p-6 text-center transition hover:border-[#9db6b0]/60 hover:bg-white/[0.055]"
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
                Drag photos here
              </span>
              <span className="mt-2 block text-sm text-stone-400">
                JPG, PNG, WebP, HEIC, HEIF, and paired MOV/MP4 Live Photos.
                Batch upload uses the original signed URL flow.
              </span>
            </span>
          </label>

          {uploadItems.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-stone-400">
                <span>
                  Uploaded {successfulUploads} / {uploadItems.length}
                </span>
                <span>Failed {failedUploads}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {uploadItems.map((item, index) => {
                  const title =
                    item.title ||
                    getFileTitle(
                      item.file,
                      index,
                      uploadItems.length,
                      batchTitlePrefix,
                    );
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
                            Live Photo video
                          </span>
                          <span className="mt-1 block text-xs text-stone-500">
                            {hasLivePair
                              ? 'Paired by filename'
                              : 'Waiting for matching image'}
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

  const renderEditor = () => (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className={`${panelClassName} overflow-hidden`}>
        {selectedPhoto ? (
          <img
            src={selectedPhoto.src}
            alt={selectedPhoto.title}
            className="max-h-[calc(100vh-260px)] w-full object-contain"
          />
        ) : (
          <div className="grid min-h-[420px] place-items-center text-sm text-stone-400">
            Select a photo from Library.
          </div>
        )}
      </div>

      <aside className={`${panelClassName} p-4`}>
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
                {STATUS_LABELS[selectedPhoto.status]}
              </span>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-stone-400">Title</span>
              <input
                className={fieldClassName}
                value={draftPhoto.title}
                onChange={(event) =>
                  updateDraft('title', event.currentTarget.value)
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">Category</span>
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
                <span className="text-sm text-stone-400">Status</span>
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
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-stone-400">Tags</span>
              <input
                className={fieldClassName}
                value={draftPhoto.tags}
                onChange={(event) =>
                  updateDraft('tags', event.currentTarget.value)
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">Location</span>
                <input
                  className={fieldClassName}
                  value={draftPhoto.location}
                  onChange={(event) =>
                    updateDraft('location', event.currentTarget.value)
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-400">Date</span>
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
              <span className="text-sm text-stone-400">Description</span>
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
              Featured photo
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraftPhoto(createEditDraft(selectedPhoto))}
                disabled={isSaving || !hasDraftChanges}
                className={`${buttonClassName} text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasDraftChanges}
                className={`${buttonClassName} bg-[#9db6b0] text-[#17110e] hover:bg-[#b7cec8]`}
              >
                {isSaving ? 'Saving...' : 'Save Photo'}
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
                Size: {selectedPhoto.width} x {selectedPhoto.height}
              </p>
              <p className="truncate">Source: {selectedPhoto.src}</p>
            </div>
          </form>
        ) : (
          <div className="grid min-h-[360px] place-items-center text-sm text-stone-400">
            Select a photo to edit.
          </div>
        )}
      </aside>
    </section>
  );

  const renderQueue = () => (
    <section className={`${panelClassName} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-white/[0.07] p-4">
        <div>
          <h2 className="text-lg font-semibold">Processing Queue</h2>
          <p className="mt-1 text-sm text-stone-400">
            Thumbnail, EXIF, and Live Photo processing status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshJobs()}
          className={`${buttonClassName} text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
        >
          Refresh
        </button>
      </div>
      <div className="divide-y divide-white/[0.07]">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <article
              key={job.id}
              className="grid gap-3 p-4 sm:grid-cols-[80px_minmax(0,1fr)_140px]"
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
                    {job.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-400">{job.stage}</p>
                <div className="mt-3 grid gap-2 text-xs text-stone-400 sm:grid-cols-3">
                  <span>Thumbnail: {job.thumbnail ? 'ready' : 'pending'}</span>
                  <span>EXIF: {job.exifStatus}</span>
                  <span>Live Photo: {job.livePhotoStatus}</span>
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
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => retryJob(job.id)}
                  disabled={job.status !== 'failed'}
                  className={`${buttonClassName} text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
                >
                  Retry
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="grid min-h-[260px] place-items-center text-sm text-stone-400">
            No processing jobs yet.
          </div>
        )}
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`${panelClassName} space-y-4 p-4 sm:p-5`}>
        <label className="block space-y-1">
          <span className="text-sm text-stone-400">Storage bucket</span>
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
          <span className="text-sm text-stone-400">Default publish status</span>
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
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
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
          Manifest cache enabled
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => refreshSettings()}
            className={`${buttonClassName} text-stone-300 ring-1 ring-white/[0.08] hover:bg-white/[0.06]`}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving}
            className={`${buttonClassName} bg-[#9db6b0] text-[#17110e]`}
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={refreshManifest}
            disabled={isSaving}
            className={`${buttonClassName} text-[#c5dfd8] ring-1 ring-[#9db6b0]/30 hover:bg-[#9db6b0]/10`}
          >
            Refresh Manifest
          </button>
        </div>
      </div>
      <aside className={`${panelClassName} space-y-3 p-4 text-sm`}>
        <h2 className="text-lg font-semibold">Runtime</h2>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>Upload service</span>
          <strong className="text-stone-100">
            {settings.uploadFunctionConfigured ? 'configured' : 'missing'}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>Processing service</span>
          <strong className="text-stone-100">
            {settings.processFunctionConfigured ? 'configured' : 'missing'}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>Manifest version</span>
          <strong className="truncate text-stone-100">
            {settings.manifestCacheVersion}
          </strong>
        </p>
        <p className="flex justify-between gap-3 text-stone-400">
          <span>Last refresh</span>
          <strong className="truncate text-stone-100">
            {settings.lastManifestRefreshAt || 'never'}
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
    <main className="min-h-screen bg-[#15110e] text-stone-100 antialiased">
      <Meta
        title="Photo CMS - Shane Afilmory Gallery"
        description="Manage Shane Afilmory Gallery photos."
      />

      <header className="bg-[#181613]/92 sticky top-0 z-30 border-b border-white/[0.07] p-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9db6b0]">
              Afilmory CMS
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Gallery Management</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/"
              className="rounded-full px-4 py-2 text-stone-300 ring-1 ring-white/[0.08] transition hover:bg-white/[0.06] hover:text-white"
            >
              View Site
            </Link>
            <Link
              href="/api/afilmory-manifest/"
              className="rounded-full bg-[#9db6b0] px-4 py-2 font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
            >
              Manifest
            </Link>
          </div>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto">
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

      <section className="grid gap-3 p-4 sm:grid-cols-4 sm:px-6">
        <StatPanel label="Total" value={stats.total} />
        <StatPanel label="Published" value={stats.statusCounts.published} />
        <StatPanel label="Draft" value={stats.statusCounts.draft} />
        <StatPanel label="Hidden" value={stats.statusCounts.hidden} />
      </section>

      <section className="px-4 pb-6 sm:px-6">
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
