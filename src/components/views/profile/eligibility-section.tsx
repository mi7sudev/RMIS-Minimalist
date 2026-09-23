"use client";

// ============================================================================
// RMIS — Profile builder · Section 05 Eligibility (spec §7.4). SELECT-first,
// spec-driven form: options come from the CSC eligibility registry merged
// with /api/reference eligibilities, plus "Others". Choosing a name reveals
// only its relevant fields via ELIGIBILITY_SPECS (exam → rating/date/place;
// license → + license no./validity; conferment → Date/Place of Conferment
// written to examDate/examPlace; Others → one free-text title). The title is
// required and stored verbatim so the MQR eligibility matcher can find it.
// Presentation pass: SectionCard shell + header save indicator + functional
// destructive styling (--bad); all save/delete behavior unchanged.
// ============================================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Plus, Trash2 } from "lucide-react";
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
import { EmptyState, SectionCard } from "@/components/ui/shell";
import { apiFetch, formatDate } from "@/lib/client";
import { CSC_ELIGIBILITY_REGISTRY, ELIGIBILITY_SPECS } from "@/lib/constants";
import FormDialog, { type FormFieldConfig, type FormValue } from "./form-dialog";
import { SaveHint, useSavedFlash } from "./save-hint";
import type { EligibilityRow } from "./section-types";

const OTHERS = "Others";

type Kind = "exam" | "license" | "conferment" | "custom";

function kindFor(title: string): Kind {
  if (title === OTHERS) return "custom";
  return ELIGIBILITY_SPECS[title]?.kind ?? "exam";
}

function kindOfValue(values: Record<string, FormValue>): Kind {
  return kindFor(String(values.title ?? ""));
}

export default function EligibilitySection({
  items,
  referenceNames,
  onChanged,
}: {
  items: EligibilityRow[];
  referenceNames: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EligibilityRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();

  // Registry ∪ reference (deduped, stable order) + Others.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const name of [...CSC_ELIGIBILITY_REGISTRY.map((r) => r.name), ...referenceNames]) {
      if (!seen.has(name)) {
        seen.add(name);
        merged.push(name);
      }
    }
    merged.push(OTHERS);
    return merged;
  }, [referenceNames]);

  const initial = editing
    ? {
        title: options.includes(editing.title) ? editing.title : OTHERS,
        customTitle: options.includes(editing.title) ? "" : editing.title,
        rating: editing.rating ?? "",
        examDate: editing.examDate ?? "",
        examPlace: editing.examPlace ?? "",
        licenseNumber: editing.licenseNumber ?? "",
        licenseValidity: editing.licenseValidity ?? "",
      }
    : {};

  const fields: FormFieldConfig[] = useMemo(
    () => [
      {
        key: "title",
        label: "Eligibility",
        type: "select",
        required: true,
        full: true,
        options: options.map((o) => ({ value: o, label: o })),
        helper: "Only the fields relevant to the selected eligibility appear.",
      },
      {
        key: "customTitle",
        label: "Specify Eligibility",
        type: "text",
        required: true,
        full: true,
        placeholder: "e.g. Career Service (Second Level) — PD 907 grantee",
        showIf: (v) => kindOfValue(v) === "custom",
      },
      {
        key: "rating",
        label: "Rating",
        type: "text",
        placeholder: "e.g. 86.45",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license";
        },
      },
      {
        key: "examDate",
        label: "Exam Date",
        labelOf: (v) => (kindOfValue(v) === "conferment" ? "Date of Conferment" : "Exam Date"),
        type: "date",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license" || k === "conferment";
        },
      },
      {
        key: "examPlace",
        label: "Exam Place",
        labelOf: (v) => (kindOfValue(v) === "conferment" ? "Place of Conferment" : "Exam Place"),
        type: "text",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license" || k === "conferment";
        },
      },
      {
        key: "licenseNumber",
        label: "License Number",
        type: "text",
        showIf: (v) => kindOfValue(v) === "license",
      },
      {
        key: "licenseValidity",
        label: "License Validity",
        type: "text",
        placeholder: "e.g. Valid until 2029 / Lifetime",
        showIf: (v) => kindOfValue(v) === "license",
      },
    ],
    [options]
  );

  const save = async (values: Record<string, FormValue>) => {
    setBusy(true);
    try {
      const isOthers = values.title === OTHERS;
      const title = String(isOthers ? (values.customTitle ?? "") : (values.title ?? "")).trim();
      if (!title) {
        toast.error("Eligibility title is required");
        setBusy(false);
        return;
      }
      const payload = {
        title,
        rating: (values.rating as string) || null,
        examDate: (values.examDate as string) || null,
        examPlace: (values.examPlace as string) || null,
        licenseNumber: (values.licenseNumber as string) || null,
        licenseValidity: (values.licenseValidity as string) || null,
      };
      if (editing) await apiFetch(`/api/applicant/eligibilities/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/applicant/eligibilities", { method: "POST", body: payload });
      toast.success(editing ? "Eligibility updated" : "Eligibility added");
      setOpen(false);
      setEditing(null);
      flashSaved();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save this entry");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/applicant/eligibilities/${id}`, { method: "DELETE" });
      toast.success("Eligibility removed");
      setDeleteId(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
    }
  };

  return (
    <SectionCard
      icon={BadgeCheck}
      chipTone="gold"
      title="Eligibility"
      description="Civil-service eligibility — matched verbatim against job requirements."
      actions={
        <div className="flex items-center gap-3">
          <SaveHint saving={busy} saved={savedFlash} />
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Add Eligibility
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={BadgeCheck}
          tone="gold"
          title="No eligibility on file"
          description="Bar/board licenses count as eligibility under RA 1080."
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="dlg-card-plain rounded-none border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.title}</p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.rating ? `Rating ${row.rating} · ` : ""}
                    {row.examDate ? `Exam ${formatDate(row.examDate)}` : ""}
                    {row.examPlace ? ` · ${row.examPlace}` : ""}
                    {row.licenseNumber
                      ? `${row.rating || row.examDate ? " · " : ""}License ${row.licenseNumber}`
                      : ""}
                    {row.licenseValidity ? ` (${row.licenseValidity})` : ""}
                    {!row.rating && !row.examDate && !row.licenseNumber ? "Details not specified" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    className="focus-ring min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete eligibility"
                    className="inline-flex h-[44px] w-[44px] items-center justify-center text-pebble transition-colors hover:bg-[var(--bad)]/10 hover:text-[var(--bad)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Eligibility" : "Add Eligibility"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={fields}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Remove this eligibility?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              This permanently removes the entry. Jobs requiring this eligibility may no longer match your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className="min-h-[44px] border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
