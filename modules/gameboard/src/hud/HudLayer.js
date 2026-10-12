import React from 'react';
import { Hud, PerspectiveCamera } from '@react-three/drei';
import InstructionOverlay from './InstructionOverlay';
import GameplayOverlay from './GameplayOverlay';
import { useUi } from '../useUi';

// One <Hud> for both overlays: every <Hud> at render priority 1 clears the canvas and
// redraws the scene, so two mounted at once would erase each other.
function HudLayer() {
  const screen = useUi((state) => state.screen);

  return (
    <Hud renderPriority={1}>
      <PerspectiveCamera makeDefault position={[0, 0, 10]} />
      <group visible={screen === 'instructions'}>
        <InstructionOverlay />
      </group>
      <group visible={screen === 'gameplay'}>
        <GameplayOverlay />
      </group>
    </Hud>
  );
}

export default HudLayer;
