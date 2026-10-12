import React, { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import Board from './Board';
import GameObjects from './GameObjects';
import HudLayer from '../hud/HudLayer';
import { preloadTextures } from '../assets';

preloadTextures();

function CameraController() {
  const { camera } = useThree();

  useEffect(() => {
    camera.fov = 65;
    camera.updateProjectionMatrix();
    camera.position.set(0, -95.0, 95);
    camera.lookAt(0, -37, 0);
  }, [camera]);

  return null;
}

// Everything stays mounted for the life of the page; screens are switched with
// `visible`. Unmounting scene objects between games is what used to leave stale
// physics references behind.
function MainScene() {
  return (
    <Canvas>
      <ambientLight intensity={1.5} />
      <CameraController />
      <Suspense fallback={null}>
        <Board />
        <GameObjects />
        <HudLayer />
      </Suspense>
    </Canvas>
  );
}

export default MainScene;
