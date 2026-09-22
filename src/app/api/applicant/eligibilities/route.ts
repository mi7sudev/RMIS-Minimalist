// ============================================================================
// RMIS — Eligibility section CRUD (spec §6.3, §5.3). APPLICANT-only.
// POST resolves the title against the eligibility vocabulary: explicit
// eligibilityId preferred, else find-or-create a draft reference row
// (index 99). Title is required (400 otherwise). GET = own rows ordered ord
// asc (title is stored directly on the row — no link-chain backfill needed
// in the normalized schema). No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi, ApiError } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { eligibilitySchema } from "@/lib/validation";

const orNull = (s: string | null | undefined): string | null => (s && s.trim() !== "" ? s.trim() : null);

/** Resolve a title against the eligibility vocabulary (find-or-create draft). */
async function resolveEligibilityTitle(title: string, eligibilityId?: number | null): Promise<string> {
  if (eligibilityId) {
    const ref = await db.eligibilityRef.findUnique({ where: { id: eligibilityId } });
    if (ref) return ref.name;
  }
  const refs = await db.eligibilityRef.findMany();
  const found = refs.find((r) => r.name.toLowerCase() === title.toLowerCase());
  if (found) return found.name;
  const created = await db.eligibilityRef.create({ data: { name: title, index: 99 } });
  return created.name;
}

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.eligibility.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = eligibilitySchema.parse(await req.json().catch(() => ({})));

  const title = (body.title ?? "").trim();
  if (!title) throw new ApiError("Eligibility title is required", 400);

  const resolvedTitle = await resolveEligibilityTitle(title, body.eligibilityId ?? null);

  const row = await db.eligibility.create({
    data: {
      applicantId: applicant.id,
      title: resolvedTitle,
      rating: orNull(body.rating),
      examDate: orNull(body.examDate),
      examPlace: orNull(body.examPlace),
      licenseNumber: orNull(body.licenseNumber),
      licenseValidity: orNull(body.licenseValidity),
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
