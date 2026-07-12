import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RESOURCE_CARD } from '../assets';
import { tileClientPos } from '../render/boardAnchors';
import { onFlight, type Anchor, type Flight } from '../state/flights';

/**
 * Full-screen overlay that animates resource cards flying between the board,
 * hands, player panels, and the bank. Fed by the flight event bus; each flight
 * resolves its endpoints to live screen coordinates and tweens a card between
 * them, giving every resource transfer a bit of motion.
 */
const DURATION = 0.85;
const CARD_W = 30;
const CARD_H = 42;

interface Live {
  id: string;
  resource: Flight['resource'];
  sx: number; sy: number;
  dx: number; dy: number;
  delay: number;
}

/** Center of the first *visible* element matching the selector (skips display:none). */
function centerOf(sel: string): { x: number; y: number } | null {
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

function anchorPos(a: Anchor): { x: number; y: number } | null {
  switch (a.t) {
    case 'tile': return tileClientPos(a.tile);
    case 'bank': return centerOf(`[data-bank="${a.resource}"]`);
    case 'hand': return centerOf(`[data-hand="${a.resource}"]`) ?? centerOf('[data-hand-panel]');
    case 'player': return centerOf(`[data-player="${a.id}"]`);
  }
}

export function CardFlights() {
  const [live, setLive] = useState<Live[]>([]);

  useEffect(() => {
    return onFlight((f) => {
      const src = anchorPos(f.from);
      const dst = anchorPos(f.to);
      if (!src || !dst) return; // an endpoint isn't on screen (e.g. mobile) — skip
      const item: Live = { id: f.id, resource: f.resource, sx: src.x, sy: src.y, dx: dst.x, dy: dst.y, delay: f.delay / 1000 };
      setLive((prev) => [...prev, item]);
      const ttl = f.delay + DURATION * 1000 + 250;
      setTimeout(() => setLive((prev) => prev.filter((x) => x.id !== f.id)), ttl);
    });
  }, []);

  return (
    <div data-card-flights className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <AnimatePresence>
        {live.map((f) => (
          <motion.img
            key={f.id}
            src={RESOURCE_CARD[f.resource]}
            alt=""
            draggable={false}
            initial={{ x: f.sx - CARD_W / 2, y: f.sy - CARD_H / 2, opacity: 0, scale: 0.5, rotate: -8 }}
            animate={{ x: f.dx - CARD_W / 2, y: f.dy - CARD_H / 2, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: DURATION, delay: f.delay, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ position: 'absolute', left: 0, top: 0, width: CARD_W }}
            className="rounded-[4px] shadow-lg ring-1 ring-black/15"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
