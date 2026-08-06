# Import Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin Import Review page so uploaded incoming photos are visible and selectable before processing.

**Architecture:** Add a server-side incoming import scanner that lists GCS incoming image/json pairs, detects orphan sidecars and likely duplicate upload attempts, and exposes it through `/api/admin/import-review`. Extend the admin page with an Import Review module that defaults to selecting only complete non-duplicate/latest candidates and calls the existing process endpoint with selected object paths.

**Tech Stack:** Next.js Pages API, TypeScript tests with `tsx --test`, Google Cloud Storage via `gsutil`-backed server helpers already used by CMS code.

---

### Task 1: Import Candidate Model

**Files:**
- Create: `src/lib/server/importReview.ts`
- Test: `src/lib/server/importReview.test.ts`

- [ ] Write tests for complete pairs, orphan JSON, missing sidecar, and duplicate latest selection.
- [ ] Implement pure classification helpers independent from GCS.
- [ ] Run `npm test -- src/lib/server/importReview.test.ts`.

### Task 2: Import Review API

**Files:**
- Create: `src/pages/api/admin/import-review.ts`

- [ ] Implement `GET` to list classified incoming objects.
- [ ] Implement `POST action=archive` to move selected incoming objects to failed.
- [ ] Add no-store headers and safe path validation.
- [ ] Run typecheck.

### Task 3: Admin UI

**Files:**
- Modify: `src/pages/admin/index.tsx`

- [ ] Add `Import Review` module.
- [ ] Fetch review candidates, keep selected object paths, and default-select recommended candidates.
- [ ] After upload, switch to review page instead of immediately hiding details.
- [ ] Add controls: refresh, select recommended, process selected, archive unselected/selected.
- [ ] Keep mobile controls compact and glassy in current CMS style.

### Task 4: Verify and Deploy

**Files:** none

- [ ] Run `npm test -- src/lib/server/importReview.test.ts src/lib/uploadProxy.test.ts`.
- [ ] Run `npm run check-types`.
- [ ] Run `npm run build`.
- [ ] Deploy to Vercel production.
