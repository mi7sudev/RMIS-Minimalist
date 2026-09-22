"use client";

// ============================================================================
// RMIS — PDS upload & AI auto-extraction card (spec §7.5, §8.4), top of the
// profile builder. Pipeline: upload (category PDS) → extract → auto-apply,
// with Uploading → Extracting → Applying phase progress. ONE-EXTRACTION LOCK:
// once any extractable document is EXTRACTED/PARTIALLY_EXTRACTED the dropzone
// is replaced by a locked strip whose only way back is "Clear Forms &
// Re-upload" → confirm → POST /api/applicant/profile/clear (files stay).
// Extraction errors show the server message + file name + Try Again.
// Presentation pass: SectionCard shell, #dcdcdc dashed dropzone, quiet .num
// extraction-result rows, AI-assisted source pill. Pipeline behavior intact.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CloudUpload, Loader2, Lock, RefreshCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconChip, SectionCard } from "@/components/ui/shell";
import { apiFetch } from "@/lib/client";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";

const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

type Phase = "idle" | "uploading" | "extracting" | "applying";

type ExtractResponse = {
  results: { id: string; status: string; error?: string }[];
  merged: Record<string, unknown> | null;
};

type AutoApplyResponse = {
  applied: Record<string, number>;
  replaced: { personal: number };
  totalFilled: number;
  totalReplaced: number;
  message: string;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  uploading: "Uploading your PDS…",
  extracting: "Extracting from your PDS…",
  applying: "Applying to your profile…",
};

export default function PdsUploadCard({
  docs,
  onProfileReplaced,
  onDocsChanged,
}: {
  docs: DocumentWire[];
  /** Called after auto-apply / clear — reloads profile + docs and re-seeds forms. */
  onProfileReplaced: () => void | Promise<void>;
  /** Called when document statuses changed without touching the profile. */
  onDocsChanged: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; fileName: string } | null>(null);
  const [lastApply, setLastApply] = useState<AutoApplyResponse | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = useMemo(
    () => docs.some((d) => EXTRACTABLE.includes(d.category) && (d.status === "EXTRACTED" || d.status === "PARTIALLY_EXTRACTED")),
    [docs]
  );
  const busy = phase !== "idle";

  /** Quiet .num rows describing what the last auto-apply filled, per section. */
  const applyRows = useMemo(() => {
    if (!lastApply) return [];
    const rows: [string, number][] = [
      ["Personal details", lastApply.applied.personal],
      ["Education entries", lastApply.applied.education],
      ["Work experience entries", lastApply.applied.work],
      ["Training entries", lastApply.applied.training],
      ["Eligibility entries", lastApply.applied.eligibility],
      ["Awards", lastApply.applied.awards],
      ["Existing personal values replaced", lastApply.replaced.personal],
    ];
    return rows.filter(([, n]) => n > 0);
  }, [lastApply]);

  const runPipeline = async (file: File) => {
    setError(null);
    setLastApply(null);
    try {
      // 1 — Upload (category PDS).
      setPhase("uploading");
      setProgress(20);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<{ id: string }>("/api/applicant/documents", { method: "POST", formData: fd });

      // 2 — Extract (streaming endpoint; apiFetch tolerates keep-alive bytes).
      setPhase("extracting");
      setProgress(55);
      const ext = await apiFetch<ExtractResponse>("/api/applicant/documents/extract", {
        method: "POST",
        body: { documentIds: [doc.id] },
      });
      setProgress(75);

      if (!ext.merged) {
        const failed = ext.results?.find((r) => r.error);
        setError({
          message: failed?.error ?? "Extraction failed. Try a clearer PDS file — filled XLSX of CS Form 212 works best.",
          fileName: file.name,
        });
        setPhase("idle");
        setProgress(0);
        await onDocsChanged();
        return;
      }

      // 3 — Auto-apply (§8.4: personal overrides, sections replace).
      setPhase("applying");
      setProgress(90);
      const applied = await apiFetch<AutoApplyResponse>("/api/applicant/profile/auto-apply", {
        method: "POST",
        body: { extraction: ext.merged },
      });
      setProgress(100);
      toast.success(`${applied.totalFilled} fields updated`, {
        description:
          applied.totalReplaced > 0
            ? `${applied.totalReplaced} existing value${applied.totalReplaced === 1 ? " was" : "s were"} replaced. Review each section before applying.`
            : "Review each section before applying.",
      });
      setLastApply(applied);
      setPhase("idle");
      setProgress(0);
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Something went wrong while processing your PDS.",
        fileName: file.name,
      });
      setPhase("idle");
      setProgress(0);
      await onDocsChanged();
    }
  };

  const clearProfile = async () => {
    setClearing(true);
    try {
      await apiFetch("/api/applicant/profile/clear", { method: "POST" });
      toast.success("Profile cleared", {
        description: "Your forms are empty again — upload your PDS to auto-fill them.",
      });
      setClearOpen(false);
      setLastApply(null);
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to clear your profile");
    } finally {
      setClearing(false);
    }
  };

  const pickFile = () => inputRef.current?.click();

  return (
    <SectionCard
      icon={CloudUpload}
      chipTone="plum"
      title="AI-Assisted PDS Auto-Fill"
      description="Upload your accomplished Civil Service Form 212 and we fill your profile."
      actions={<span className="status-pill status-info">AI-assisted</span>}
    >
      {/* Phase progress — thin bar, ember gradient fill (sanctioned progress gradient) */}
      {busy && (
        <div className="mb-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fog">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f69251] to-[#ef8340] motion-safe:transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-stone">
            <Loader2 className="h-3 w-3 animate-spin" /> {PHASE_LABEL[phase]}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-[12px] border border-[var(--bad)]/30 bg-white p-4">
          <p className="text-sm text-ink">{error.message}</p>
          <p className="mt-0.5 text-xs text-stone">{error.fileName}</p>
          <button
            type="button"
            onClick={pickFile}
            className="dlg-ghost mt-3 inline-flex min-h-[44px] items-center gap-2 px-5 py-2 text-sm"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Try Again
          </button>
        </div>
      )}

      {/* Extraction result — quiet rows with tabular counts */}
      {!busy && applyRows.length > 0 && (
        <div className="mb-4 rounded-[12px] bg-fog p-4">
          <p className="text-xs font-medium text-graphite">Extraction applied to your profile</p>
          <dl className="mt-2 divide-y divide-border">
            {applyRows.map(([label, count]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                <dt className="text-xs text-stone">{label}</dt>
                <dd className="num text-xs font-medium text-ink">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {locked ? (
        /* One-extraction lock (§7.5) — the only way back is a full clear. */
        <div className="flex flex-col gap-3 rounded-[12px] bg-fog p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconChip icon={Lock} tone="ink" size={36} iconSize={16} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ink">Profile auto-filled from your PDS</p>
              <p className="mt-0.5 text-xs text-stone">
                Extraction already ran on your documents. Clear your forms to start over.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={clearing}
            className="min-h-[44px] w-fit shrink-0 rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog disabled:opacity-50"
          >
            {clearing ? "Clearing…" : "Clear Forms & Re-upload"}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !busy) void runPipeline(f);
            }}
            className={cn(
              "focus-ring flex min-h-[140px] w-full flex-col items-center justify-center gap-2.5 rounded-[12px] border border-dashed border-[#dcdcdc] bg-white p-6 text-center transition-all duration-200 hover:bg-fog disabled:opacity-60",
              dragOver &&
                "border-ink bg-fog ring-2 ring-[#f69251]/30 bg-[radial-gradient(460px_200px_at_50%_10%,rgba(246,146,81,0.09),transparent_70%)]"
            )}
          >
            <IconChip icon={CloudUpload} tone="plum" size={44} />
            <span className="text-sm font-medium text-ink">Upload PDS — CS Form 212</span>
            <span className="text-xs text-pebble">XLSX, PDF, DOCX or image · up to 10 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void runPipeline(f);
            }}
          />
        </>
      )}

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Clear all forms and re-upload?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              This erases ALL of your profile information — personal details, education, work experience, training,
              eligibility, and awards — and marks your profile incomplete again. Your uploaded files stay for HR review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep my data</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void clearProfile();
              }}
              disabled={clearing}
              className="min-h-[44px] rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
