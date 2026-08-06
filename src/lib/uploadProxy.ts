export const CHUNKED_UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024;

export type ChunkedUploadPart = {
  end: number;
  index: number;
  start: number;
};

export const getChunkedUploadParts = (
  fileSize: number,
  chunkSize = CHUNKED_UPLOAD_CHUNK_SIZE,
) => {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return [] satisfies ChunkedUploadPart[];
  }

  const safeChunkSize =
    Number.isFinite(chunkSize) && chunkSize > 0
      ? Math.floor(chunkSize)
      : CHUNKED_UPLOAD_CHUNK_SIZE;
  const partCount = Math.ceil(fileSize / safeChunkSize);

  return Array.from({ length: partCount }, (_, index) => {
    const start = index * safeChunkSize;

    return {
      end: Math.min(fileSize, start + safeChunkSize),
      index,
      start,
    };
  });
};

export const shouldFallbackToChunkedUpload = (error: unknown) => {
  let message = '';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return (
    /network error/i.test(message) ||
    /upload failed with status\s+(0|403|408|429|5\d\d)/i.test(message)
  );
};

export const isSafeIncomingObjectPath = (value: unknown) => {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    /^incoming\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(value) &&
    !value.includes('..') &&
    !value.endsWith('.json')
  );
};
