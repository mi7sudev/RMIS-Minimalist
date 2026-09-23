// ============================================================================
// RMIS — Evaluator review queue (spec §6.5, §7.8). FIFO by dateApplied asc,
// paginated. ?status filters via the stage vocabulary (invalid/absent = ALL).
// Per-row requirements match is computed LIVE from the frozen snapshots vs
// the live Position CSC standards (§8.2) — never persisted.
// ============================================================================

import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { stageForStatus, QUERYABLE_STATUSES } from "@/lib/status";
import { buildRequirementsReport, type SnapshotShape } from "@/lib/requirements";
import { safeJsonParse } from "@/lib/snapshot";
import { paginationSchema } from "@/lib/validation";

function normStatus(s: string): string {
  return (s || "").toUpperCase().replace(/\s+/g, "_");
}

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const { searchParams } = new URL(req.url);
  const { page, pageSize } = paginationSchema.parse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  const statusParam = searchParams.get("status");
  const statusFilter =
    statusParam && QUERYABLE_STATUSES.includes(statusParam) ? statusParam : null;

  // Datasets are small — fetch all and compute + paginate in memory.
  const rows = await db.application.findMany({
    orderBy: { dateApplied: "asc" },
    include: {
      applicant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emailAddress: true,
          contactNumber: true,
          gender: true,
          isProfileComplete: true,
        },
      },
      job: { include: { position: true } },
    },
  });

  const filtered = statusFilter
    ? rows.filter(
        (r) =>
          normStatus(r.status) === normStatus(statusFilter) ||
          stageForStatus(r.status) === stageForStatus(statusFilter)
      )
    : rows;

  const data = filtered.map((app) => {
    const position = app.job.position;
    const snapshot: SnapshotShape = {
      educations: safeJsonParse<SnapshotShape["educations"]>(app.snapshotEducations, []),
      experiences: safeJsonParse<SnapshotShape["experiences"]>(app.snapshotExperiences, []),
      trainings: safeJsonParse<SnapshotShape["trainings"]>(app.snapshotTrainings, []),
      eligibilities: safeJsonParse<SnapshotShape["eligibilities"]>(app.snapshotEligibilities, []),
    };
    const report = buildRequirementsReport(snapshot, position ?? {});
    // Display-only credential tags (frozen snapshot — never live data).
    const tags = [
      ...snapshot.educations
        .map((e) => [e.degree, e.course, e.specifyOthers].filter(Boolean).join(" ").trim())
        .filter(Boolean),
      ...snapshot.eligibilities.map((e) => (e.title || "").trim()).filter(Boolean),
    ];
    return {
      id: app.id,
      status: app.status,
      stage: stageForStatus(app.status),
      reason: app.reason,
      dateApplied: app.dateApplied.toISOString(),
      applicantId: app.applicantId,
      jobId: app.jobId,
      applicant: app.applicant,
      job: {
        id: app.job.id,
        title: position?.positionTitle || app.job.title,
        position: position
          ? { positionTitle: position.positionTitle, placeOfAssignment: position.placeOfAssignment }
          : null,
      },
      match: { verdict: report.verdict, metCount: report.metCount, requiredCount: report.requiredCount },
      tags,
    };
  });

  const total = data.length;
  const start = (page - 1) * pageSize;
  const slice = data.slice(start, start + pageSize);
  const hasMore = start + slice.length < total;

  return ok({ data: slice, total, page, pageSize, hasMore });
});
