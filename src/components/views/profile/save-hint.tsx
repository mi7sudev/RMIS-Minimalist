"use client";

// ============================================================================
// RMIS — Presentation-only save-state indicator for the profile builder
// section headers (spec §7.4). Shows "Saving…" while a mutation is in flight
// and "Saved ✓" after it succeeds. Purely visual: it never triggers, delays,
// or changes any save — callers wire it to their existing busy/success state.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

/** Flash state for sections whose mutations are inline (not autosaved). */
export function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2600);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return [saved, flash];
}

export function SaveHint({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) return <span className="text-xs leading-none text-stone">Saving…</span>;
  if (saved) return <span className="text-xs leading-none text-[var(--ok)]">Saved ✓</span>;
  return null;
}
