import React, {Suspense, useEffect, useContext} from 'react'
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from '@react-three/rapier';
import {GizmoHelper, GizmoViewcube, GizmoViewport, GridHelper} from "@react-three/drei"; // can be commented in for debugging
// import GamePlay from './GamePlay';
// import GamePlayHud from './GamePlayHud';
// import GameInstructionsHud from './GameInstructionHud';
// import { useGameContext } from './GameContext';
import Game from './Game';

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

function MainScene() {
  return (
    <Canvas mode="concurrent">
      <ambientLight intensity={1.5} />
      <CameraController />
      <Suspense fallback={null} >
        <Physics gravity={[0, 0, 0]} >
        <Game/>
        </Physics>   
      </Suspense>
    </Canvas>
  );
}

export default MainScene;
