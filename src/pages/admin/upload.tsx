import type { ChangeEvent, FormEvent } from 'react';
import { useMemo, useState } from 'react';

import { Meta } from '@/layout/Meta';

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

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

type Category = (typeof CATEGORIES)[number];

type UploadItemStatus = 'failed' | 'success' | 'uploading' | 'waiting';

type UploadItem = {
  error: string;
  file: File;
  id: string;
  objectPath: string;
  progress: number;
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

const inputClassName =
  'w-full rounded-xl border border-white/[0.08] bg-[#211b17] px-4 py-3 text-base text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const labelClassName = 'text-sm font-medium text-stone-300';

const statusLabels: Record<UploadItemStatus, string> = {
  failed: '上传失败',
  success: '上传成功',
  uploading: '上传中',
  waiting: '等待上传',
};

const formatCategoryLabel = (category: string) =>
  category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const inferContentType = (file: File) => {
  if (ALLOWED_CONTENT_TYPES.has(file.type)) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? '';
};

const removeExtension = (filename: string) =>
  filename.replace(/\.[^/.]+$/, '').trim() || filename;

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

const UploadPage = () => {
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState<Category>('portrait');
  const [batchTitlePrefix, setBatchTitlePrefix] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingIncoming, setIsProcessingIncoming] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processMessage, setProcessMessage] = useState('');
  const [processErrorMessage, setProcessErrorMessage] = useState('');
  const [uploadedObjectPaths, setUploadedObjectPaths] = useState<string[]>([]);
  const [canProcessIncoming, setCanProcessIncoming] = useState(false);

  const successCount = useMemo(
    () => items.filter((item) => item.status === 'success').length,
    [items],
  );
  const failedCount = useMemo(
    () => items.filter((item) => item.status === 'failed').length,
    [items],
  );

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((currentItems) =>
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
    setErrorMessage('');
    setSuccessMessage('');
    setProcessMessage('');
    setProcessErrorMessage('');
    setUploadedObjectPaths([]);
    setCanProcessIncoming(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);

    setItems(
      selectedFiles.map((file, index) => ({
        error: '',
        file,
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        objectPath: '',
        progress: 0,
        status: 'waiting',
        title: '',
      })),
    );
    resetResultState();
  };

  const processIncoming = async (
    passwordValue = password.trim(),
    objectPaths = uploadedObjectPaths,
  ) => {
    if (!passwordValue) {
      setProcessErrorMessage('请输入管理员密码。');
      return;
    }

    if (objectPaths.length === 0) {
      setProcessErrorMessage('没有可处理的已上传图片。');
      return;
    }

    const startedAt = performance.now();

    setIsProcessingIncoming(true);
    setProcessMessage('正在处理入库...');
    setProcessErrorMessage('');

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
      const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(
        1,
      );

      setProcessMessage(
        `入库成功：扫描 ${scanned} 张，入库 ${processed} 张，失败 ${failed} 张。耗时 ${elapsedSeconds}s。`,
      );
      setCanProcessIncoming(false);
    } catch (error) {
      const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(
        1,
      );

      setProcessMessage('');
      setProcessErrorMessage(
        error instanceof Error
          ? `入库失败：${error.message}（耗时 ${elapsedSeconds}s）`
          : `入库失败：请稍后重试。（耗时 ${elapsedSeconds}s）`,
      );
    } finally {
      setIsProcessingIncoming(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const passwordValue = password.trim();

    if (!passwordValue) {
      setErrorMessage('请输入管理员密码。');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('请选择至少一张图片。');
      return;
    }

    const invalidItem = items.find(
      (item) => !ALLOWED_CONTENT_TYPES.has(inferContentType(item.file)),
    );

    if (invalidItem) {
      setErrorMessage(
        `不支持的文件格式：${invalidItem.file.name}。只支持 JPG、PNG、WebP、HEIC、HEIF。`,
      );
      return;
    }

    const batchId = createBatchId();
    const uploadPlan = items.map((item, index) => ({
      ...item,
      error: '',
      objectPath: '',
      progress: 0,
      status: 'waiting' as UploadItemStatus,
      title: getFileTitle(item.file, index, items.length, batchTitlePrefix),
    }));
    const successfulObjectPaths: string[] = [];

    setItems(uploadPlan);
    setIsUploading(true);
    resetResultState();

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < uploadPlan.length; index += 1) {
      const item = uploadPlan[index] as UploadItem;
      const contentType = inferContentType(item.file);

      updateItem(item.id, {
        error: '',
        progress: 0,
        status: 'uploading',
      });

      try {
        // Serial uploads are intentionally conservative for mobile networks.
        const response = await fetch('/api/create-upload-url/', {
          body: JSON.stringify({
            batchId,
            batchIndex: index + 1,
            category,
            contentType,
            description,
            filename: item.file.name,
            location,
            password: passwordValue,
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
          (progress) => updateItem(item.id, { progress }),
        );

        successfulObjectPaths.push(data.objectPath);
        updateItem(item.id, {
          objectPath: data.objectPath,
          progress: 100,
          status: 'success',
        });
      } catch (error) {
        updateItem(item.id, {
          error:
            error instanceof Error
              ? error.message
              : 'Upload failed. Please try again.',
          status: 'failed',
        });
      }
    }
    /* eslint-enable no-await-in-loop */

    setIsUploading(false);
    setUploadedObjectPaths(successfulObjectPaths);

    const uploadFailedCount = uploadPlan.length - successfulObjectPaths.length;

    if (successfulObjectPaths.length === 0) {
      setErrorMessage('所有图片都上传失败，请检查网络或稍后重试。');
      return;
    }

    setCanProcessIncoming(true);
    setSuccessMessage(
      `上传完成：成功 ${successfulObjectPaths.length} 张，失败 ${uploadFailedCount} 张。`,
    );

    if (autoProcess) {
      await processIncoming(passwordValue, successfulObjectPaths);
    }
  };

  return (
    <main className="min-h-screen bg-[#18130f] px-4 py-8 text-stone-100 antialiased sm:px-6">
      <Meta
        title="Upload - Shane Photography"
        description="Private incoming photo upload."
      />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl items-center">
        <div className="w-full rounded-[22px] border border-white/[0.08] bg-[#1d1713] p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#9db6b0]">
              Private
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-stone-100">
              Batch Upload
            </h1>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className={labelClassName}>Admin password</span>
              <input
                className={inputClassName}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                disabled={isUploading || isProcessingIncoming}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Category</span>
              <select
                className={inputClassName}
                value={category}
                onChange={(event) =>
                  setCategory(event.currentTarget.value as Category)
                }
                disabled={isUploading || isProcessingIncoming}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {formatCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Batch title prefix</span>
              <input
                className={inputClassName}
                type="text"
                value={batchTitlePrefix}
                onChange={(event) =>
                  setBatchTitlePrefix(event.currentTarget.value)
                }
                disabled={isUploading || isProcessingIncoming}
                placeholder="Optional, e.g. Tokyo Evening"
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Location</span>
              <input
                className={inputClassName}
                type="text"
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
                disabled={isUploading || isProcessingIncoming}
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Description</span>
              <textarea
                className={`${inputClassName} min-h-28 resize-y leading-6`}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                disabled={isUploading || isProcessingIncoming}
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Images</span>
              <input
                className={`${inputClassName} file:mr-4 file:rounded-full file:border-0 file:bg-[#9db6b0] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#17110e]`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={handleFileChange}
                disabled={isUploading || isProcessingIncoming}
                required
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#211b17] px-4 py-3 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={autoProcess}
                onChange={(event) =>
                  setAutoProcess(event.currentTarget.checked)
                }
                disabled={isUploading || isProcessingIncoming}
                className="size-4 rounded border-white/[0.12] bg-[#18130f] accent-[#9db6b0]"
              />
              <span>上传完成后自动处理入库</span>
            </label>

            {items.length > 0 ? (
              <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#18130f]/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-300">
                  <span>
                    已上传 {successCount} / {items.length}
                  </span>
                  <span>
                    成功 {successCount}，失败 {failedCount}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((item, index) => {
                    const title =
                      item.title ||
                      getFileTitle(
                        item.file,
                        index,
                        items.length,
                        batchTitlePrefix,
                      );

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/[0.06] bg-[#211b17] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-stone-100">
                              {title}
                            </p>
                            <p className="mt-1 truncate text-xs text-stone-500">
                              {item.file.name}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                              item.status === 'failed'
                                ? 'bg-red-400/10 text-red-200'
                                : 'bg-[#9db6b0]/10 text-[#c9d8d4]'
                            }`}
                          >
                            {statusLabels[item.status]}
                          </span>
                        </div>

                        {item.status === 'uploading' || item.progress > 0 ? (
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                              className="h-full rounded-full bg-[#9db6b0] transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        ) : null}

                        {item.objectPath ? (
                          <p className="mt-2 break-all text-xs text-stone-500">
                            {item.objectPath}
                          </p>
                        ) : null}

                        {item.error ? (
                          <p className="mt-2 text-xs leading-5 text-red-200">
                            {item.error}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="rounded-xl border border-red-400/20 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200">
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <p className="rounded-xl border border-[#9db6b0]/20 bg-[#9db6b0]/10 px-4 py-3 text-sm leading-6 text-[#c9d8d4]">
                {successMessage}
              </p>
            ) : null}

            {canProcessIncoming ? (
              <button
                type="button"
                onClick={() => processIncoming()}
                disabled={isUploading || isProcessingIncoming}
                className="w-full rounded-full border border-[#9db6b0]/35 px-5 py-3 text-base font-semibold text-[#c9d8d4] transition hover:bg-[#9db6b0]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessingIncoming ? '正在处理入库...' : '处理入库'}
              </button>
            ) : null}

            {processMessage ? (
              <p className="rounded-xl border border-[#9db6b0]/20 bg-[#9db6b0]/10 px-4 py-3 text-sm leading-6 text-[#c9d8d4]">
                {processMessage}
              </p>
            ) : null}

            {processErrorMessage ? (
              <p className="rounded-xl border border-red-400/20 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200">
                {processErrorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isUploading || isProcessingIncoming}
              className="w-full rounded-full bg-[#9db6b0] px-5 py-3.5 text-base font-semibold text-[#17110e] transition hover:bg-[#b3c8c3] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
};

export default UploadPage;
