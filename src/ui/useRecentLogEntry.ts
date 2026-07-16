import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../engine/types';

export function useRecentLogEntry(log: LogEntry[], holdMs: number): LogEntry | null {
  const [visible, setVisible] = useState<{ entry: LogEntry; atLength: number } | null>(null);
  const seenLength = useRef(log.length);
  useEffect(() => {
    if (log.length > seenLength.current) {
      const entry = log[log.length - 1];
      const atLength = log.length;
      setVisible({ entry, atLength });
      const t = setTimeout(() => setVisible((v) => (v?.atLength === atLength ? null : v)), holdMs);
      seenLength.current = log.length;
      return () => clearTimeout(t);
    }
    seenLength.current = log.length;
  }, [log, holdMs]);
  return visible?.entry ?? null;
}
