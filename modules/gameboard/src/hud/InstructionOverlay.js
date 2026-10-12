import React from 'react';
import HudImage from './HudImage';
import { IMAGES } from '../assets';
import { useUi } from '../useUi';

function InstructionOverlay() {
  const instruction = useUi((state) => state.instruction);

  return (
    <>
      <group visible={instruction === 'welcome'}>
        <HudImage image={IMAGES.welcome} position={[0.0, 0.2, 0.0]} scale={8.5} />
      </group>
      <group visible={instruction === 'moveLeftRight'}>
        <HudImage image={IMAGES.moveLeftRight} position={[0.0, 0.2, 0.0]} scale={8.5} />
      </group>
    </>
  );
}

export default InstructionOverlay;
