// ============================================================================
// RMIS — Shell footer (Dialog theme): single muted row, sticky-footer safe.
// Enterprise polish: brand glyph + identity, compliance note, copyright.
// ============================================================================

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-1.5 px-4 py-6 text-center text-xs text-pebble sm:flex-row sm:gap-3 sm:px-6 sm:text-left">
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-semibold text-[#2a1608]"
            style={{
              background: "linear-gradient(145deg, #f9a468 0%, #ef8340 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            M
          </span>
          <span>
            DOST-MIRDC Recruitment Management Information System
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-divider sm:block" />
          Data Privacy Act (RA 10173) compliant
        </p>
        <p className="num">© {year}</p>
      </div>
    </footer>
  );
}

export default Footer;
