# Keyless Upload URL Function

This function creates a short-lived Google Cloud Storage V4 signed URL for
uploading one original photo into the private incoming bucket. It also writes a
sidecar JSON file next to the image object.

The function is called only by the Vercel API route. Browsers upload the image
directly to the signed URL returned by this function.

## Environment Variables

- `UPLOAD_FUNCTION_SECRET`
- `INCOMING_BUCKET`, for example `shane-photos-incoming`

## Deploy

```bash
gcloud functions deploy create-upload-url \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-east1 \
  --source=. \
  --entry-point=createUploadUrl \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars=INCOMING_BUCKET=shane-photos-incoming,UPLOAD_FUNCTION_SECRET=replace-with-a-long-random-secret
```

After deploy, copy the function URL into Vercel as `UPLOAD_FUNCTION_URL`.
