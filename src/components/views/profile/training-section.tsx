"use client";

// ============================================================================
// RMIS — Profile builder · Section 04 Training (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// "Specify" field appears for Non-Technical / Others training types.
// Presentation pass: SectionCard shell + header save indicator + functional
// destructive styling (--bad); all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2 } from "lucide-react";
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
import { apiFetch } from "@/lib/client";
import { TRAINING_TYPES } from "@/lib/constants";
import FormDialog from "./form-dialog";
import { SaveHint, useSavedFlash } from "./save-hint";
import { dateInput, type TrainingRow } from "./section-types";

const TRAINING_OPTIONS = [...TRAINING_TYPES, "Others"];

export default function TrainingSection({
  items,
  onChanged,
}: {
  items: TrainingRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();

  const initial = editing
    ? {
        title: editing.title ?? "",
        typeOfTraining: editing.typeOfTraining ?? "",
        specifyTraining: editing.specifyTraining ?? "",
        numberHours: editing.numberHours ?? "",
        dateFrom: dateInput(editing.dateFrom),
        dateTo: dateInput(editing.dateTo),
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (editing) await apiFetch(`/api/applicant/trainings/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/applicant/trainings", { method: "POST", body: values });
      toast.success(editing ? "Training entry updated" : "Training entry added");
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
      await apiFetch(`/api/applicant/trainings/${id}`, { method: "DELETE" });
      toast.success("Training entry removed");
      setDeleteId(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
    }
  };

  return (
    <SectionCard
      icon={BookOpen}
      chipTone="emerald"
      title="Training"
      description="Seminars and trainings — hours count toward training requirements."
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
            <Plus className="h-4 w-4" /> Add Training
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={BookOpen} tone="emerald" title="No training entries yet" description="Add seminars and trainings you have completed." />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="dlg-card-plain rounded-none border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.title ?? "—"}</p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.typeOfTraining ?? "—"}
                    {row.specifyTraining ? ` (${row.specifyTraining})` : ""}
                    {row.numberHours != null ? ` · ${row.numberHours} hrs` : ""}
                    {row.dateFrom ? ` · ${new Date(row.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                    {row.dateTo
                      ? ` – ${new Date(row.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
                      : ""}
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
                    aria-label="Delete training entry"
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
        title={editing ? "Edit Training" : "Add Training"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={[
          { key: "title", label: "Title of Training", type: "text", required: true, full: true },
          {
            key: "typeOfTraining",
            label: "Type of Training",
            type: "select",
            options: TRAINING_OPTIONS.map((t) => ({ value: t, label: t })),
          },
          {
            key: "specifyTraining",
            label: "Specify",
            type: "text",
            showIf: (v) => v.typeOfTraining === "Non-Technical" || v.typeOfTraining === "Others",
          },
          { key: "numberHours", label: "Number of Hours", type: "number", placeholder: "0" },
          { key: "dateFrom", label: "Date From", type: "date" },
          { key: "dateTo", label: "Date To", type: "date" },
        ]}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Remove this training entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              This permanently removes the entry from your profile and may change your training-hours total.
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
