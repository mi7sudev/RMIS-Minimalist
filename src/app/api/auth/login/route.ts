// ============================================================================
// RMIS — POST /api/auth/login (public, spec §3.3)
// Body { identifier, password }. Rate limit keyed IP+identifier (5 fails /
// rolling 15 min → progressive lockout ladder). Find user by email
// (case-insensitive) OR username → bcrypt verify. 401 "Invalid credentials" +
// audit LOGIN_FAILED. Blocked → 403 "Account is blocked". Staff from a
// non-intranet network → 403 (intranet message) + audit LOGIN_BLOCKED_EXTERNAL.
// Success → audit LOGIN_SUCCESS, set session cookie.
// ============================================================================

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";
import { signSession, setSessionCookie } from "@/lib/jwt";
import { isIntranetRequest, STAFF_INTRANET_MESSAGE, type Role } from "@/lib/auth";

export const POST = handleApi(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as unknown;
  const { identifier, password } = loginSchema.parse(body);
  const ip = getClientIp(req);

  // 1. Lockout gate (progressive ladder, remembered until a success clears it)
  const gate = checkLoginAllowed(ip, identifier);
  if (!gate.allowed) {
    throw new ApiError(
      `Too many failed sign-in attempts. Try again in ${gate.retryAfterMinutes ?? 1} minute(s).`,
      429
    );
  }

  // 2. Find user by email (case-insensitive) OR username
  const id = identifier.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ email: id.toLowerCase() }, { username: id }] },
  });

  // 3. bcrypt verify
  const valid = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !valid) {
    recordLoginFailure(ip, identifier);
    auditLog({
      userId: user?.id ?? null,
      userLabel: user ? `${user.username} (${user.email})` : null,
      userRole: user?.role ?? null,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: user?.id ?? null,
      description: `Failed sign-in attempt for "${identifier}"`,
      ipAddress: ip,
    });
    throw new ApiError("Invalid credentials", 401);
  }

  // 4. Blocked account
  if (user.blocked) {
    throw new ApiError("Account is blocked", 403);
  }

  // 5. Staff intranet tier (chokepoint 1 of 3)
  const role = user.role as Role;
  if ((role === "ADMIN" || role === "EVALUATOR") && !isIntranetRequest(req)) {
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: role,
      action: "LOGIN_BLOCKED_EXTERNAL",
      entityType: "user",
      entityId: user.id,
      description: "Staff sign-in blocked from a non-intranet network",
      ipAddress: ip,
    });
    throw new ApiError(STAFF_INTRANET_MESSAGE, 403);
  }

  // 6. Success
  clearLoginFailures(ip, identifier);
  const name =
    [user.firstName, user.lastName].filter((v): v is string => !!v).join(" ") ||
    user.username;
  const token = await signSession({ id: user.id, email: user.email, name, role });
  await setSessionCookie(req, token);
  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: role,
    action: "LOGIN_SUCCESS",
    entityType: "user",
    entityId: user.id,
    description: "Signed in",
    ipAddress: ip,
  });

  return ok({
    id: user.id,
    email: user.email,
    username: user.username,
    role,
    firstName: user.firstName,
    lastName: user.lastName,
  });
});
