import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { ThemeToggle } from './ui/ThemeToggle';
import { OnlineGate } from './ui/online/OnlineGate';
import { WaitingForGame } from './ui/online/WaitingForGame';
import { useGame } from './state/store';
import { useOnline } from './state/online';
import { watchGame } from './net/socket';
import { normalizeRoomCode } from './net/roomCode';

/** The in-game view, shared by local and online play. */
function GameShell() {
  return (
    <>
      <GameCanvas />
      <Hud />
    </>
  );
}

function RootPlay() {
  const game = useGame((s) => s.game);
  return game ? <GameShell /> : <StartScreen />;
}

function OnlineGame() {
  return <OnlineGate><OnlineGameContent /></OnlineGate>;
}

function OnlineGameContent() {
  const { code: routeCode } = useParams<{ code: string }>();
  const code = normalizeRoomCode(routeCode ?? '');
  const navigate = useNavigate();
  const game = useGame((s) => s.game);
  const abandonGame = useGame((s) => s.abandonGame);
  const room = useOnline((s) => s.room);
  const activeCode = useOnline((s) => s.code);
  const setCode = useOnline((s) => s.setCode);
  const setSeat = useOnline((s) => s.setSeat);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (code.length !== 6) {
      navigate('/', { replace: true });
      return;
    }
    if (room?.code === code && room.phase !== 'lobby') return;
    if (attempted.current === code) return;
    attempted.current = code;
    if (activeCode && activeCode !== code) abandonGame();
    void watchGame(code).then((result) => {
      if (!result.ok) {
        setCode(null);
        abandonGame();
        navigate('/', { replace: true });
        return;
      }
      setCode(result.data.code);
      setSeat(result.data.seat);
    });
  }, [abandonGame, activeCode, code, navigate, room, setCode, setSeat]);

  const ready = game && activeCode === code && room?.code === code && room.phase !== 'lobby';
  return ready ? <GameShell /> : <WaitingForGame code={code} />;
}

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Routes>
        <Route path="/" element={<RootPlay />} />
        <Route path="/local" element={<Navigate to="/" replace />} />
        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="/room/:code" element={<RootPlay />} />
        <Route path="/game" element={<Navigate to="/" replace />} />
        <Route path="/game/:code" element={<OnlineGame />} />
        <Route path="/profile" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ThemeToggle />
    </div>
  );
}
