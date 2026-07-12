import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../state/store';
import type { GameRules } from '../engine/types';
import { DEFAULT_RULES } from '../engine/game';

/** Landing screen: choose opponents and board, then start a game vs bots. */
export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const [bots, setBots] = useState(3);
  const [layout, setLayout] = useState<'random' | 'classic'>('random');
  const [rules, setRules] = useState<GameRules>(DEFAULT_RULES);

  const start = () => {
    const players = [
      { name: 'You', isBot: false },
      ...Array.from({ length: bots }, (_, i) => ({ name: BOT_NAMES[i], isBot: true })),
    ];
    newGame({ players, layout, rules });
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 text-ink shadow-pop ring-1 ring-black/5 sm:p-8 dark:ring-white/15"
      >
        <div className="mb-1 text-center text-5xl">🏝️</div>
        <h1 className="text-center font-display text-3xl font-extrabold tracking-tight">Colonist Vase</h1>
        <p className="mb-7 mt-1 text-center text-sm text-ink-soft">Build, trade and settle your way to victory.</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>

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
          </div>

          <div>
            <Label>Turn timer</Label>
            <div className="mb-5 grid grid-cols-3 gap-2">
              {([15, 30, 60] as const).map((seconds) => (
                <Pill key={seconds} active={rules.turnTimer === seconds} onClick={() => setRules({ ...rules, turnTimer: seconds })}>
                  {seconds}s
                </Pill>
              ))}
            </div>

            <RangeSetting label="Points to win" value={rules.victoryPoints} min={3} max={20} onChange={(victoryPoints) => setRules({ ...rules, victoryPoints })} />
            <RangeSetting label="Discard limit" value={rules.discardLimit} min={5} max={20} onChange={(discardLimit) => setRules({ ...rules, discardLimit })} />
          </div>
        </div>

        <Label>Rules</Label>
        <div className="mb-7 grid gap-2 sm:grid-cols-3">
          <RuleToggle
            label="Hide Bank Cards"
            description="Hide remaining card counts."
            checked={rules.hideBankCards}
            onChange={(hideBankCards) => setRules({ ...rules, hideBankCards })}
          />
          <RuleToggle
            label="Friendly Robber"
            description="Players below 3 VP cannot be robbed."
            checked={rules.friendlyRobber}
            onChange={(friendlyRobber) => setRules({ ...rules, friendlyRobber })}
          />
          <RuleToggle
            label="Player Trading"
            description="Allow direct trades with opponents."
            checked={rules.allowPlayerTrades}
            onChange={(allowPlayerTrades) => setRules({ ...rules, allowPlayerTrades })}
          />
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

function RangeSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint">
        <span>{label}</span><span className="text-ink">{value}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-p-green" />
    </label>
  );
}

function RuleToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`rounded-xl p-3 text-left ring-1 transition ${checked ? 'bg-ink text-card ring-ink' : 'bg-card-alt text-ink ring-black/5 dark:ring-white/10'}`}>
      <span className="flex items-center justify-between gap-2 text-sm font-extrabold">
        {label}<span className={`h-3 w-3 rounded-full ${checked ? 'bg-p-green' : 'bg-ink-faint/40'}`} />
      </span>
      <span className={`mt-1 block text-[11px] leading-snug ${checked ? 'text-card/70' : 'text-ink-soft'}`}>{description}</span>
    </button>
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
