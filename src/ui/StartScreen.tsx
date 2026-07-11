import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../state/store';

/** Landing screen: choose opponents and board, then start a game vs bots. */
export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const [bots, setBots] = useState(3);
  const [layout, setLayout] = useState<'random' | 'classic'>('random');

  const start = () => {
    const players = [
      { name: 'You', isBot: false },
      ...Array.from({ length: bots }, (_, i) => ({ name: BOT_NAMES[i], isBot: true })),
    ];
    newGame({ players, layout });
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-2xl bg-card p-8 text-ink shadow-pop ring-1 ring-black/5 dark:ring-white/15"
      >
        <div className="mb-1 text-center text-5xl">🏝️</div>
        <h1 className="text-center font-display text-3xl font-extrabold tracking-tight">Colonist Vase</h1>
        <p className="mb-7 mt-1 text-center text-sm text-ink-soft">Build, trade and settle your way to 10 points.</p>

        <Label>Opponents</Label>
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((n) => (
            <Pill key={n} active={bots === n} onClick={() => setBots(n)}>{n} bot{n > 1 ? 's' : ''}</Pill>
          ))}
        </div>

        <Label>Board</Label>
        <div className="mb-7 grid grid-cols-2 gap-2">
          <Pill active={layout === 'random'} onClick={() => setLayout('random')}>🎲 Random</Pill>
          <Pill active={layout === 'classic'} onClick={() => setLayout('classic')}>📜 Classic</Pill>
        </div>

        <button
          onClick={start}
          className="w-full rounded-xl bg-p-green px-4 py-3.5 font-display text-lg font-extrabold text-white shadow-soft transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98]"
        >
          Play
        </button>
      </motion.div>
    </div>
  );
}

const BOT_NAMES = ['Ada', 'Bram', 'Cleo'];

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{children}</div>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-smooth active:scale-[0.97] ${
        active ? 'bg-ink text-card shadow-soft' : 'bg-card-alt text-ink-soft hover:-translate-y-0.5 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
