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

      <LiveText select={(s) => s.centerText} position={[0.0, 1.0, 0.0]} fontSize={1.7} color="white" />
    </group>
  );
}

export default GameplayOverlay;
