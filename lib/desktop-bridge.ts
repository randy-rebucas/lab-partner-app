// The desktop app (lab-partner-desktop) exposes `window.labDesktop` on lab pages. In a browser it
// is absent and pages fall back to the browser's own print dialog.

type LabDesktop = { isDesktop: true; version: string | null; print: (kind: 'label' | 'report') => Promise<{ ok: boolean; error?: string }> };

export function labDesktop(): LabDesktop | null {
  if (typeof window === 'undefined') return null;
  const d = (window as unknown as { labDesktop?: LabDesktop }).labDesktop;
  return d?.isDesktop ? d : null;
}

/** Print the current page: to the printer chosen in the desktop app, else through the browser. */
export async function printPage(kind: 'label' | 'report'): Promise<string | null> {
  const desktop = labDesktop();
  if (!desktop) {
    window.print();
    return null;
  }
  const r = await desktop.print(kind);
  return r.ok ? null : (r.error ?? 'Printing failed.');
}
