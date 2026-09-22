// ============================================================================
// RMIS — POST /api/auth/register (public, spec §3.4)
// Rate limit 5/IP/hour → 429. Body { email, firstName, lastName, password }.
// Duplicate email → 409. ONE $transaction: user (bcrypt cost 10, role
// APPLICANT, auto-username = email local part with numeric-suffix dedupe) +
// applicant row (firstName/lastName/emailAddress copied, isProfileComplete
// false). 201 → { id, email, role, applicantId }.
// ============================================================================

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(`register:${ip}`, 5, 3600000);
  if (!rl.allowed) {
    throw new ApiError(
      `Too many registration attempts. Please try again in ${rl.retryAfterMinutes ?? 60} minute(s).`,
      429
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = registerSchema.parse(body);
  const email = parsed.email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new ApiError("An account with this email already exists", 409);
  }

  // Auto-username from the email local part, numeric suffix when taken.
  const local = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9._-]/g, "") || "user";
  let username = local;
  let suffix = 1;
  while (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${local}${suffix}`;
    suffix += 1;
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);

  const { user, applicant } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        password: passwordHash,
        role: "APPLICANT",
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        blocked: false,
        confirmed: true,
      },
    });
    const applicant = await tx.applicant.create({
      data: {
        userId: user.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        emailAddress: email,
        isProfileComplete: false,
      },
    });
    return { user, applicant };
  });

  return ok(
    {
      id: user.id,
      email: user.email,
      role: "APPLICANT",
      applicantId: applicant.id,
    },
    201
  );
});
