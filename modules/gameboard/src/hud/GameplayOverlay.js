import React from 'react';
import { Text } from '@react-three/drei';
import HudImage from './HudImage';
import { FONT, IMAGES } from '../assets';
import { HUD_CHARACTERS } from '../game/texts';
import { useUi } from '../useUi';

// All HUD text shares one font and glyph set, so it loads in a single startup suspend.
function HudText({ children, ...props }) {
  return (
    <Text font={FONT} characters={HUD_CHARACTERS} {...props}>
      {children}
    </Text>
  );
}

// A text line bound to one value in the UI store; only it re-renders when that changes.
function LiveText({ select, ...props }) {
  const value = useUi(select);
  return <HudText {...props}>{String(value)}</HudText>;
}

// Time left in levels 1-2 ("0:30" ... "0:00", red for the last 5 s) or "SUDDEN DEATH" in
// level 3. The controller updates the text once per second; nothing renders per frame.
function RoundTimer() {
  const text = useUi((s) => s.timerText);
  const seconds = /^\d+:\d\d$/.test(text) ? Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]) : null;
  const urgent = seconds !== null && seconds <= 5;
  return (
    <HudText position={[0.0, 4.0, 0.0]} fontSize={seconds === null ? 0.8 : 1.1} color={urgent ? '#ff4d4d' : 'white'}>
      {text}
    </HudText>
  );
}

function GameplayOverlay() {
  return (
    <group>
      <group position={[7.2, 2.4, 0.0]}>
        <HudImage position={[0.0, 0.0, 0.0]} scale={4.0} image={IMAGES.score} />
        <LiveText select={(s) => s.topScore} position={[0.0, 0.2, 0.1]} fontSize={1.2} color="black" />
        <LiveText select={(s) => s.bottomScore} position={[0.0, -1.6, 0.1]} fontSize={1.2} color="black" />
      </group>

      <group position={[-6.8, 4.0, 0.0]}>
        <HudText position={[0.0, 0.0, 0.0]} fontSize={0.8} color="white">
          LEVEL:
        </HudText>
        <LiveText select={(s) => s.level} position={[1.6, 0.0, 0.0]} fontSize={0.8} color="white" />
      </group>

      <RoundTimer />

      <LiveText select={(s) => s.centerText} position={[0.0, 1.0, 0.0]} fontSize={1.7} color="white" />
    </group>
  );
}

export default GameplayOverlay;
