import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { useGame } from './state/store';

export default function App() {
  const started = useGame((s) => s.game !== null);
  return (
    <div className="relative h-full w-full overflow-hidden">
      {started ? (
        <>
          <GameCanvas />
          <Hud />
        </>
      ) : (
        <StartScreen />
      )}
    </div>
  );
}
