"use client";

// ============================================================================
// RMIS — Profile builder · Section 07 Supporting Documents (spec §7.4, §10).
// Storage-only by design (no extraction here). A category is REQUIRED before
// any upload; multi-file batch upload posts sequentially with per-file
// toasts; rows show name / size / category / date (+ status chip for
// extractable categories, extraction error via tooltip) with single and
// checkbox batch delete.
// ============================================================================

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch, formatDate, humanize } from "@/lib/client";
import { DOCUMENT_CATEGORIES, EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";

const CATEGORY_NONE = "__select__";
const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

function statusChip(doc: DocumentWire): { label: string; cls: string } | null {
  if (!EXTRACTABLE.includes(doc.category)) return null;
  switch (doc.status) {
    case "EXTRACTED":
      return { label: "Extracted", cls: "bg-ink text-white" };
    case "PARTIALLY_EXTRACTED":
      return { label: "Partial", cls: "bg-fog text-graphite border border-border" };
    case "FAILED":
      return { label: "Failed", cls: "bg-dusty-rose/10 text-dusty-rose" };
    case "PROCESSING":
      return { label: "Processing", cls: "bg-fog text-pebble" };
    default:
      return { label: "Uploaded", cls: "bg-fog text-graphite" };
  }
}

export default function DocumentsSection({
  docs,
  onChanged,
}: {
  docs: DocumentWire[];
  onChanged: () => void | Promise<void>;
}) {
  const [category, setCategory] = useState("");
  const [categoryError, setCategoryError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList) => {
    if (!category) {
      setCategoryError(true);
      toast.error("Select a category before uploading");
      inputRef.current?.blur();
      return;
    }
    setCategoryError(false);
    setUploading(true);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", category);
        await apiFetch("/api/applicant/documents", { method: "POST", formData: fd });
        toast.success(`${file.name} uploaded`);
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `${file.name} could not be uploaded`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (okCount > 0) await onChanged();
  };

  const runDelete = async (ids: string[]) => {
    setDeleting(true);
    let okCount = 0;
    for (const id of ids) {
      try {
        await apiFetch(`/api/applicant/documents/${id}`, { method: "DELETE" });
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "A document could not be deleted");
      }
    }
    setDeleting(false);
    setDeleteTargets(null);
    setSelected(new Set());
    if (okCount > 0) {
      toast.success(okCount === 1 ? "Document deleted" : `${okCount} documents deleted`);
      await onChanged();
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="dlg-card p-6">
      <div className="mb-6 border-b border-border pb-4">
        <h2 className="font-display text-2xl text-ink">07 · Supporting Documents</h2>
        <p className="mt-0.5 text-sm text-stone">
          Credentials for HR verification — stored as-is. PDS extraction lives at the top of this page.
        </p>
      </div>

      {/* Upload rail — category REQUIRED before any file is accepted (§7.4) */}
      <div className="rounded-[12px] bg-fog p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-end">
          <div>
            <p className="mb-1.5 text-xs font-medium text-graphite">
              Category<span className="text-dusty-rose"> *</span>
            </p>
            <Select
              value={category !== "" ? category : CATEGORY_NONE}
              onValueChange={(v) => {
                setCategory(v === CATEGORY_NONE ? "" : v);
                setCategoryError(false);
              }}
              disabled={uploading}
            >
              <SelectTrigger
                className={`dlg-input min-h-[44px] w-full bg-white ${categoryError ? "border-dusty-rose" : ""}`}
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryError && <p className="mt-1 text-xs text-dusty-rose">Choose a category first.</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!category) {
                setCategoryError(true);
                toast.error("Select a category before uploading");
                return;
              }
              inputRef.current?.click();
            }}
            disabled={uploading}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-dashed px-5 py-3 text-sm font-medium transition-colors ${
              categoryError ? "border-dusty-rose bg-dusty-rose/5 text-dusty-rose" : "border-divider bg-white text-ink hover:bg-fog"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Choose files to upload"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void uploadFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-[12px] border border-border px-4 py-2">
          <span className="text-xs text-stone">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => setDeleteTargets([...selected])}
            disabled={deleting}
            className="inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-medium text-dusty-rose disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Delete selected
          </button>
        </div>
      )}

      {/* File rows */}
      {docs.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-divider p-8 text-center">
          <Paperclip className="h-6 w-6 text-pebble" />
          <p className="text-sm text-stone">No documents on file yet.</p>
        </div>
      ) : (
        <TooltipProvider delayDuration={150}>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto scroll-thin pr-1">
            {docs.map((doc) => {
              const chip = statusChip(doc);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-2.5"
                >
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggle(doc.id)}
                    aria-label={`Select ${doc.originalName}`}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={doc.originalName}>
                      {doc.originalName}
                    </p>
                    <p className="text-xs text-pebble">
                      {humanize(doc.category)} · {Math.max(1, Math.round(doc.size / 1024))} KB · {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  {chip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${chip.cls}`}>
                          {chip.label}
                        </span>
                      </TooltipTrigger>
                      {doc.extractionError && (
                        <TooltipContent className="max-w-xs text-xs">{doc.extractionError}</TooltipContent>
                      )}
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTargets([doc.id])}
                    aria-label={`Delete ${doc.originalName}`}
                    className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-pebble transition-colors hover:bg-dusty-rose/10 hover:text-dusty-rose"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <AlertDialog open={deleteTargets !== null} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">
              {deleteTargets !== null && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} documents?` : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              The file will be permanently removed from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] border-0 px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTargets) void runDelete(deleteTargets);
              }}
              disabled={deleting}
              className="min-h-[44px] rounded-full bg-dusty-rose px-5 py-2.5 text-sm font-medium text-white hover:bg-dusty-rose/90 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
