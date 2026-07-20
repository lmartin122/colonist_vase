import { useGame } from '../state/store';

/** Floating light/dark theme switch. Persists via the store + localStorage. */
export function ThemeToggle({ embedded = false }: { embedded?: boolean }) {
  const theme = useGame((s) => s.theme);
  const toggleTheme = useGame((s) => s.toggleTheme);
  const dark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
      className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl text-ink transition-all duration-200 ease-smooth hover:bg-ink/10 active:scale-95 ${embedded ? 'relative' : 'absolute left-14 top-3 z-30 bg-card shadow-panel ring-1 ring-black/5 dark:ring-white/15 sm:left-16 sm:top-4'}`}
    >
      <span className="text-base leading-none">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}
