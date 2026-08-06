import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHUNKED_UPLOAD_CHUNK_SIZE,
  getChunkedUploadParts,
  isSafeIncomingObjectPath,
  shouldFallbackToChunkedUpload,
} from './uploadProxy';

test('getChunkedUploadParts keeps every request below the proxy chunk size', () => {
  const parts = getChunkedUploadParts(CHUNKED_UPLOAD_CHUNK_SIZE * 2 + 7);

  assert.deepEqual(parts, [
    { end: CHUNKED_UPLOAD_CHUNK_SIZE, index: 0, start: 0 },
    {
      end: CHUNKED_UPLOAD_CHUNK_SIZE * 2,
      index: 1,
      start: CHUNKED_UPLOAD_CHUNK_SIZE,
    },
    {
      end: CHUNKED_UPLOAD_CHUNK_SIZE * 2 + 7,
      index: 2,
      start: CHUNKED_UPLOAD_CHUNK_SIZE * 2,
    },
  ]);
});

test('shouldFallbackToChunkedUpload catches direct storage network failures', () => {
  assert.equal(
    shouldFallbackToChunkedUpload(
      new Error('Network error while uploading the image.'),
    ),
    true,
  );
  assert.equal(
    shouldFallbackToChunkedUpload(new Error('Upload failed with status 403.')),
    true,
  );
  assert.equal(
    shouldFallbackToChunkedUpload(new Error('Invalid admin password.')),
    false,
  );
});

test('isSafeIncomingObjectPath accepts only incoming image object paths', () => {
  assert.equal(
    isSafeIncomingObjectPath('incoming/portrait/20260629-photo.jpg'),
    true,
  );
  assert.equal(isSafeIncomingObjectPath('../portrait/photo.jpg'), false);
  assert.equal(
    isSafeIncomingObjectPath('incoming/portrait/photo.jpg.json'),
    false,
  );
  assert.equal(isSafeIncomingObjectPath('processed/portrait/photo.jpg'), false);
});
