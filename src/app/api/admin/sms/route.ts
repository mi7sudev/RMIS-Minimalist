// ============================================================================
// RMIS — /api/admin/sms (ADMIN, spec §6.6 / §9)
// GET:  provider info (mock|semaphore), stats mirror of the email panel,
//       last 25 SMS logs.
// POST: test send { to (PH format), message? ≤640 } — PH mobile normalization
//       (§9.4); invalid number → 400 "Invalid Philippine mobile number";
//       delivery failure → 502.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, err, ApiError } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { sendSms, normalizePhMobile } from "@/lib/notify";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  to: z.string().trim().min(7).max(30),
  message: z.string().trim().max(640).optional(),
});

export const GET = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [total, sent, failed, skipped, mock, last24h, logs] = await Promise.all([
    db.smsLog.count(),
    db.smsLog.count({ where: { status: "sent" } }),
    db.smsLog.count({ where: { status: "failed" } }),
    db.smsLog.count({ where: { status: "skipped" } }),
    db.smsLog.count({ where: { status: "mock" } }),
    db.smsLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.smsLog.findMany({ orderBy: { id: "desc" }, take: 25 }),
  ]);

  return ok({
    provider: process.env.SMS_PROVIDER || "mock",
    configured: !!process.env.SEMAPHORE_API_KEY,
    stats: { total, sent, failed, skipped, mock, last24h },
    logs,
  });
});

export const POST = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = testSchema.parse(body);

  const normalized = normalizePhMobile(parsed.to);
  if (!normalized) {
    throw new ApiError("Invalid Philippine mobile number", 400);
  }

  const result = await sendSms({
    to: parsed.to,
    message: parsed.message || "RMIS test SMS",
    relatedType: "test",
  });

  if (result.status === "failed") {
    return err("SMS delivery failed", 502, { error: result.error ?? null, provider: result.provider });
  }
  return ok({ sms: result });
});
