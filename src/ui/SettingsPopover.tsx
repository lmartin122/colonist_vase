import { useEffect, useRef, useState } from 'react';
import { setUiPreferences, useUiPreferences } from '../state/preferences';

export function SettingsPopover({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const preferences = useUiPreferences();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <div ref={ref} className={`pointer-events-auto z-40 ${embedded ? 'relative' : 'absolute left-[6.5rem] top-3 sm:left-[7.5rem] sm:top-4'}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Open settings" aria-expanded={open} className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg text-ink transition hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green ${embedded ? '' : 'bg-card shadow-panel ring-1 ring-black/5 dark:ring-white/15'}`}>⚙</button>
      {open && (
        <div role="dialog" aria-label="Settings" className={`absolute top-[calc(100%+8px)] w-64 rounded-2xl bg-card p-3 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15 ${embedded ? 'right-0' : 'left-0'}`}>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-bold">
            Sound
            <input type="checkbox" checked={preferences.sound} onChange={(event) => setUiPreferences({ sound: event.target.checked })} className="h-5 w-5 accent-p-green" />
          </label>
          <label className="mt-2 flex min-h-11 items-center justify-between gap-3 text-sm font-bold">
            Animations
            <input type="checkbox" checked={preferences.animationMode !== 'reduced'} onChange={(event) => setUiPreferences({ animationMode: event.target.checked ? 'full' : 'reduced' })} className="h-5 w-5 accent-p-green" />
          </label>
        </div>
      )}
    </div>
  );
}
