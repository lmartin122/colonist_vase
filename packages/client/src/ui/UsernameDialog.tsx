import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { USERNAME_MAX_LENGTH, normalizeUsername, validateUsername } from '@colonist/shared';

/**
 * Pick (or change) the display name everyone else sees. Shown blocking on first
 * login — Auth0 hands us the email for database connections, which is not
 * something you want on a game board.
 */
export function UsernameDialog({
  open,
  current,
  dismissable,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string | null;
  /** First-time setup cannot be dismissed; editing from the profile can. */
  dismissable: boolean;
  onClose: () => void;
  onSave: (username: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(current ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(current ?? '');
      setServerError(null);
    }
  }, [open, current]);

  const trimmed = normalizeUsername(value);
  const localError = trimmed ? validateUsername(value) : null;
  const unchanged = current !== null && trimmed === current;
  const canSave = !saving && trimmed.length > 0 && !localError && !unchanged;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setServerError(null);
    const failure = await onSave(trimmed);
    setSaving(false);
    if (failure) setServerError(failure);
    else onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(event) => {
            if (dismissable && event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={current ? 'Change your username' : 'Choose your username'}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="w-full max-w-md rounded-2xl bg-card p-5 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15"
          >
            <h2 className="font-display text-xl font-extrabold">
              {current ? 'Change your username' : 'Choose your username'}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              This is the name other players see in the lobby, the board and the chat.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="mt-4"
            >
              <input
                autoFocus
                value={value}
                maxLength={USERNAME_MAX_LENGTH}
                onChange={(event) => {
                  setValue(event.target.value);
                  setServerError(null);
                }}
                placeholder="e.g. AdaBuilds"
                aria-label="Username"
                aria-invalid={Boolean(localError || serverError)}
                className="w-full rounded-xl bg-card-alt px-4 py-3 text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-p-blue dark:ring-white/10"
              />
              <p
                role={localError || serverError ? 'alert' : undefined}
                className={`mt-2 min-h-5 text-xs font-semibold ${localError || serverError ? 'text-p-red' : 'text-ink-faint'}`}
              >
                {serverError ?? localError ?? `${USERNAME_MAX_LENGTH} characters max · letters, digits, spaces, - or _`}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                {dismissable && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl bg-card-alt px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-ink/10"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!canSave}
                  className="rounded-xl bg-p-green px-5 py-2.5 font-display font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
