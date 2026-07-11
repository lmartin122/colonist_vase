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
    <div className="flex h-full w-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md rounded-3xl bg-white/5 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
      >
        <div className="mb-1 text-center text-5xl">🏝️</div>
        <h1 className="mb-1 text-center font-display text-3xl font-extrabold tracking-tight">
          Colonist Vase
        </h1>
        <p className="mb-6 text-center text-sm text-white/50">
          Build, trade and settle your way to 10 points.
        </p>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/50">
          Opponents
        </label>
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setBots(n)}
              className={pill(bots === n)}
            >
              {n} bot{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/50">
          Board
        </label>
        <div className="mb-7 grid grid-cols-2 gap-2">
          <button onClick={() => setLayout('random')} className={pill(layout === 'random')}>
            🎲 Random
          </button>
          <button onClick={() => setLayout('classic')} className={pill(layout === 'classic')}>
            📜 Classic
          </button>
        </div>

        <button
          onClick={start}
          className="w-full rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3.5 font-display text-lg font-extrabold text-emerald-950 shadow-lg transition hover:brightness-110 active:scale-[0.98]"
        >
          Play
        </button>
      </motion.div>
    </div>
  );
}

const BOT_NAMES = ['Ada', 'Bram', 'Cleo'];

function pill(active: boolean): string {
  return [
    'rounded-xl px-3 py-2.5 text-sm font-bold transition',
    active
      ? 'bg-white/90 text-slate-900 shadow'
      : 'bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10',
  ].join(' ');
}
