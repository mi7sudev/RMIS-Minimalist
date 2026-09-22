// ============================================================================
// RMIS — PDS/resume extraction pipeline (spec §6.4, §8.5, §8.6). APPLICANT-only.
// POST body { documentIds?, category? } — default targets = own UPLOADED docs
// in the 8 extractable categories. Marks all PROCESSING; responds with a
// STREAMING 200: "\n" keep-alive every 5 s (JSON.parse tolerates leading
// newlines) then the final JSON { results, merged }.
// Per-doc status: error → FAILED; 0 fields → FAILED (+ blank-CS-Form-212
// message); <3 fields → PARTIALLY_EXTRACTED; else EXTRACTED. Persisted on the
// Document sidecar. merged = per-field highest-confidence merge across docs.
// ============================================================================

import { handleApi, ApiError } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import { extractFromDocument, countExtractedFields, mergeExtractions, type ExtractionResult } from "@/lib/pds-extract";
import path from "path";

type ExtractOutcome = {
  id: string;
  status: "EXTRACTED" | "PARTIALLY_EXTRACTED" | "FAILED";
  fieldsExtracted: number;
  extraction?: ExtractionResult;
  error?: string;
};

const BLANK_TEMPLATE_MESSAGE =
  "No recognizable data was found. If this is a blank CS Form 212 template, fill it in and re-upload.";

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);

  const body = (await req.json().catch(() => ({}))) as { documentIds?: unknown; category?: unknown };
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : null;
  const categoryOverride =
    typeof body.category === "string" && body.category.trim() !== "" ? body.category.trim() : null;

  const docs = documentIds && documentIds.length > 0
    ? await db.document.findMany({
        where: { applicantId: applicant.id, id: { in: documentIds } },
        orderBy: { createdAt: "asc" },
      })
    : await db.document.findMany({
        where: { applicantId: applicant.id, status: "UPLOADED", category: { in: [...EXTRACTABLE_CATEGORIES] } },
        orderBy: { createdAt: "asc" },
      });
  if (docs.length === 0) {
    throw new ApiError("No uploaded documents available for extraction", 404);
  }

  // Mark all targets PROCESSING before the (long-running) pipeline starts.
  await db.document.updateMany({
    where: { id: { in: docs.map((d) => d.id) } },
    data: { status: "PROCESSING" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
        }
      }, 5000);
      const finish = (payload: string) => {
        closed = true;
        clearInterval(keepalive);
        try {
          controller.enqueue(encoder.encode(payload));
          controller.close();
        } catch {
          // client already gone
        }
      };

      try {
        const results: ExtractOutcome[] = [];
        for (const doc of docs) {
          let status: ExtractOutcome["status"] = "FAILED";
          let fields = 0;
          let result: ExtractionResult | null = null;
          let error: string | undefined;

          try {
            const absPath = path.join(process.cwd(), doc.filePath);
            const outcome = await extractFromDocument(
              absPath,
              categoryOverride ?? doc.category,
              doc.mimeType
            );
            result = outcome.result;
            error = outcome.error;
            fields = countExtractedFields(result);
            if (error) {
              status = "FAILED";
            } else if (fields === 0) {
              status = "FAILED";
              error = BLANK_TEMPLATE_MESSAGE;
            } else if (fields < 3) {
              status = "PARTIALLY_EXTRACTED";
            } else {
              status = "EXTRACTED";
            }
          } catch {
            status = "FAILED";
            error = "Extraction failed. Please try again.";
            result = null;
            fields = 0;
          }

          await db.document
            .update({
              where: { id: doc.id },
              data: {
                status,
                extractedJson: result ? JSON.stringify(result) : null,
                extractionError: error ?? null,
                extractedAt: new Date(),
              },
            })
            .catch(() => undefined);

          results.push({
            id: doc.id,
            status,
            fieldsExtracted: fields,
            extraction: result ?? undefined,
            error,
          });
        }

        const merged = mergeExtractions(results.map((r) => r.extraction ?? null));
        finish(JSON.stringify({ results, merged }));
      } catch {
        finish(JSON.stringify({ results: [], merged: null, error: "Extraction failed. Please try again." }));
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
