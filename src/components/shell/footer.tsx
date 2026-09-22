// ============================================================================
// RMIS — Shell footer (Dialog theme): single muted row, sticky-footer safe.
// ============================================================================

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-1.5 px-4 py-6 text-center text-xs text-pebble sm:flex-row sm:gap-3 sm:px-6 sm:text-left">
        <p>DOST-MIRDC Recruitment Management Information System</p>
        <p>Data Privacy Act (RA 10173) compliant</p>
        <p>© {year}</p>
      </div>
    </footer>
  );
}

export default Footer;
