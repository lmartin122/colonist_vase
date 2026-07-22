import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useParams } from 'react-router-dom';
import { cityFrame, roadFrame, settlementFrame } from '../assets';
import { DEFAULT_RULES, GAME_MODES, MAX_VICTORY_POINTS, PLAYER_COLORS } from '@colonist/shared';
import type {
  BotDifficulty,
  GameModeId,
  GameRules,
  PlayerColor,
  RoomSnapshot,
} from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { loadGameSetup, saveGameSetup } from '../state/preferences';
import { PackedSprite } from './PackedSprite';
import { PlayerColorBackground, PlayerIcon } from './PlayerDecorations';
import { ChatPanel } from './ChatPanel';
import { ProfileModal } from './ProfileModal';
import { UsernameDialog } from './UsernameDialog';
import { useProfile } from '../auth/useProfile';
import { AUTH_CONFIGURED, DEV_LOGIN } from '../auth/config';
import { useDevAuth } from '../auth/devIdentity';
import {
  addBot,
  createRoom,
  joinRoom,
  leaveRoom,
  removeSeat,
  setBotDifficulty,
  setReady,
  setSeatColor,
  startGame,
  updateRoom,
} from '../net/socket';
import { normalizeRoomCode } from '../net/roomCode';
import { useOnline, type ConnStatus } from '../state/online';

const BOARD_META: Record<'random' | 'classic', { icon: string; label: string }> = {
  random: { icon: '🎲', label: 'Random' },
  classic: { icon: '📜', label: 'Classic' },
};

interface StartAccount {
  ready: boolean;
  sub: string;
  name: string;
  status: ConnStatus;
  login: () => void;
  logout: () => void;
  getToken?: () => Promise<string>;
  /** Chosen display name; null in local-dev mode, where the name IS the login. */
  username?: string | null;
  /** Resolves with an error message, or null on success. */
  saveUsername?: (username: string) => Promise<string | null>;
}

/** Unified landing screen account adapter for local dev-login. */
function DevStartScreen() {
  const { id, name, setName, clear } = useDevAuth();
  const connect = useOnline((state) => state.connect);
  const disconnect = useOnline((state) => state.disconnect);
  const status = useOnline((state) => state.status);
  const [loginOpen, setLoginOpen] = useState(false);
  const getToken = useCallback(async () => `${id}:${name ?? 'Player'}`, [id, name]);

  useEffect(() => {
    if (name) connect(`${id}:${name}`, name);
  }, [connect, id, name]);

  return (
    <>
      <StartScreenContent
        account={{
          ready: Boolean(name),
          sub: `dev|${id}`,
          name: name ?? 'Player',
          status,
          login: () => setLoginOpen(true),
          logout: () => {
            disconnect();
            clear();
          },
          getToken,
        }}
      />
      <DevLoginDialog
        open={loginOpen && !name}
        onClose={() => setLoginOpen(false)}
        onLogin={(nextName) => {
          setName(nextName);
          setLoginOpen(false);
        }}
      />
    </>
  );
}

/** Unified landing screen account adapter for Auth0 deployments. */
function AuthStartScreen() {
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } =
    useAuth0();
  const connect = useOnline((state) => state.connect);
  const disconnect = useOnline((state) => state.disconnect);
  const status = useOnline((state) => state.status);
  const getToken = isAuthenticated ? getAccessTokenSilently : undefined;
  const { profile, error: profileError, needsUsername, saveUsername } = useProfile(getToken);
  const username = profile?.username ?? null;
  // If the profile can't be loaded the server is down, so online play is out
  // anyway — fall back to the Auth0 name rather than leaving a dead screen.
  const accountReady = isAuthenticated && !isLoading && (Boolean(username) || Boolean(profileError));

  useEffect(() => {
    // Wait for the username: the seat name comes from the server, and connecting
    // first would seat this player under their Auth0 name (an email) until they
    // reconnect.
    if (!isAuthenticated || !username) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => {
        if (!cancelled) connect(token, username);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connect, getAccessTokenSilently, isAuthenticated, username]);

  return (
    <>
      <StartScreenContent
        account={{
          ready: accountReady,
          sub: user?.sub ?? '',
          name: username ?? user?.name ?? 'Player',
          status,
          login: () => {
            void loginWithRedirect();
          },
          logout: () => {
            disconnect();
            logout({ logoutParams: { returnTo: window.location.origin } });
          },
          getToken: getAccessTokenSilently,
          username,
          saveUsername,
        }}
      />
      <UsernameDialog
        open={needsUsername}
        current={null}
        dismissable={false}
        onClose={() => {}}
        onSave={saveUsername}
      />
    </>
  );
}

function OfflineStartScreen() {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return (
    <>
      <StartScreenContent
        account={{
          ready: false,
          sub: '',
          name: 'Player',
          status: 'disconnected',
          login: () => setNoticeOpen(true),
          logout: () => {},
        }}
      />
      <NoticeDialog
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title="Online play is not configured"
      >
        Add the Auth0 client variables or enable the local development login to create and join
        rooms.
      </NoticeDialog>
    </>
  );
}

export const StartScreen = DEV_LOGIN
  ? DevStartScreen
  : AUTH_CONFIGURED
    ? AuthStartScreen
    : OfflineStartScreen;

/** Landing screen: configure either a local bot match or an online room. */
function StartScreenContent({ account }: { account: StartAccount }) {
  const navigate = useNavigate();
  const { code: routeCode } = useParams<{ code: string }>();
  const newGame = useGame((s) => s.newGame);
  const setCode = useOnline((state) => state.setCode);
  const setOnlineSeat = useOnline((state) => state.setSeat);
  const onlineRoom = useOnline((state) => state.room);
  const lastOnlineCode = useOnline((state) => state.lastCode);
  const acknowledgedOnlineSeat = useOnline((state) => state.seat);
  const serverError = useOnline((state) => state.error);
  const clearServerError = useOnline((state) => state.clearError);
  const [savedSetup] = useState(loadGameSetup);
  const [botSlots, setBotSlots] = useState(savedSetup?.botSlots ?? [false, false, false]);
  const [botDifficulties, setBotDifficulties] = useState<BotDifficulty[]>(
    savedSetup?.botDifficulties ?? ['medium', 'medium', 'medium'],
  );
  const [playerColors, setPlayerColors] = useState<PlayerColor[]>(
    savedSetup?.playerColors ?? [...PLAYER_COLORS],
  );
  const [layout, setLayout] = useState<'random' | 'classic'>(savedSetup?.layout ?? 'random');
  const [rules, setRules] = useState<GameRules>({ ...DEFAULT_RULES, ...savedSetup?.rules });
  const [profileOpen, setProfileOpen] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const attemptedRouteCode = useRef<string | null>(null);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const hasBot = botSlots.some(Boolean);
  const playerCount = 1 + botSlots.filter(Boolean).length;
  const effectiveOnlineSeat = onlineRoom?.yourSeat ?? acknowledgedOnlineSeat;
  const myOnlineSeat =
    onlineRoom?.seats.find((seat) => seat.seat === effectiveOnlineSeat) ??
    onlineRoom?.seats.find((seat) => seat.userId === account.sub) ??
    onlineRoom?.seats.find((seat) => !seat.isBot && seat.name === account.name);
  const isOnlineHost = myOnlineSeat?.isHost ?? false;
  const onlineReadyCount =
    onlineRoom?.seats.filter(
      (seat) => seat.isBot || (seat.connected && (seat.isHost || seat.ready)),
    ).length ?? 0;
  const onlinePlayerCount = onlineRoom?.seats.length ?? 0;
  const everyoneOnlineReady = onlinePlayerCount >= 2 && onlineReadyCount === onlinePlayerCount;

  useEffect(
    () => saveGameSetup({ botSlots, botDifficulties, playerColors, layout, rules }),
    [botSlots, botDifficulties, playerColors, layout, rules],
  );

  const start = () => {
    const players = [
      { name: 'You', isBot: false, color: playerColors[0] },
      ...BOT_NAMES.flatMap((name, index) =>
        botSlots[index]
          ? [
              {
                name,
                isBot: true,
                color: playerColors[index + 1],
                botDifficulty: botDifficulties[index],
              },
            ]
          : [],
      ),
    ];
    newGame({ players, layout, rules });
  };

  const performOnlineAction = useCallback(
    async (action: { type: 'create' } | { type: 'join'; code: string }) => {
      setOnlineBusy(true);
      setOnlineError(null);
      clearServerError();
      if (action.type === 'join') {
        const result = await joinRoom(action.code);
        setOnlineBusy(false);
        if (!result.ok) {
          setCode(null);
          setOnlineError(result.error);
          navigate('/', { replace: true });
          return;
      }
      setCode(result.data.code);
      setOnlineSeat(result.data.seat);
      navigate(result.data.phase === 'lobby' ? `/room/${result.data.code}` : `/game/${result.data.code}`);
      return;
      }

      const result = await createRoom({ rules, layout });
      if (!result.ok) {
        setOnlineBusy(false);
        setOnlineError(result.error);
        return;
      }
      setCode(result.data.code);
      setOnlineSeat(result.data.seat);
      for (let index = 0; index < botSlots.length; index++) {
        if (!botSlots[index]) continue;
        const botResult = await addBot(botDifficulties[index]);
        if (!botResult.ok) {
          setOnlineError(botResult.error);
          break;
        }
      }
      setOnlineBusy(false);
      navigate(`/room/${result.data.code}`);
    },
    [botDifficulties, botSlots, clearServerError, layout, navigate, rules, setCode, setOnlineSeat],
  );

  const requestOnlineAction = useCallback(
    (action: { type: 'create' } | { type: 'join'; code: string }) => {
      if (!account.ready || account.status !== 'connected') return;
      void performOnlineAction(action);
    },
    [account, performOnlineAction],
  );

  useEffect(() => {
    const code = routeCode ? normalizeRoomCode(routeCode) : '';
    if (
      !code ||
      !account.ready ||
      account.status !== 'connected' ||
      onlineRoom?.code === code ||
      attemptedRouteCode.current === code
    )
      return;
    attemptedRouteCode.current = code;
    void performOnlineAction({ type: 'join', code });
  }, [account.ready, account.status, onlineRoom?.code, performOnlineAction, routeCode]);

  useEffect(() => {
    if (!onlineRoom) return;
    setRules(onlineRoom.rules);
    if (onlineRoom.layout === 'random' || onlineRoom.layout === 'classic')
      setLayout(onlineRoom.layout);
    if (onlineRoom.phase === 'playing') navigate(`/game/${onlineRoom.code}`);
  }, [navigate, onlineRoom]);

  const leaveOnlineRoom = useCallback(async () => {
    setOnlineBusy(true);
    setOnlineError(null);
    clearServerError();
    // Leaving should feel immediate even if the acknowledgement is delayed or
    // lost. setCode(null) retains the last code as an explicit rejoin target.
    setCode(null);
    attemptedRouteCode.current = null;
    navigate('/', { replace: true });
    const result = await leaveRoom();
    setOnlineBusy(false);
    if (!result.ok) setOnlineError(result.error);
  }, [clearServerError, navigate, setCode]);

  const runRoomAction = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>) => {
      setOnlineBusy(true);
      setOnlineError(null);
      clearServerError();
      const result = await action();
      setOnlineBusy(false);
      if (!result.ok) setOnlineError(result.error ?? 'Online room action failed');
    },
    [clearServerError],
  );

  const changeRules = useCallback(
    (nextRules: GameRules) => {
      setRules(nextRules);
      if (onlineRoom && isOnlineHost) void runRoomAction(() => updateRoom({ rules: nextRules }));
    },
    [isOnlineHost, onlineRoom, runRoomAction],
  );

  const changeLayout = useCallback(
    (nextLayout: 'random' | 'classic') => {
      setLayout(nextLayout);
      if (onlineRoom && isOnlineHost) void runRoomAction(() => updateRoom({ layout: nextLayout }));
    },
    [isOnlineHost, onlineRoom, runRoomAction],
  );

  // Active player colors, in seat order, for the summary dots.
  const activeColors = onlineRoom?.seats.map((seat) => seat.color) ?? [
    playerColors[0],
    ...botSlots.flatMap((filled, index) => (filled ? [playerColors[index + 1]] : [])),
  ];

  return (
    <div
      className="flex h-full w-full items-center justify-center p-4 font-sans sm:p-6"
      style={{
        background: 'radial-gradient(circle at 50% -10%, #2a6485 0%, #163b52 55%, #0d2536 100%)',
      }}
    >
      <motion.div
        data-start-screen-card
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-full max-h-[calc(100vh-2rem)] w-full max-w-[1320px] flex-col overflow-y-auto rounded-2xl bg-card px-5 py-4 text-ink shadow-pop ring-1 ring-black/5 sm:max-h-[calc(100vh-3rem)] sm:px-7 sm:py-4 min-[850px]:h-[70vh] min-[850px]:max-h-[640px] min-[850px]:overflow-hidden dark:ring-white/15"
      >
        <button
          type="button"
          onClick={() => (account.ready ? setProfileOpen(true) : account.login())}
          aria-label={account.ready ? 'Open your profile' : 'Log in'}
          title={account.ready ? account.name : 'Log in'}
          className="absolute right-4 top-4 z-10 flex min-h-11 items-center gap-2 rounded-xl bg-card-alt px-3 text-ink shadow-soft ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green dark:ring-white/15"
        >
          <PlayerIcon isBot={false} className="h-7 w-7" />
          <span className="hidden max-w-28 truncate text-xs font-extrabold sm:block">
            {account.ready ? account.name : 'Log in'}
          </span>
        </button>
        <div data-start-screen-logo className="text-center text-3xl leading-none">
          🏝️
        </div>
        <h1 className="mt-1.5 text-center font-display text-xl font-extrabold tracking-tight">
          Colonist Vase
        </h1>
        <p data-start-screen-subtitle className="mb-3 mt-0.5 text-center text-sm text-ink-soft">
          Build, trade and settle your way to victory.
        </p>

        <div className="grid flex-none grid-cols-1 gap-4 min-[850px]:min-h-0 min-[850px]:flex-1 min-[850px]:grid-cols-[240px_minmax(0,1fr)_270px] min-[850px]:gap-3 min-[850px]:overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)_300px] lg:gap-4">
          {/* LEFT — host + players */}
          <div className="flex min-h-0 flex-col gap-3">
            <HostGamePanel
              accountReady={account.ready}
              connectionStatus={account.status}
              busy={onlineBusy}
              error={onlineError ?? serverError}
              roomCode={onlineRoom?.code ?? null}
              rejoinCode={onlineRoom ? null : lastOnlineCode}
              onLeave={() => {
                void leaveOnlineRoom();
              }}
              onCreate={() => requestOnlineAction({ type: 'create' })}
              onJoin={(code) => requestOnlineAction({ type: 'join', code })}
            />
            {onlineRoom ? (
              <OnlinePlayerSlots
                room={onlineRoom}
                mySeat={myOnlineSeat?.seat ?? effectiveOnlineSeat}
                myUserId={account.sub}
                myName={account.name}
                isHost={isOnlineHost}
                busy={onlineBusy}
                onAction={runRoomAction}
              />
            ) : (
              <PlayerSlots
                slots={botSlots}
                onChange={setBotSlots}
                colors={playerColors}
                onColorsChange={setPlayerColors}
                difficulties={botDifficulties}
                onDifficultiesChange={setBotDifficulties}
                playerCount={playerCount}
              />
            )}
          </div>

          {/* MIDDLE — setup */}
          <div
            className={`min-h-0 overflow-y-auto rounded-2xl bg-card-alt/30 p-3 ring-1 ring-black/5 sm:p-4 dark:ring-white/10 ${onlineRoom && !isOnlineHost ? 'pointer-events-none opacity-75' : ''}`}
          >
            <Label>Game Mode</Label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {Object.values(GAME_MODES).map((mode) => (
                <div key={mode.id} className="relative">
                  <OptionCard
                    icon={mode.icon}
                    label={mode.label}
                    active={rules.mode === mode.id}
                    onClick={() => changeRules({ ...rules, mode: mode.id })}
                  />
                  <ModeInfoButton mode={mode.id} />
                </div>
              ))}
            </div>

            <Label>Board</Label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(['random', 'classic'] as const).map((id) => (
                <OptionCard
                  key={id}
                  icon={BOARD_META[id].icon}
                  label={BOARD_META[id].label}
                  active={layout === id}
                  onClick={() => changeLayout(id)}
                />
              ))}
            </div>

            <Label>Rules</Label>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <RuleToggle
                icon="🃏"
                label="Hide Bank"
                description="Hide card counts"
                checked={rules.hideBankCards}
                onChange={(hideBankCards) => changeRules({ ...rules, hideBankCards })}
              />
              <RuleToggle
                icon="🛡️"
                label="Friendly Robber"
                description="Protects low VP"
                checked={rules.friendlyRobber}
                onChange={(friendlyRobber) => changeRules({ ...rules, friendlyRobber })}
              />
              <RuleToggle
                icon="🔁"
                label="Player Trading"
                description="Trade with others"
                checked={rules.allowPlayerTrades}
                onChange={(allowPlayerTrades) => changeRules({ ...rules, allowPlayerTrades })}
              />
            </div>

            <Label>Advanced Configuration</Label>
            <div className="grid gap-4 sm:grid-cols-3">
              <TurnTimerSetting
                value={rules.turnTimer}
                onChange={(turnTimer) => changeRules({ ...rules, turnTimer })}
              />
              <RangeSetting
                label="Points to win"
                value={rules.victoryPoints}
                min={3}
                max={MAX_VICTORY_POINTS}
                onChange={(victoryPoints) => changeRules({ ...rules, victoryPoints })}
              />
              <RangeSetting
                label="Discard limit"
                value={rules.discardLimit}
                min={5}
                max={20}
                onChange={(discardLimit) => changeRules({ ...rules, discardLimit })}
              />
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
              onClick={() => {
                if (!onlineRoom) return start();
                if (isOnlineHost) void runRoomAction(startGame);
                else void runRoomAction(() => setReady(!(myOnlineSeat?.ready ?? false)));
              }}
              disabled={onlineBusy || (onlineRoom ? isOnlineHost && !everyoneOnlineReady : !hasBot)}
              className="block min-h-11 w-full flex-none rounded-2xl bg-p-green px-4 py-3 font-display text-lg font-extrabold text-white shadow-soft transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-p-green active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-card-alt disabled:text-ink-faint disabled:shadow-none"
            >
              {onlineRoom
                ? isOnlineHost
                  ? onlineRoom.seats.length >= 2
                    ? `Start Online Game · ${onlineReadyCount}/${onlinePlayerCount} Ready`
                    : 'Waiting for players'
                  : myOnlineSeat?.ready
                    ? 'Not Ready'
                    : 'Ready'
                : hasBot
                  ? `Start Game · ${playerCount} Players`
                  : 'Add at least one bot'}
            </button>
          </div>
        </div>
      </motion.div>
      <ProfileModal
        open={profileOpen}
        onClose={closeProfile}
        accountName={account.name}
        username={account.username}
        onSaveUsername={account.saveUsername}
        getOnlineToken={account.getToken}
        onLogout={() => {
          setProfileOpen(false);
          account.logout();
        }}
      />
    </div>
  );
}

/** Real online room controls, sharing the setup configured on this screen. */
function HostGamePanel({
  accountReady,
  connectionStatus,
  busy,
  error,
  roomCode,
  rejoinCode,
  onCreate,
  onJoin,
  onLeave,
}: {
  accountReady: boolean;
  connectionStatus: ConnStatus;
  busy: boolean;
  error: string | null;
  roomCode: string | null;
  rejoinCode: string | null;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
}) {
  const [roomInput, setRoomInput] = useState('');
  const [copied, setCopied] = useState(false);
  const code = normalizeRoomCode(roomInput);
  const connecting = accountReady && connectionStatus !== 'connected';
  const notice = error
    ? { key: 'server-error', label: 'Server', message: error, tone: 'error' as const }
    : copied
      ? {
          key: 'room-copied',
          label: 'Room',
          message: 'Invitation copied to clipboard',
          tone: 'success' as const,
        }
      : null;

  useEffect(() => {
    setRoomInput(roomCode ?? '');
    setCopied(false);
  }, [roomCode]);

  const copyRoomLink = () => {
    if (!roomCode) return;
    void navigator.clipboard?.writeText(`${window.location.origin}/room/${roomCode}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="flex-none rounded-2xl bg-card-alt/50 p-3 ring-1 ring-black/5 dark:ring-white/10">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-faint">
          Online Game
        </div>
        <p className="text-right text-[9px] font-semibold leading-tight text-ink-faint">
          Enter a code to join a lobby, or leave it blank to create one.
        </p>
      </div>
      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            key={notice.key}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${notice.tone === 'error' ? 'bg-p-red/10 text-p-red ring-p-red/30' : 'bg-p-green/10 text-p-green ring-p-green/30'}`}
          >
            <span
              className={`mt-px rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white ${notice.tone === 'error' ? 'bg-p-red' : 'bg-p-green'}`}
            >
              {notice.label}
            </span>
            <span className="min-w-0 leading-snug">{notice.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <input
          value={roomInput}
          readOnly={Boolean(roomCode)}
          onClick={copyRoomLink}
          onChange={(event) => setRoomInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !busy && !connecting && !roomCode)
              code ? onJoin(code) : onCreate();
          }}
          disabled={!accountReady || connectionStatus !== 'connected'}
          placeholder="Room code"
          aria-label="Room code or invitation link"
          title={roomCode ? 'Click to copy the invitation link' : undefined}
          className={`min-w-0 flex-1 rounded-lg bg-card px-2.5 py-2 text-xs font-bold text-ink outline-none ring-1 ring-black/5 focus-visible:ring-p-green disabled:cursor-not-allowed disabled:opacity-50 dark:ring-white/10 ${roomCode ? 'cursor-copy' : ''}`}
        />
        <button
          type="button"
          onClick={() => (roomCode ? onLeave() : code ? onJoin(code) : onCreate())}
          disabled={!accountReady || connecting || busy}
          className={`flex-none rounded-lg px-3.5 text-xs font-extrabold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${roomCode ? 'bg-p-red' : 'bg-p-blue'}`}
        >
          {roomCode
            ? 'Leave'
            : connecting
              ? 'Connecting…'
              : busy
                ? code
                  ? 'Joining…'
                  : 'Creating…'
                : code
                  ? 'Join'
                  : 'Create'}
        </button>
      </div>
      {!roomCode && rejoinCode && (
        <button
          type="button"
          onClick={() => onJoin(rejoinCode)}
          disabled={!accountReady || connecting || busy}
          className="mt-2 w-full rounded-lg bg-ink/10 px-3 py-2 text-xs font-extrabold text-ink transition hover:bg-ink/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Rejoin game {rejoinCode}
        </button>
      )}
    </div>
  );
}

function OnlinePlayerSlots({
  room,
  mySeat,
  myUserId,
  myName,
  isHost,
  busy,
  onAction,
}: {
  room: RoomSnapshot;
  mySeat: number | null;
  myUserId: string;
  myName: string;
  isHost: boolean;
  busy: boolean;
  onAction: (action: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [openColor, setOpenColor] = useState<number | null>(null);
  const emptySeats = Math.max(0, room.maxPlayers - room.seats.length);
  const isMySeat = (seat: RoomSnapshot['seats'][number]) =>
    seat.seat === mySeat || seat.userId === myUserId || (!seat.isBot && seat.name === myName);

  const colorDropdown = (seat: number, color: PlayerColor, onDark: boolean) => (
    <ColorDropdown
      color={color}
      open={openColor === seat}
      onToggle={() => setOpenColor(openColor === seat ? null : seat)}
      onChoose={(nextColor) => {
        setOpenColor(null);
        void onAction(() => setSeatColor(seat, nextColor));
      }}
      onDark={onDark}
      disabledColors={room.seats.filter((other) => other.seat !== seat).map((other) => other.color)}
    />
  );

  return (
    <div className="flex h-auto min-h-0 flex-col rounded-2xl bg-card-alt/50 p-3 ring-1 ring-black/5 dark:ring-white/10 min-[850px]:h-full min-[850px]:flex-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
          Players · {room.seats.length}/{room.maxPlayers}
        </span>
        <SpectatorBadge spectators={room.spectators} />
      </div>
      <div className="flex flex-col gap-2 min-[850px]:min-h-0 min-[850px]:flex-1">
        {room.seats.map((seat) => {
          const isMe = isMySeat(seat);
          return (
            <Seat key={seat.seat} bot={!isMe}>
              <div className="flex items-center gap-2">
                <Avatar color={seat.color} isBot={seat.isBot} />
                <span className="truncate font-display text-sm font-extrabold">
                  {isMe ? 'You' : seat.name}
                </span>
                {seat.isHost && (
                  <span
                    className={`text-[9px] font-bold uppercase ${isMe ? 'text-card/60' : 'text-ink-faint'}`}
                  >
                    Host
                  </span>
                )}
                {isMe && (
                  <div className="ml-auto">{colorDropdown(seat.seat, seat.color, true)}</div>
                )}
                {!isMe && !seat.isBot && (
                  <span
                    className={`absolute bottom-1.5 right-2 text-[9px] font-bold ${seat.connected ? 'text-p-green' : 'text-ink-faint'}`}
                  >
                    {seat.ready ? 'Ready' : 'Waiting'}
                  </span>
                )}
                {isHost && !seat.isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onAction(() => removeSeat(seat.seat));
                    }}
                    title={`Remove ${seat.name}`}
                    className="absolute right-2 top-1.5 rounded-md px-1.5 py-1 text-xs text-ink-faint transition hover:bg-p-red hover:text-white disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </div>
              {seat.isBot && isHost && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <DifficultySelect
                    value={seat.botDifficulty ?? 'medium'}
                    label={`${seat.name} difficulty`}
                    onChange={(difficulty) => {
                      void onAction(() => setBotDifficulty(seat.seat, difficulty));
                    }}
                  />
                  {colorDropdown(seat.seat, seat.color, false)}
                </div>
              )}
              {seat.isBot && !isHost && (
                <span className="mt-1 text-[9px] font-bold capitalize text-ink-faint">
                  {seat.botDifficulty} bot
                </span>
              )}
            </Seat>
          );
        })}
        {Array.from({ length: emptySeats }, (_, index) => (
          <button
            key={`add-online-bot-${index}`}
            type="button"
            disabled={!isHost || busy}
            onClick={() => {
              void onAction(() => addBot('medium'));
            }}
            title={isHost ? 'Add bot' : 'Only the host can add bots'}
            className="flex h-[72px] min-h-[72px] flex-none items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-faint/40 bg-card/40 px-3 text-sm font-bold text-ink-faint transition hover:border-p-green hover:bg-card hover:text-p-green active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-xl">+</span>
            <span>Add bot</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Eye badge showing how many people are watching, names in the tooltip. */
function SpectatorBadge({ spectators }: { spectators: { name: string }[] }) {
  if (!spectators.length) return null;
  const names = spectators.map((viewer) => viewer.name).join(', ');
  return (
    <span
      title={`Watching: ${names}`}
      aria-label={`${spectators.length} watching: ${names}`}
      className="flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-extrabold text-ink-soft"
    >
      <span aria-hidden="true">👁️</span>
      {spectators.length}
    </span>
  );
}

function DevLoginDialog({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <NoticeDialog open={open} onClose={onClose} title="Log in for online play">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onLogin(name.trim());
        }}
        className="mt-4 flex gap-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          className="min-w-0 flex-1 rounded-xl bg-card-alt px-4 py-3 text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-p-blue dark:ring-white/10"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-xl bg-p-blue px-5 font-display font-extrabold text-white shadow-soft hover:brightness-105 disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </NoticeDialog>
  );
}

function NoticeDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/55 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="w-full max-w-md rounded-2xl bg-card p-5 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15"
          >
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-extrabold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-card-alt text-lg font-bold"
              >
                ×
              </button>
            </div>
            <div className="mt-2 text-sm text-ink-soft">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PlayerSlots({
  slots,
  onChange,
  colors,
  onColorsChange,
  difficulties,
  onDifficultiesChange,
  playerCount,
}: {
  slots: boolean[];
  onChange: (slots: boolean[]) => void;
  colors: PlayerColor[];
  onColorsChange: (colors: PlayerColor[]) => void;
  difficulties: BotDifficulty[];
  onDifficultiesChange: (values: BotDifficulty[]) => void;
  playerCount: number;
}) {
  const [openColor, setOpenColor] = useState<number | null>(null);
  const toggle = (index: number) =>
    onChange(slots.map((filled, i) => (i === index ? !filled : filled)));
  const chooseColor = (playerSlot: number, color: PlayerColor) => {
    const activeSlots = [0, ...slots.flatMap((filled, index) => (filled ? [index + 1] : []))];
    const otherSlot = activeSlots.find((slot) => slot !== playerSlot && colors[slot] === color);
    const next = [...colors];
    if (otherSlot !== undefined) next[otherSlot] = colors[playerSlot];
    next[playerSlot] = color;
    onColorsChange(next);
    setOpenColor(null);
  };
  const dropdown = (slot: number, onDark: boolean) => (
    <ColorDropdown
      color={colors[slot]}
      open={openColor === slot}
      onToggle={() => setOpenColor(openColor === slot ? null : slot)}
      onChoose={(color) => chooseColor(slot, color)}
      onDark={onDark}
    />
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
        {slots.map((filled, index) =>
          filled ? (
            <Seat key={BOT_NAMES[index]} bot>
              <div className="flex items-center gap-2">
                <Avatar color={colors[index + 1]} isBot />
                <span className="truncate font-display text-sm font-extrabold">
                  {BOT_NAMES[index]}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  title={`Remove ${BOT_NAMES[index]}`}
                  className="ml-auto rounded-md px-1.5 py-1 text-xs text-ink-faint transition hover:bg-p-red hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <DifficultySelect
                  value={difficulties[index]}
                  label={`${BOT_NAMES[index]} difficulty`}
                  onChange={(value) =>
                    onDifficultiesChange(
                      difficulties.map((current, i) => (i === index ? value : current)),
                    )
                  }
                />
                {dropdown(index + 1, false)}
              </div>
            </Seat>
          ) : (
            <button
              key={BOT_NAMES[index]}
              type="button"
              onClick={() => toggle(index)}
              title="Add bot"
              className="flex h-[72px] min-h-[72px] flex-none items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-faint/40 bg-card/40 px-3 text-sm font-bold text-ink-faint transition hover:border-p-green hover:bg-card hover:text-p-green active:scale-[0.98]"
            >
              <span className="text-xl">+</span>
              <span>Add bot</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** A filled player seat that stretches to share the column's vertical space. */
function Seat({ bot = false, children }: { bot?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`relative flex h-[72px] min-h-[72px] flex-none flex-col justify-center rounded-xl px-2.5 py-1.5 ${bot ? 'bg-card text-ink shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'bg-ink text-card shadow-soft'}`}
    >
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
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        onClose();
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
      if (top + menu.offsetHeight > window.innerHeight - 8)
        top = Math.max(8, rect.top - menu.offsetHeight - 6);
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

function DifficultySelect({
  value,
  label,
  onChange,
}: {
  value: BotDifficulty;
  label: string;
  onChange: (value: BotDifficulty) => void;
}) {
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
        <span className={`text-[9px] leading-none text-ink-soft ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            className="z-50 w-28 overflow-hidden rounded-xl bg-card p-1 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15"
          >
            {DIFFICULTIES.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
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
function ColorDropdown({
  color,
  open,
  onToggle,
  onChoose,
  onDark = false,
  disabledColors = [],
}: {
  color: PlayerColor;
  open: boolean;
  onToggle: () => void;
  onChoose: (color: PlayerColor) => void;
  onDark?: boolean;
  disabledColors?: PlayerColor[];
}) {
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
        <span
          className={`text-[9px] leading-none ${open ? 'rotate-180' : ''} ${onDark ? 'text-card/70' : 'text-ink-soft'}`}
        >
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            className="z-50 grid max-h-56 w-56 grid-cols-3 gap-1 overflow-y-auto rounded-xl bg-card p-1.5 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15"
          >
            {PLAYER_COLORS.map((option) => {
              const disabled = disabledColors.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === color}
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) onChoose(option);
                  }}
                  aria-label={
                    disabled
                      ? `${formatColor(option)} is already in use`
                      : `Choose ${formatColor(option)}`
                  }
                  title={
                    disabled ? `${formatColor(option)} is already in use` : formatColor(option)
                  }
                  className={`flex items-center justify-center overflow-hidden rounded-lg p-1 transition ${disabled ? 'cursor-not-allowed opacity-25' : 'hover:bg-card-alt'} ${option === color ? 'bg-card-alt ring-1 ring-p-green' : ''}`}
                >
                  <PiecePreview color={option} size="h-5 w-5" />
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MatchSummary({
  modeIcon,
  modeLabel,
  boardIcon,
  boardLabel,
  victoryPoints,
  colors,
}: {
  modeIcon: string;
  modeLabel: string;
  boardIcon: string;
  boardLabel: string;
  victoryPoints: number;
  colors: PlayerColor[];
}) {
  return (
    <div className="flex-none rounded-2xl bg-card-alt/50 p-3 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <Label>Match Summary</Label>
      <div className="flex flex-col gap-1.5 text-sm">
        <SummaryRow label="Mode">
          <span className="font-extrabold">
            {modeIcon} {modeLabel}
          </span>
        </SummaryRow>
        <SummaryRow label="Board">
          <span className="font-extrabold">
            {boardIcon} {boardLabel}
          </span>
        </SummaryRow>
        <SummaryRow label="Victory target">
          <span className="font-extrabold">{victoryPoints} pts</span>
        </SummaryRow>
        <SummaryRow label="Players">
          <span className="flex gap-1">
            {colors.map((color, i) => (
              <span
                key={i}
                className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15"
                style={{ background: PLAYER_CSS[color] }}
              />
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

function RangeSetting({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint">
        <span>{label}</span>
        <span className="text-ink">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-p-green"
      />
    </label>
  );
}

const TURN_TIMER_OPTIONS = [15, 30, 60] as const;

function TurnTimerSetting({
  value,
  onChange,
}: {
  value: 15 | 30 | 60;
  onChange: (seconds: 15 | 30 | 60) => void;
}) {
  const index = TURN_TIMER_OPTIONS.indexOf(value);
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wide text-ink-faint">
        <span>Turn timer</span>
        <span className="text-ink">{value}s</span>
      </span>
      <input
        type="range"
        min={0}
        max={TURN_TIMER_OPTIONS.length - 1}
        step={1}
        value={index}
        onChange={(event) => onChange(TURN_TIMER_OPTIONS[Number(event.target.value)])}
        className="w-full accent-p-green"
      />
    </label>
  );
}

function RuleToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-center ring-1 transition ${checked ? 'bg-ink text-card ring-ink' : 'bg-card-alt text-ink ring-black/5 dark:ring-white/10'}`}
    >
      <span
        className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${checked ? 'bg-p-green' : 'bg-ink-faint/40'}`}
      />
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-extrabold leading-tight">{label}</span>
      <span
        className={`text-[9px] font-semibold leading-tight ${checked ? 'text-card/70' : 'text-ink-soft'}`}
      >
        {description}
      </span>
    </button>
  );
}

const BOT_NAMES = ['Ada', 'Bram', 'Cleo'];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{children}</div>
  );
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
              <h2
                id="mode-info-title"
                className="flex items-center gap-2 font-display text-xl font-extrabold"
              >
                <span className="text-2xl">{info.icon}</span>
                {info.label}
              </h2>
              <p className="mt-2 text-sm leading-snug text-ink-soft">{info.description}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-card-alt px-4 py-2 text-sm font-bold text-ink transition hover:bg-ink/10"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function OptionCard({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition-all duration-200 ease-smooth ${
        active
          ? 'bg-ink text-card shadow-soft ring-2 ring-p-green'
          : 'bg-card-alt text-ink-soft ring-1 ring-black/5 dark:ring-white/10'
      } ${onClick ? 'active:scale-[0.97] hover:-translate-y-0.5 hover:text-ink' : 'cursor-default'}`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-bold">{label}</span>
    </button>
  );
}
