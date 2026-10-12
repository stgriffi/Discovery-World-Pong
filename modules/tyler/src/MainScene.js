import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import TylerHud from './TylerHud';

function MainScene() {
  return (
    <Canvas>
      <ambientLight intensity={1.5} />
      <Suspense fallback={null}>
        <TylerHud />
      </Suspense>
    </Canvas>
  );
}

export default MainScene;
