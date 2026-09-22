// ============================================================================
// RMIS — Notification subsystem (spec §9). Providers are mock in this
// deployment; every attempt is persisted to email_logs / sms_logs.
// HARD CONTRACT: sendEmail / sendSms NEVER throw — callers fire post-success.
// Templates per spec §9.3; PH mobile normalization per §9.4.
// ============================================================================

import { db } from "@/lib/db";

export type EmailInput = {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  relatedType?: string;
  relatedId?: number;
  attachments?: { name: string; bytes: number }[];
};

export type SendResult = { status: "sent" | "failed" | "mock" | "skipped"; error?: string; provider: string; providerRef?: string };

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "mock";
const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock";

export async function sendEmail(input: EmailInput): Promise<SendResult> {
  let result: SendResult;
  try {
    if (!input.to || !input.to.includes("@")) {
      result = { status: "skipped", error: "No valid recipient address", provider: EMAIL_PROVIDER };
    } else if (EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) {
      // Real provider path (Resend HTTP API).
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "DOST-MIRDC Recruitment <onboarding@resend.dev>",
            to: [input.to],
            subject: input.subject,
            text: input.bodyText,
            html: input.bodyHtml,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          result = { status: "failed", error: `Provider ${res.status}: ${text.slice(0, 200)}`, provider: "resend" };
        } else {
          const json = (await res.json()) as { id?: string };
          result = { status: "sent", provider: "resend", providerRef: json.id ? String(json.id) : undefined };
        }
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "provider error", provider: "resend" };
      }
    } else {
      result = { status: "mock", provider: EMAIL_PROVIDER };
    }
  } catch (e) {
    result = { status: "failed", error: e instanceof Error ? e.message : "unknown", provider: EMAIL_PROVIDER };
  }
  try {
    await db.emailLog.create({
      data: {
        to: input.to || "",
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        provider: result.provider,
        status: result.status,
        providerRef: result.providerRef ?? null,
        error: result.error ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        attachments: input.attachments ? JSON.stringify(input.attachments) : null,
      },
    });
  } catch {
    // log write is best-effort
  }
  return result;
}

export async function sendSms(input: { to: string; message: string; relatedType?: string; relatedId?: number }): Promise<SendResult> {
  let result: SendResult;
  try {
    const normalized = normalizePhMobile(input.to);
    if (!normalized) {
      result = { status: "skipped", error: "Invalid Philippine mobile number", provider: SMS_PROVIDER };
    } else if (SMS_PROVIDER === "semaphore" && process.env.SEMAPHORE_API_KEY) {
      try {
        const body = new URLSearchParams({
          apikey: process.env.SEMAPHORE_API_KEY,
          number: normalized.local,
          message: input.message.slice(0, 640),
          sendername: process.env.SEMAPHORE_SENDER || "MIRDCRMIS",
        });
        const res = await fetch("https://api.semaphore.co/api/v4/messages", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        result = res.ok
          ? { status: "sent", provider: "semaphore" }
          : { status: "failed", error: `Provider ${res.status}`, provider: "semaphore" };
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "provider error", provider: "semaphore" };
      }
    } else {
      result = { status: "mock", provider: SMS_PROVIDER };
    }
  } catch (e) {
    result = { status: "failed", error: e instanceof Error ? e.message : "unknown", provider: SMS_PROVIDER };
  }
  try {
    await db.smsLog.create({
      data: {
        to: input.to || "",
        message: input.message,
        provider: result.provider,
        status: result.status,
        providerRef: result.providerRef ?? null,
        error: result.error ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
      },
    });
  } catch {
    // best-effort
  }
  return result;
}

/** PH mobile normalization (spec §9.4): 0917…/+63917…/63917…/917… → local + E.164. */
export function normalizePhMobile(raw: string): { local: string; e164: string } | null {
  const digits = (raw || "").replace(/\D/g, "");
  let local: string | null = null;
  if (/^09\d{9}$/.test(digits)) local = digits;
  else if (/^639\d{9}$/.test(digits)) local = `0${digits.slice(2)}`;
  else if (/^9\d{9}$/.test(digits)) local = `0${digits}`;
  if (!local) return null;
  return { local, e164: `+63${local.slice(1)}` };
}

// ── Templates (spec §9.3) ───────────────────────────────────────────────────

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#949494;text-transform:uppercase;">DOST-MIRDC · Recruitment</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#181825;">${title}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;" />
    <p style="margin:0;font-size:11px;color:#949494;">This is an automated message from the MIRDC Recruitment Management Information System. Please do not reply.</p>
  </div></body></html>`;
}

export function emailApplicationReceived(applicantName: string, jobTitle: string) {
  return {
    subject: `Application received — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYour application for ${jobTitle} has been received and is awaiting evaluation. We will notify you of the outcome through this channel.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Application received",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Your application for <strong>${jobTitle}</strong> has been received and is awaiting evaluation.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We will notify you of the outcome through this channel.</p>`
    ),
  };
}

export function emailStatusChanged(applicantName: string, jobTitle: string, status: string, reason?: string | null) {
  return {
    subject: `Application status: ${status} — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nThe status of your application for ${jobTitle} is now: ${status}.${reason ? `\n\nRemarks from HR: ${reason}` : ""}\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Application status update",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">The status of your application for <strong>${jobTitle}</strong> is now <strong>${status}</strong>.</p>
       ${reason ? `<p style="color:#484758;font-size:14px;line-height:1.6;">Remarks from HR: ${reason}</p>` : ""}`
    ),
  };
}

export function emailUnderReview(applicantName: string, jobTitle: string) {
  return {
    subject: `Your application is under review — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYour application for ${jobTitle} is now under review by our HR team. No action is needed from you at this time; we will notify you of the outcome.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Your application is under review",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Your application for <strong>${jobTitle}</strong> is now under review by our HR team.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">No action is needed from you at this time; we will notify you of the outcome.</p>`
    ),
  };
}

export function emailShortlisted(applicantName: string, jobTitle: string) {
  return {
    subject: `You are shortlisted — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nCongratulations! You have been shortlisted for ${jobTitle}.\n\nNext steps are conducted face-to-face. Please prepare your ORIGINAL credentials for verification:\n• Diploma / Transcript of Records\n• Training certificates\n• Eligibility / Professional license\n• Certificates of Employment\n\nOur HR team will contact you to schedule the next steps.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "You are shortlisted",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Congratulations! You have been <strong>shortlisted</strong> for <strong>${jobTitle}</strong>.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Next steps are conducted <strong>face-to-face</strong>. Please prepare your <strong>original credentials</strong> for verification:</p>
       <ul style="color:#484758;font-size:14px;line-height:1.7;"><li>Diploma / Transcript of Records</li><li>Training certificates</li><li>Eligibility / Professional license</li><li>Certificates of Employment</li></ul>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Our HR team will contact you to schedule the next steps.</p>`
    ),
  };
}

export function emailRegretLetter(applicantName: string, jobTitle: string) {
  return {
    subject: `Application regret — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nThank you for your interest in the ${jobTitle} position and for taking the time to apply.\n\nAfter careful evaluation, we regret to inform you that you were not shortlisted for this position. This decision does not diminish your qualifications, and we encourage you to apply for other openings that match your credentials.\n\nWe appreciate your interest in joining DOST-MIRDC.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Application regret",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you for your interest in the <strong>${jobTitle}</strong> position and for taking the time to apply.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">After careful evaluation, we regret to inform you that you were <strong>not shortlisted</strong> for this position. This decision does not diminish your qualifications, and we encourage you to apply for other openings that match your credentials.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We appreciate your interest in joining DOST-MIRDC.</p>`
    ),
  };
}

export function emailInterviewInvitation(applicantName: string, jobTitle: string, d: { date?: string; time?: string; venue?: string; contact?: string; notes?: string }) {
  const row = (k: string, v?: string) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#949494;font-size:13px;">${k}</td><td style="padding:6px 0;color:#181825;font-size:14px;">${v}</td></tr>` : "";
  return {
    subject: `Interview invitation — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYou are invited to an interview for ${jobTitle}.\nDate: ${d.date || "TBA"}\nTime: ${d.time || "TBA"}\nVenue: ${d.venue || "TBA"}${d.contact ? `\nHR Contact: ${d.contact}` : ""}${d.notes ? `\nNotes: ${d.notes}` : ""}\n\nPlease bring your original credentials.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Interview invitation",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">You are invited to an interview for <strong>${jobTitle}</strong>.</p>
       <table style="margin:8px 0;">${row("Date", d.date || "TBA")}${row("Time", d.time || "TBA")}${row("Venue", d.venue || "TBA")}${row("HR Contact", d.contact)}${row("Notes", d.notes)}</table>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Please bring your original credentials.</p>`
    ),
  };
}

export function emailSkillsExam(applicantName: string, jobTitle: string, d: { examType?: string; date?: string; time?: string; venue?: string; contact?: string; notes?: string }) {
  return {
    subject: `Skills examination notice — ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYou are invited to a skills examination${d.examType ? ` (${d.examType})` : ""} for ${jobTitle}.\nDate: ${d.date || "TBA"}\nTime: ${d.time || "TBA"}\nVenue: ${d.venue || "TBA"}\n\nPlease bring a valid ID and a pen, and arrive 15 minutes early.\n\n— MIRDC Human Resources`,
    bodyHtml: emailShell(
      "Skills examination notice",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">You are invited to a skills examination${d.examType ? ` (<strong>${d.examType}</strong>)` : ""} for <strong>${jobTitle}</strong>.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Date: ${d.date || "TBA"} · Time: ${d.time || "TBA"} · Venue: ${d.venue || "TBA"}</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Please bring a valid ID and a pen, and arrive 15 minutes early.</p>`
    ),
  };
}

export function emailDirect(senderName: string, subject: string, message: string) {
  return {
    subject,
    bodyText: `${message}\n\n— ${senderName}, MIRDC Human Resources`,
    bodyHtml: emailShell(subject, `<div style="color:#484758;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, "&lt;")}</div><p style="color:#949494;font-size:12px;">— ${senderName}, MIRDC Human Resources</p>`),
  };
}

export function smsApplicationReceived(jobTitle: string) {
  return `DOST-MIRDC Recruitment: Your application for ${jobTitle} has been received and is awaiting evaluation. Do not reply.`;
}

export function smsStatusChanged(status: string, jobTitle: string, reason?: string | null) {
  return `DOST-MIRDC Recruitment: Your application for ${jobTitle} is now ${status.toUpperCase()}.${reason ? ` Remarks: ${reason}` : ""} Do not reply.`;
}

export function smsNotice(text: string) {
  return `${text.slice(0, 600)} Do not reply.`;
}
