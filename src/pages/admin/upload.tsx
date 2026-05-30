import type { ChangeEvent, FormEvent } from 'react';
import { useMemo, useState } from 'react';

import { Meta } from '@/layout/Meta';

const CATEGORIES = [
  'portrait',
  'nature',
  'beauty',
  'cute',
  'travel',
  'street',
  'mark',
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

type UploadUrlResponse =
  | {
      metadataPath: string;
      objectPath: string;
      signedUrl: string;
    }
  | {
      error: string;
    };

const inputClassName =
  'w-full rounded-xl border border-white/[0.08] bg-[#211b17] px-4 py-3 text-base text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#9db6b0]/70 focus:ring-2 focus:ring-[#9db6b0]/20';

const labelClassName = 'text-sm font-medium text-stone-300';

const inferContentType = (file: File) => {
  if (ALLOWED_CONTENT_TYPES.has(file.type)) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? '';
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
    const data = (await response.json()) as UploadUrlResponse;

    if ('error' in data) {
      return data.error;
    }
  } catch (_error) {
    // The response may not be JSON if the request fails before reaching Next.js.
  }

  return `Request failed with status ${response.status}.`;
};

const UploadPage = () => {
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>('portrait');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [uploadedObjectPath, setUploadedObjectPath] = useState('');

  const selectedContentType = useMemo(
    () => (file ? inferContentType(file) : ''),
    [file],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0] ?? null;

    setFile(selectedFile);
    setProgress(0);
    setErrorMessage('');
    setSuccessMessage('');
    setUploadedObjectPath('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password.trim()) {
      setErrorMessage('Enter the admin password.');
      return;
    }

    if (!file) {
      setErrorMessage('Choose an image to upload.');
      return;
    }

    if (!ALLOWED_CONTENT_TYPES.has(selectedContentType)) {
      setErrorMessage(
        'Only JPG, PNG, WebP, HEIC, and HEIF images are allowed.',
      );
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setErrorMessage('');
    setSuccessMessage('');
    setUploadedObjectPath('');

    try {
      const response = await fetch('/api/create-upload-url/', {
        body: JSON.stringify({
          category,
          contentType: selectedContentType,
          description,
          filename: file.name,
          location,
          password: password.trim(),
          title,
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
        file,
        selectedContentType,
        setProgress,
      );

      setUploadedObjectPath(data.objectPath);
      setSuccessMessage(
        'Uploaded successfully. Processing will start automatically.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Upload failed. Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#18130f] px-4 py-8 text-stone-100 antialiased sm:px-6">
      <Meta
        title="Upload - Shane Photography"
        description="Private incoming photo upload."
      />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center">
        <div className="w-full rounded-[22px] border border-white/[0.08] bg-[#1d1713] p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#9db6b0]">
              Private
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-stone-100">
              Upload Photo
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
                disabled={isUploading}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Image</span>
              <input
                className={`${inputClassName} file:mr-4 file:rounded-full file:border-0 file:bg-[#9db6b0] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#17110e]`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handleFileChange}
                disabled={isUploading}
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
                disabled={isUploading}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Title</span>
              <input
                className={inputClassName}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                disabled={isUploading}
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Location</span>
              <input
                className={inputClassName}
                type="text"
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
                disabled={isUploading}
              />
            </label>

            <label className="block space-y-2">
              <span className={labelClassName}>Description</span>
              <textarea
                className={`${inputClassName} min-h-28 resize-y leading-6`}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                disabled={isUploading}
              />
            </label>

            {isUploading || progress > 0 ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#9db6b0] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-stone-400">{progress}% uploaded</p>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="rounded-xl border border-red-400/20 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200">
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-[#9db6b0]/20 bg-[#9db6b0]/10 px-4 py-3 text-sm leading-6 text-[#c9d8d4]">
                <p>{successMessage}</p>
                {uploadedObjectPath ? (
                  <p className="mt-2 break-all text-xs text-stone-500">
                    {uploadedObjectPath}
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isUploading}
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
