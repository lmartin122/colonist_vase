import { Navigate, Route, Routes } from 'react-router-dom';
import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { ThemeToggle } from './ui/ThemeToggle';
import { Home } from './ui/Home';
import { Lobby } from './ui/online/Lobby';
import { Room } from './ui/online/Room';
import { Profile } from './ui/online/Profile';
import { OnlineGate } from './ui/online/OnlineGate';
import { WaitingForGame } from './ui/online/WaitingForGame';
import { useGame } from './state/store';

/** The in-game view, shared by local and online play. */
function GameShell() {
  return (
    <>
      <GameCanvas />
      <Hud />
    </>
  );
}

function LocalPlay() {
  const game = useGame((s) => s.game);
  return game ? <GameShell /> : <StartScreen />;
}

function OnlineGame() {
  const game = useGame((s) => s.game);
  return <OnlineGate>{game ? <GameShell /> : <WaitingForGame />}</OnlineGate>;
}

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/local" element={<LocalPlay />} />
        <Route path="/lobby" element={<OnlineGate><Lobby /></OnlineGate>} />
        <Route path="/room/:code" element={<OnlineGate><Room /></OnlineGate>} />
        <Route path="/game" element={<OnlineGame />} />
        <Route path="/profile" element={<OnlineGate><Profile /></OnlineGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ThemeToggle />
    </div>
  );
}
