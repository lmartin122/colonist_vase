import { MotionConfig } from 'framer-motion';
import { GameCanvas } from './ui/GameCanvas';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { ThemeToggle } from './ui/ThemeToggle';
import { SettingsPopover } from './ui/SettingsPopover';
import { useGame } from './state/store';
import { useReducedMotionPreference } from './state/useMotionPreference';

export default function App() {
  const started = useGame((s) => s.game !== null);
  const animationsDisabled = useReducedMotionPreference();
  return (
    <MotionConfig reducedMotion={animationsDisabled ? 'always' : 'never'}>
      <div className="relative h-full w-full overflow-hidden">
        {started ? (
          <>
            <GameCanvas />
            <Hud />
          </>
        ) : (
          <StartScreen />
        )}
        {!started && <><ThemeToggle /><SettingsPopover /></>}
      </div>
    </MotionConfig>
  );
}
