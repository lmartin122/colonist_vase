import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cityFrame, roadFrame, settlementFrame } from '../assets';
import { DEFAULT_RULES, GAME_MODES, MAX_VICTORY_POINTS, PLAYER_COLORS } from '@colonist/shared';
import type { BotDifficulty, GameModeId, GameRules, PlayerColor } from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { loadGameSetup, saveGameSetup } from '../state/preferences';
import { PackedSprite } from './PackedSprite';
import { PlayerColorBackground, PlayerIcon } from './PlayerDecorations';
import { ChatPanel } from './ChatPanel';
import { ProfileModal } from './ProfileModal';

const BOARD_META: Record<'random' | 'classic', { icon: string; label: string }> = {
  random: { icon: '🎲', label: 'Random' },
  classic: { icon: '📜', label: 'Classic' },
};

/** Landing screen: choose players, board, and rules, then start a game. */
export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const [savedSetup] = useState(loadGameSetup);
  const [botSlots, setBotSlots] = useState(savedSetup?.botSlots ?? [false, false, false]);
  const [botDifficulties, setBotDifficulties] = useState<BotDifficulty[]>(savedSetup?.botDifficulties ?? ['medium', 'medium', 'medium']);
  const [playerColors, setPlayerColors] = useState<PlayerColor[]>(savedSetup?.playerColors ?? [...PLAYER_COLORS]);
  const [layout, setLayout] = useState<'random' | 'classic'>(savedSetup?.layout ?? 'random');
  const [rules, setRules] = useState<GameRules>({ ...DEFAULT_RULES, ...savedSetup?.rules });
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const hasBot = botSlots.some(Boolean);
  const playerCount = 1 + botSlots.filter(Boolean).length;

  useEffect(() => saveGameSetup({ botSlots, botDifficulties, playerColors, layout, rules }), [botSlots, botDifficulties, playerColors, layout, rules]);

  const start = () => {
    const players = [
      { name: 'You', isBot: false, color: playerColors[0] },
      ...BOT_NAMES.flatMap((name, index) => botSlots[index]
        ? [{ name, isBot: true, color: playerColors[index + 1], botDifficulty: botDifficulties[index] }]
        : []),
    ];
    newGame({ players, layout, rules });
  };

  // Active player colors, in seat order, for the summary dots.
  const activeColors = [playerColors[0], ...botSlots.flatMap((filled, index) => filled ? [playerColors[index + 1]] : [])];

  return (
    <div
      className="flex h-full w-full items-center justify-center p-4 font-sans sm:p-6"
      style={{ background: 'radial-gradient(circle at 50% -10%, #2a6485 0%, #163b52 55%, #0d2536 100%)' }}
    >
      <motion.div
        data-start-screen-card
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-full max-h-[calc(100vh-2rem)] w-full max-w-[1320px] flex-col overflow-y-auto rounded-2xl bg-card px-5 py-4 text-ink shadow-pop ring-1 ring-black/5 sm:max-h-[calc(100vh-3rem)] sm:px-7 sm:py-4 min-[850px]:h-[70vh] min-[850px]:max-h-[640px] min-[850px]:overflow-hidden dark:ring-white/15"
      >
        <button type="button" onClick={() => setProfileOpen(true)} aria-label="Open your profile" title="Profile" className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-card-alt text-ink shadow-soft ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green dark:ring-white/15">
          <PlayerIcon isBot={false} className="h-7 w-7" />
        </button>
        <div data-start-screen-logo className="text-center text-3xl leading-none">🏝️</div>
        <h1 className="mt-1.5 text-center font-display text-xl font-extrabold tracking-tight">Colonist Vase</h1>
        <p data-start-screen-subtitle className="mb-3 mt-0.5 text-center text-sm text-ink-soft">Build, trade and settle your way to victory.</p>

        <div className="grid flex-none grid-cols-1 gap-4 min-[850px]:min-h-0 min-[850px]:flex-1 min-[850px]:grid-cols-[240px_minmax(0,1fr)_270px] min-[850px]:gap-3 min-[850px]:overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)_300px] lg:gap-4">
          {/* LEFT — host + players */}
          <div className="flex min-h-0 flex-col gap-3">
            <HostGamePanel />
            <PlayerSlots slots={botSlots} onChange={setBotSlots} colors={playerColors} onColorsChange={setPlayerColors} difficulties={botDifficulties} onDifficultiesChange={setBotDifficulties} playerCount={playerCount} />
          </div>

          {/* MIDDLE — setup */}
          <div className="min-h-0 overflow-y-auto rounded-2xl bg-card-alt/30 p-3 ring-1 ring-black/5 sm:p-4 dark:ring-white/10">
            <Label>Game Mode</Label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {Object.values(GAME_MODES).map((mode) => (
                <div key={mode.id} className="relative">
                  <OptionCard icon={mode.icon} label={mode.label} active={rules.mode === mode.id} onClick={() => setRules({ ...rules, mode: mode.id })} />
                  <ModeInfoButton mode={mode.id} />
                </div>
              ))}
            </div>

            <Label>Board</Label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(['random', 'classic'] as const).map((id) => (
                <OptionCard key={id} icon={BOARD_META[id].icon} label={BOARD_META[id].label} active={layout === id} onClick={() => setLayout(id)} />
              ))}
            </div>

            <Label>Rules</Label>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <RuleToggle icon="🃏" label="Hide Bank" description="Hide card counts" checked={rules.hideBankCards} onChange={(hideBankCards) => setRules({ ...rules, hideBankCards })} />
              <RuleToggle icon="🛡️" label="Friendly Robber" description="Protects low VP" checked={rules.friendlyRobber} onChange={(friendlyRobber) => setRules({ ...rules, friendlyRobber })} />
              <RuleToggle icon="🔁" label="Player Trading" description="Trade with others" checked={rules.allowPlayerTrades} onChange={(allowPlayerTrades) => setRules({ ...rules, allowPlayerTrades })} />
            </div>

            <Label>Advanced Configuration</Label>
            <div className="grid gap-4 sm:grid-cols-3">
              <TurnTimerSetting value={rules.turnTimer} onChange={(turnTimer) => setRules({ ...rules, turnTimer })} />
              <RangeSetting label="Points to win" value={rules.victoryPoints} min={3} max={MAX_VICTORY_POINTS} onChange={(victoryPoints) => setRules({ ...rules, victoryPoints })} />
              <RangeSetting label="Discard limit" value={rules.discardLimit} min={5} max={20} onChange={(discardLimit) => setRules({ ...rules, discardLimit })} />
            </div>
          </div>

          {/* RIGHT — summary + chat + start */}
          <div className="flex min-h-[280px] flex-col gap-3 min-[850px]:min-h-0 min-[850px]:overflow-hidden">
            <MatchSummary
              modeIcon={GAME_MODES[rules.mode].icon}
              modeLabel={GAME_MODES[rules.mode].label}
              boardIcon={BOARD_META[layout].icon}
              boardLabel={BOARD_META[layout].label}
              victoryPoints={rules.victoryPoints}
              colors={activeColors}
            />
            <ChatPanel muted />
            <button
              onClick={start}
              disabled={!hasBot}
              className="block min-h-11 w-full flex-none rounded-2xl bg-p-green px-4 py-3 font-display text-lg font-extrabold text-white shadow-soft transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-p-green active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-card-alt disabled:text-ink-faint disabled:shadow-none"
            >
              {hasBot ? `Start Game · ${playerCount} Players` : 'Add at least one bot'}
            </button>
          </div>
        </div>
      </motion.div>
      <ProfileModal open={profileOpen} onClose={closeProfile} />
    </div>
  );
}

/** Placeholder online-room panel. Visual only until a multiplayer backend exists. */
function HostGamePanel() {
  const [roomActive, setRoomActive] = useState(false);
  const [roomInput, setRoomInput] = useState(() => `https://colonistvase.app/room/${Math.random().toString(36).slice(2, 8)}`);

  const copy = () => {
    if (roomActive) navigator.clipboard?.writeText(roomInput).catch(() => {});
  };

  return (
    <div className="flex-none rounded-2xl bg-card-alt/50 p-3 ring-1 ring-black/5 dark:ring-white/10">
      <Label>Host Game</Label>
      <div className="flex gap-2">
        <input
          value={roomInput}
          onChange={(event) => setRoomInput(event.target.value)}
          onDoubleClick={copy}
          readOnly={roomActive}
          title={roomActive ? 'Double-click to copy' : ''}
          placeholder="Room code…"
          className="min-w-0 flex-1 rounded-lg bg-card px-2.5 py-2 text-xs text-ink outline-none ring-1 ring-black/5 focus-visible:ring-p-green dark:ring-white/10"
        />
        <button
          type="button"
          onClick={() => setRoomActive((active) => !active)}
          className={`flex-none rounded-lg px-3.5 text-xs font-extrabold text-white transition hover:brightness-105 ${roomActive ? 'bg-p-red' : 'bg-p-green'}`}
        >
          {roomActive ? 'Leave' : 'Create'}
        </button>
      </div>
      {roomActive && <p className="mt-1.5 text-[10px] font-semibold text-ink-soft">Double-click the link to copy it.</p>}
    </div>
  );
}

function PlayerSlots({ slots, onChange, colors, onColorsChange, difficulties, onDifficultiesChange, playerCount }: { slots: boolean[]; onChange: (slots: boolean[]) => void; colors: PlayerColor[]; onColorsChange: (colors: PlayerColor[]) => void; difficulties: BotDifficulty[]; onDifficultiesChange: (values: BotDifficulty[]) => void; playerCount: number }) {
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
  const dropdown = (slot: number, onDark: boolean) => (
    <ColorDropdown color={colors[slot]} open={openColor === slot} onToggle={() => setOpenColor(openColor === slot ? null : slot)} onChoose={(color) => chooseColor(slot, color)} onDark={onDark} />
  );
  return (
    <div className="flex h-auto min-h-0 flex-col rounded-2xl bg-card-alt/50 p-3 ring-1 ring-black/5 dark:ring-white/10 min-[850px]:h-full min-[850px]:flex-1">
      <Label>Players · {playerCount}/4</Label>
      <div className="flex flex-col gap-2 min-[850px]:min-h-0 min-[850px]:flex-1">
        <Seat>
          <div className="flex items-center gap-2">
            <Avatar color={colors[0]} isBot={false} />
            <span className="font-display text-sm font-extrabold">You</span>
            <div className="ml-auto">{dropdown(0, true)}</div>
          </div>
        </Seat>
        {slots.map((filled, index) => filled ? (
          <Seat key={BOT_NAMES[index]} bot>
            <div className="flex items-center gap-2">
              <Avatar color={colors[index + 1]} isBot />
              <span className="truncate font-display text-sm font-extrabold">{BOT_NAMES[index]}</span>
              <button type="button" onClick={() => toggle(index)} title={`Remove ${BOT_NAMES[index]}`} className="ml-auto rounded-md px-1.5 py-1 text-xs text-ink-faint transition hover:bg-p-red hover:text-white">×</button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <DifficultySelect value={difficulties[index]} label={`${BOT_NAMES[index]} difficulty`} onChange={(value) => onDifficultiesChange(difficulties.map((current, i) => i === index ? value : current))} />
              {dropdown(index + 1, false)}
            </div>
          </Seat>
        ) : (
          <button key={BOT_NAMES[index]} type="button" onClick={() => toggle(index)} title="Add bot" className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-faint/40 bg-card/40 px-3 text-sm font-bold text-ink-faint transition hover:border-p-green hover:bg-card hover:text-p-green active:scale-[0.98]">
            <span className="text-xl">+</span><span>Add bot</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A filled player seat that stretches to share the column's vertical space. */
function Seat({ bot = false, children }: { bot?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-[48px] flex-1 flex-col justify-center rounded-xl px-2.5 py-1.5 ${bot ? 'bg-card text-ink shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'bg-ink text-card shadow-soft'}`}>
      {children}
    </div>
  );
}

/** Player avatar: the color background frame with the player/bot icon, as in-game. */
function Avatar({ color, isBot }: { color: PlayerColor; isBot: boolean }) {
  return (
    <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center">
      <PlayerColorBackground color={color} className="absolute inset-0 h-full w-full" />
      <PlayerIcon isBot={isBot} className="relative z-10 h-4 w-4" />
    </span>
  );
}

/**
 * Shared plumbing for the seat dropdowns: closes on outside pointer-down and
 * positions the menu with `position: fixed` (rendered via portal) so the
 * panel's overflow clipping can't hide it. Flips above the trigger when there
 * is no room below, and follows the trigger on scroll/resize.
 */
function useDropdown(open: boolean, onClose: () => void, align: 'left' | 'right') {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const anchored = align === 'left' ? rect.left : rect.right - menu.offsetWidth;
      const left = Math.max(8, Math.min(anchored, window.innerWidth - menu.offsetWidth - 8));
      let top = rect.bottom + 6;
      if (top + menu.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - menu.offsetHeight - 6);
      setPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    visibility: pos ? 'visible' : 'hidden',
  };
  return { triggerRef, menuRef, menuStyle };
}

const DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard'];

function DifficultySelect({ value, label, onChange }: { value: BotDifficulty; label: string; onChange: (value: BotDifficulty) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, menuRef, menuStyle } = useDropdown(open, close, 'left');

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1 text-[11px] font-extrabold capitalize text-ink transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
      >
        {value}
        <span className={`text-[9px] leading-none text-ink-soft ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && createPortal(
        <div ref={menuRef} role="listbox" style={menuStyle} className="z-50 w-28 overflow-hidden rounded-xl bg-card p-1 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15">
          {DIFFICULTIES.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => { onChange(option); setOpen(false); }}
              className={`block w-full rounded-lg px-2 py-1 text-left text-[11px] font-extrabold capitalize transition hover:bg-card-alt ${option === value ? 'bg-card-alt text-ink ring-1 ring-p-green' : 'text-ink-soft'}`}
            >
              {option}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Dropdown whose trigger and options are the piece icons in each color. */
function ColorDropdown({ color, open, onToggle, onChoose, onDark = false }: { color: PlayerColor; open: boolean; onToggle: () => void; onChoose: (color: PlayerColor) => void; onDark?: boolean }) {
  const { triggerRef, menuRef, menuStyle } = useDropdown(open, onToggle, 'right');

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-label={`Piece color: ${formatColor(color)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Piece color: ${formatColor(color)}`}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 transition ${onDark ? 'bg-white/15 hover:bg-white/25' : 'bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20'}`}
      >
        <PiecePreview color={color} size="h-7 w-7" />
        <span className={`text-[9px] leading-none ${open ? 'rotate-180' : ''} ${onDark ? 'text-card/70' : 'text-ink-soft'}`}>▾</span>
      </button>
      {open && createPortal(
        <div ref={menuRef} role="listbox" style={menuStyle} className="z-50 grid max-h-56 w-56 grid-cols-3 gap-1 overflow-y-auto rounded-xl bg-card p-1.5 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15">
          {PLAYER_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === color}
              onClick={() => onChoose(option)}
              aria-label={`Choose ${formatColor(option)}`}
              title={formatColor(option)}
              className={`flex items-center justify-center overflow-hidden rounded-lg p-1 transition hover:bg-card-alt ${option === color ? 'bg-card-alt ring-1 ring-p-green' : ''}`}
            >
              <PiecePreview color={option} size="h-5 w-5" />
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function MatchSummary({ modeIcon, modeLabel, boardIcon, boardLabel, victoryPoints, colors }: { modeIcon: string; modeLabel: string; boardIcon: string; boardLabel: string; victoryPoints: number; colors: PlayerColor[] }) {
  return (
    <div className="flex-none rounded-2xl bg-card-alt/50 p-3 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <Label>Match Summary</Label>
      <div className="flex flex-col gap-1.5 text-sm">
        <SummaryRow label="Mode"><span className="font-extrabold">{modeIcon} {modeLabel}</span></SummaryRow>
        <SummaryRow label="Board"><span className="font-extrabold">{boardIcon} {boardLabel}</span></SummaryRow>
        <SummaryRow label="Victory target"><span className="font-extrabold">{victoryPoints} pts</span></SummaryRow>
        <SummaryRow label="Players">
          <span className="flex gap-1">
            {colors.map((color, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15" style={{ background: PLAYER_CSS[color] }} />
            ))}
          </span>
        </SummaryRow>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

function formatColor(color: PlayerColor): string {
  return color === 'mysticblue' ? 'mystic blue' : color;
}

function PiecePreview({ color, size = 'h-5 w-5' }: { color: PlayerColor; size?: string }) {
  return (
    <span className="flex items-end">
      <PackedSprite name={roadFrame(color)} alt="Road" className={size} />
      <PackedSprite name={settlementFrame(color)} alt="Settlement" className={`${size} -ml-1`} />
      <PackedSprite name={cityFrame(color)} alt="City" className={`${size} -ml-1`} />
    </span>
  );
}

function RangeSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint"><span>{label}</span><span className="text-ink">{value}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-p-green" />
    </label>
  );
}

const TURN_TIMER_OPTIONS = [15, 30, 60] as const;

function TurnTimerSetting({ value, onChange }: { value: 15 | 30 | 60; onChange: (seconds: 15 | 30 | 60) => void }) {
  const index = TURN_TIMER_OPTIONS.indexOf(value);
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint"><span>Turn timer</span><span className="text-ink">{value}s</span></span>
      <input type="range" min={0} max={TURN_TIMER_OPTIONS.length - 1} step={1} value={index} onChange={(event) => onChange(TURN_TIMER_OPTIONS[Number(event.target.value)])} className="w-full accent-p-green" />
    </label>
  );
}

function RuleToggle({ icon, label, description, checked, onChange }: { icon: string; label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-center ring-1 transition ${checked ? 'bg-ink text-card ring-ink' : 'bg-card-alt text-ink ring-black/5 dark:ring-white/10'}`}>
      <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${checked ? 'bg-p-green' : 'bg-ink-faint/40'}`} />
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-extrabold leading-tight">{label}</span>
      <span className={`text-[9px] font-semibold leading-tight ${checked ? 'text-card/70' : 'text-ink-soft'}`}>{description}</span>
    </button>
  );
}

const BOT_NAMES = ['Ada', 'Bram', 'Cleo'];

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{children}</div>;
}

function ModeInfoButton({ mode }: { mode: GameModeId }) {
  const [open, setOpen] = useState(false);
  const info = GAME_MODES[mode];
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`About ${info.label} mode`}
        aria-label={`About ${info.label} mode`}
        className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-card-alt text-[11px] font-extrabold text-ink-soft shadow-sm ring-1 ring-black/10 transition hover:bg-ink hover:text-card dark:ring-white/15"
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="mode-info-title"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              className="w-full max-w-sm rounded-2xl bg-card p-5 text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/15"
            >
              <h2 id="mode-info-title" className="flex items-center gap-2 font-display text-xl font-extrabold">
                <span className="text-2xl">{info.icon}</span>{info.label}
              </h2>
              <p className="mt-2 text-sm leading-snug text-ink-soft">{info.description}</p>
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-card-alt px-4 py-2 text-sm font-bold text-ink transition hover:bg-ink/10">Got it</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function OptionCard({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition-all duration-200 ease-smooth ${
        active ? 'bg-ink text-card shadow-soft ring-2 ring-p-green' : 'bg-card-alt text-ink-soft ring-1 ring-black/5 dark:ring-white/10'
      } ${onClick ? 'active:scale-[0.97] hover:-translate-y-0.5 hover:text-ink' : 'cursor-default'}`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-bold">{label}</span>
    </button>
  );
}
