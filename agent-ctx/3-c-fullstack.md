# Task 3-c — Full-stack implementation record (applicant profile / sections / documents / files)

## Scope executed
Implemented ONLY these route files (18), per RMIS-FLOW-SPECIFICATION.md §6.3, §6.4, §7.4, §7.5, §8.3, §8.4, §10, §11:

- `src/app/api/applicant/profile/route.ts` — GET (full profile, 5 sections ord asc via Promise.allSettled, parsed characterReferences) + PUT (whitelist §6.3, ""→null, mobile digit-strip, characterReferences→JSON column, isProfileComplete:true server-gated → 400 `completionErrorMessage` + `{requirements}`, submittedDate stamped only on first completion; flag:false ungated → submittedDate null). Audit PROFILE_UPDATED. Response shape = GET.
- `src/app/api/applicant/profile/complete/route.ts` — POST: gate → 400 + requirements; idempotent ok if already complete; else flag+submittedDate, audit PROFILE_COMPLETED → `{ isProfileComplete: true, requirements }`.
- `src/app/api/applicant/profile/clear/route.ts` — POST destructive: deleteMany ×5 sections; nulls 27 form-managed personal fields; isProfileComplete false + submittedDate null; extractable-category documents reset to UPLOADED (files kept). Audit PROFILE_CLEARED(+counts) → `{ cleared: {education,work,training,eligibility,awards}, message }`.
- `src/app/api/applicant/profile/auto-apply/route.ts` — §8.4: personal OVERRIDE (18-field allowlist, confidence≠none + non-null; birthDate→normDate; mobile→digits; replaced=overwritten non-empty); sections REPLACE only when ≥1 entry (ord=index+1; anchors enforced); work yearDecimal (365.25-day years, open→now); training hourDecimal=numberHours; eligibility title parens-stripped + find-or-create EligibilityRef(index 99); awards recognitionType default "Award". Recomputed profileCompletion returned. No audit.
- Section CRUD ×5 + [id] (educations, work-experiences, trainings, eligibilities, awards): GET ord asc; POST ord=Date.now() (+yearDecimal / hourDecimal fallback / eligibility title required 400 + vocabulary resolution); DELETE ownership-checked 404. No PUT (edit = delete + recreate). 201 on create.
- `src/app/api/applicant/documents/route.ts` — POST multipart: category gate 400, >10 MB → 413 "File exceeds the 10 MB limit", ext+MIME allowlist → 415, stored `upload/<applicantId>/<uuid>.<ext>`, sanitized originalName ≤120, canonical MIME, PROFILE_PICTURE replace semantics, audit DOCUMENT_UPLOADED, 201. GET own docs createdAt desc.
- `src/app/api/applicant/documents/[id]/route.ts` — DELETE own-or-404, fs.rmSync + row delete, audit DOCUMENT_DELETED → `{ id, deleted: true }`.
- `src/app/api/applicant/documents/extract/route.ts` — POST `{documentIds?, category?}` → targets own UPLOADED extractable docs (or by ids filtered to own); none → 404 "No uploaded documents available for extraction"; marks PROCESSING; STREAMING 200 with "\n" keep-alive every 5 s then final `{ results, merged }`; per-doc status FAILED (error or 0 fields + blank-CS-Form-212 message) / PARTIALLY_EXTRACTED (<3) / EXTRACTED, persisted (status, extractedJson, extractionError, extractedAt).
- `src/app/api/files/[...path]/route.ts` — GET: session 401; containment guard under `upload/` (404); `.meta.json` never served; APPLICANT own-directory only (403), staff any; Content-Type from Document row else octet-stream; inline RFC 5987 disposition; Cache-Control private, no-store.

## Contracts honored / decisions for downstream agents
1. PUT profile persists field data BEFORE the completeness gate → same-request fill+complete validates fresh state; gate failure still saves autosave data (flag not granted).
2. `GET /api/applicant/profile` exposes `characterReferences` (parsed array) alongside the raw `characterReference` column; sections as `educations/workExperiences/trainings/eligibilities/awards` arrays.
3. Extract endpoint: clients must read the full streaming body then `JSON.parse` (leading "\n" keep-alives are tolerated).
4. Prisma-on-SQLite has no `mode:"insensitive"` — eligibility vocabulary matching fetches EligibilityRef rows and lowercases in JS; new titles create draft refs with index 99.
5. Section rows are ints (`Number(id)`; NaN → 404); document ids are uuid strings; User.id is a cuid string (never parseInt).
6. Guard signatures: `{ params }: { params: Promise<{ id: string }> }` awaited (Next 16); handlers annotated `(req: Request, ...)` because `handleApi`'s generic cannot infer unannotated params.

## Verification
- `bunx tsc --noEmit`: CLEAN for all 18 files. `bun run lint`: CLEAN.
- Live runtime smoke-tested with a real applicant session (register → login cookie): profile GET/PUT incl. gated 400 contract wording, education/work/training/eligibility/awards CRUD, auto-apply counts + date/mobile normalization, upload 413/415/400/201 gates, streaming extract (FAILED image path persisted, merged null), PROFILE_PICTURE replace, delete (binary removed), clear (counts + sidecar reset), files route 200/401/403/404 + headers. AuditLog rows verified in db/custom.db.

## Remaining FOREIGN tsc errors (not this task's files — reported, untouched)
- `src/lib/notify.ts(52,72,123)` — `providerRef` does not exist on `SendResult`.
- `src/lib/requirements.ts(244-247)` — `cscEligibility` does not exist on `PositionShape`.
- `examples/websocket/*`, `skills/*` — pre-existing scaffolding errors, unrelated to RMIS.
