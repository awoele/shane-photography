# Incoming Photo Processor

This HTTP Cloud Function scans the private incoming bucket, processes uploaded
originals, writes web-ready JPEGs to the public photo bucket, updates
`data/photos.json`, and moves incoming files to `processed/` or `failed/`.

The website already reads `https://storage.googleapis.com/shane-photos/data/photos.json`
at request time, so updating this GCS JSON file is enough for new photos to
appear after a refresh.

## Environment Variables

- `PROCESS_FUNCTION_SECRET`
- `INCOMING_BUCKET`, default `shane-photos-incoming`
- `PUBLIC_BUCKET`, default `shane-photos`
- `MAX_ITEMS_PER_RUN`, default `20`

## Deploy

Deploy with one max instance so two runs do not assign the same next number.

```bash
gcloud functions deploy process-incoming-photos \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-east1 \
  --source=. \
  --entry-point=processIncoming \
  --trigger-http \
  --allow-unauthenticated \
  --memory=1GiB \
  --timeout=540s \
  --max-instances=1 \
  --set-env-vars=INCOMING_BUCKET=shane-photos-incoming,PUBLIC_BUCKET=shane-photos,MAX_ITEMS_PER_RUN=20,PROCESS_FUNCTION_SECRET=replace-with-a-long-random-secret
```

## Manual Run

```bash
curl -X POST "$PROCESS_FUNCTION_URL" \
  -H "Authorization: Bearer $PROCESS_FUNCTION_SECRET"
```

## Optional Cloud Scheduler

```bash
gcloud scheduler jobs create http process-incoming-photos-every-5-min \
  --location=asia-east1 \
  --schedule="*/5 * * * *" \
  --uri="$PROCESS_FUNCTION_URL" \
  --http-method=POST \
  --headers="Authorization=Bearer $PROCESS_FUNCTION_SECRET"
```
