import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cityAsset, roadAsset, settlementAsset } from '../assets';
import { MAX_VICTORY_POINTS, PLAYER_COLORS } from '@colonist/shared';
import { DEFAULT_RULES } from '@colonist/shared';
import type { BotDifficulty, GameRules, PlayerColor } from '@colonist/shared';
import { useGame } from '../state/store';

/** Landing screen: choose players, board, and rules, then start a game. */
export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const enableDebug = useGame((s) => s.enableDebug);
  const debugEnabled = useGame((s) => s.debugEnabled);
  const [botSlots, setBotSlots] = useState([false, false, false]);
  const [botDifficulties, setBotDifficulties] = useState<BotDifficulty[]>(['medium', 'medium', 'medium']);
  const [, setProfileClicks] = useState(0);
  const [playerColors, setPlayerColors] = useState<PlayerColor[]>([...PLAYER_COLORS]);
  const [layout, setLayout] = useState<'random' | 'classic'>('random');
  const [rules, setRules] = useState<GameRules>(DEFAULT_RULES);
  const hasBot = botSlots.some(Boolean);

  const start = () => {
    const players = [
      { name: 'You', isBot: false, color: playerColors[0] },
      ...BOT_NAMES.flatMap((name, index) => botSlots[index]
        ? [{ name, isBot: true, color: playerColors[index + 1], botDifficulty: botDifficulties[index] }]
        : []),
    ];
    newGame({ players, layout, rules });
  };

  const unlockDebug = () => {
    setProfileClicks((clicks) => {
      const next = clicks + 1;
      if (next >= 5) {
        enableDebug();
        return 0;
      }
      return next;
    });
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-4 font-sans sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-card p-6 text-ink shadow-pop ring-1 ring-black/5 sm:p-8 dark:ring-white/15"
      >
        <button
          type="button"
          title={debugEnabled ? 'Debug mode enabled' : 'Profile (coming soon)'}
          aria-label="Profile"
          onClick={unlockDebug}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-card-alt text-ink-soft ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:text-ink hover:shadow-soft sm:right-6 sm:top-6 dark:ring-white/10"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </button>
        <div className="mb-1 text-center text-5xl">🏝️</div>
        <h1 className="text-center font-display text-3xl font-extrabold tracking-tight">Colonist Vase</h1>
        <p className="mb-7 mt-1 text-center text-sm text-ink-soft">Build, trade and settle your way to victory.</p>

        <div
          className="grid gap-4 sm:gap-6"
          style={{ gridTemplateColumns: 'clamp(320px, 34vw, 360px) minmax(0, 1fr)' }}
        >
          <PlayerSlots slots={botSlots} onChange={setBotSlots} colors={playerColors} onColorsChange={setPlayerColors} difficulties={botDifficulties} onDifficultiesChange={setBotDifficulties} />

          <div className="rounded-2xl bg-card-alt/30 p-4 ring-1 ring-black/5 dark:ring-white/10">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label>Board</Label>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  <Pill active={layout === 'random'} onClick={() => setLayout('random')}>🎲 Random</Pill>
                  <Pill active={layout === 'classic'} onClick={() => setLayout('classic')}>📜 Classic</Pill>
                </div>
              </div>
              <div>
                <Label>Turn timer</Label>
                <div className="mb-5 grid grid-cols-3 gap-2">
                  {([15, 30, 60] as const).map((seconds) => (
                    <Pill key={seconds} active={rules.turnTimer === seconds} onClick={() => setRules({ ...rules, turnTimer: seconds })}>{seconds}s</Pill>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RangeSetting label="Points to win" value={rules.victoryPoints} min={3} max={MAX_VICTORY_POINTS} onChange={(victoryPoints) => setRules({ ...rules, victoryPoints })} />
              <RangeSetting label="Discard limit" value={rules.discardLimit} min={5} max={20} onChange={(discardLimit) => setRules({ ...rules, discardLimit })} />
            </div>

            <Label>Rules</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <RuleToggle label="Hide Bank Cards" description="Hide remaining card counts." checked={rules.hideBankCards} onChange={(hideBankCards) => setRules({ ...rules, hideBankCards })} />
              <RuleToggle label="Friendly Robber" description="Players below 3 visible VP cannot be blocked or robbed." checked={rules.friendlyRobber} onChange={(friendlyRobber) => setRules({ ...rules, friendlyRobber })} />
              <RuleToggle label="Player Trading" description="Allow direct trades with opponents." checked={rules.allowPlayerTrades} onChange={(allowPlayerTrades) => setRules({ ...rules, allowPlayerTrades })} />
            </div>

          </div>
        </div>
        <button
          onClick={start}
          disabled={!hasBot}
          className="mx-auto mt-6 block w-full rounded-2xl bg-p-green px-4 py-4 font-display text-lg font-extrabold text-white shadow-soft transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-card-alt disabled:text-ink-faint disabled:shadow-none sm:w-1/2"
        >
          {hasBot ? `Start Game · ${1 + botSlots.filter(Boolean).length} Players` : 'Add at least one bot'}
        </button>
      </motion.div>
    </div>
  );
}

function PlayerSlots({ slots, onChange, colors, onColorsChange, difficulties, onDifficultiesChange }: { slots: boolean[]; onChange: (slots: boolean[]) => void; colors: PlayerColor[]; onColorsChange: (colors: PlayerColor[]) => void; difficulties: BotDifficulty[]; onDifficultiesChange: (values: BotDifficulty[]) => void }) {
  const [openColor, setOpenColor] = useState<number | null>(null);
  const toggle = (index: number) => onChange(slots.map((filled, i) => i === index ? !filled : filled));
  const chooseColor = (playerSlot: number, color: PlayerColor) => {
    const activeSlots = [0, ...slots.flatMap((filled, index) => filled ? [index + 1] : [])];
    const otherSlot = activeSlots.find((slot) => slot !== playerSlot && colors[slot] === color);
    const next = [...colors];
    if (otherSlot !== undefined) next[otherSlot] = colors[playerSlot];
    next[playerSlot] = color;
    onColorsChange(next);
    setOpenColor(null);
  };
  const picker = (slot: number) => (
    <ColorPicker color={colors[slot]} open={openColor === slot} onToggle={() => setOpenColor(openColor === slot ? null : slot)} onChoose={(color) => chooseColor(slot, color)} />
  );
  return (
    <div className="flex h-full flex-col rounded-2xl bg-card-alt/50 p-3 ring-1 ring-black/5 dark:ring-white/10">
      <Label>Players · {1 + slots.filter(Boolean).length}/4</Label>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="relative flex min-h-[52px] flex-1 items-center gap-2 rounded-xl bg-ink px-2 py-2 text-card shadow-soft">
          <span className="text-xl">🎩</span><span className="font-display text-sm font-extrabold">You</span><div className="ml-auto">{picker(0)}</div>
        </div>
        {slots.map((filled, index) => filled ? (
          <div key={BOT_NAMES[index]} className="relative flex min-h-[52px] flex-1 items-center gap-2 rounded-xl bg-card px-2 py-2 text-ink shadow-sm ring-1 ring-black/5 dark:ring-white/10">
            <span className="text-xl">🤖</span>
            <span className="truncate font-display text-sm font-extrabold">{BOT_NAMES[index]}</span>
            <select value={difficulties[index]} onChange={(event) => onDifficultiesChange(difficulties.map((value, i) => i === index ? event.target.value as BotDifficulty : value))} aria-label={`${BOT_NAMES[index]} difficulty`} className="w-[78px] rounded-lg bg-card-alt px-1.5 py-1 text-[11px] font-extrabold capitalize text-ink outline-none ring-1 ring-ink/10">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
            <div className="ml-auto">{picker(index + 1)}</div>
            <button type="button" onClick={() => toggle(index)} title={`Remove ${BOT_NAMES[index]}`} className="rounded-md px-1.5 py-1 text-xs text-ink-faint transition hover:bg-p-red hover:text-white">×</button>
          </div>
        ) : (
          <button key={BOT_NAMES[index]} type="button" onClick={() => toggle(index)} title="Add bot" className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-faint/40 bg-card/40 px-3 py-2 text-sm font-bold text-ink-faint transition hover:border-p-green hover:bg-card hover:text-p-green active:scale-[0.98]">
            <span className="text-xl">+</span><span>Add bot</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({ color, open, onToggle, onChoose }: { color: PlayerColor; open: boolean; onToggle: () => void; onChoose: (color: PlayerColor) => void }) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) onToggle();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open, onToggle]);

  return (
    <div ref={pickerRef} className="relative shrink-0">
      <button type="button" onClick={onToggle} title={`Piece color: ${color}`} className="flex w-32 items-center justify-center rounded-lg bg-black/10 p-1.5 transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"><PiecePreview color={color} large /></button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-32 flex-col gap-1 rounded-xl bg-card p-1.5 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15">
          {PLAYER_COLORS.filter((option) => option !== color).map((option) => (
            <button key={option} type="button" onClick={() => onChoose(option)} title={option} className={`flex items-center justify-center rounded-lg p-1.5 transition hover:bg-card-alt ${option === color ? 'bg-card-alt ring-1 ring-ink/20' : ''}`}><PiecePreview color={option} large /></button>
          ))}
        </div>
      )}
    </div>
  );
}

function PiecePreview({ color, large = false }: { color: PlayerColor; large?: boolean }) {
  const size = large ? 'h-6 w-6' : 'h-4 w-4';
  const overlap = large ? 'ml-1' : '-ml-1';
  return <span className="flex items-end"><img src={roadAsset(color)} alt="Road" className={`${size} object-contain`} /><img src={settlementAsset(color)} alt="Settlement" className={`${size} ${overlap} object-contain`} /><img src={cityAsset(color)} alt="City" className={`${size} ${overlap} object-contain`} /></span>;
}

function RangeSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint"><span>{label}</span><span className="text-ink">{value}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-p-green" />
    </label>
  );
}

function RuleToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`rounded-xl p-3 text-left ring-1 transition ${checked ? 'bg-ink text-card ring-ink' : 'bg-card-alt text-ink ring-black/5 dark:ring-white/10'}`}>
      <span className="flex items-center justify-between gap-2 text-sm font-extrabold">{label}<span className={`h-3 w-3 rounded-full ${checked ? 'bg-p-green' : 'bg-ink-faint/40'}`} /></span>
      <span className={`mt-1 block text-[11px] leading-snug ${checked ? 'text-card/70' : 'text-ink-soft'}`}>{description}</span>
    </button>
  );
}

const BOT_NAMES = ['Ada', 'Bram', 'Cleo'];

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{children}</div>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-smooth active:scale-[0.97] ${active ? 'bg-ink text-card shadow-soft' : 'bg-card-alt text-ink-soft hover:-translate-y-0.5 hover:text-ink'}`}>{children}</button>;
}
