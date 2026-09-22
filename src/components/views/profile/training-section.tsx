"use client";

// ============================================================================
// RMIS — Profile builder · Section 04 Training (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// "Specify" field appears for Non-Technical / Others training types.
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
import { apiFetch } from "@/lib/client";
import { TRAINING_TYPES } from "@/lib/constants";
import FormDialog from "./form-dialog";
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
    <div className="dlg-card p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">04 · Training</h2>
          <p className="mt-0.5 text-sm text-stone">Seminars and trainings — hours count toward training requirements.</p>
        </div>
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

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-divider p-8 text-center">
          <BookOpen className="h-6 w-6 text-pebble" />
          <p className="text-sm text-stone">No training entries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="dlg-card-plain rounded-[12px] border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.title ?? "—"}</p>
                  <p className="mt-1 text-sm text-stone">
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
                    className="min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete training entry"
                    className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-pebble transition-colors hover:bg-dusty-rose/10 hover:text-dusty-rose"
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
            <AlertDialogCancel className="dlg-ghost min-h-[44px] border-0 px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className="min-h-[44px] rounded-full bg-dusty-rose px-5 py-2.5 text-sm font-medium text-white hover:bg-dusty-rose/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
