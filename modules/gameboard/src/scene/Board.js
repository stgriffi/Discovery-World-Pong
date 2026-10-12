import React from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { BOARD } from '../game/constants';
import { IMAGES } from '../assets';
import { useUi } from '../useUi';

// Drawn 200 wide (the physics board is 192): the ball's *center* is clamped to the
// board, so its edge meets this border exactly when it bounces.
function Board() {
  const texture = useLoader(THREE.TextureLoader, IMAGES.board);
  const visible = useUi((state) => state.screen === 'gameplay');

  return (
    <mesh position={[0, 0, -3]} visible={visible}>
      <planeGeometry args={[BOARD.VISUAL_WIDTH, BOARD.VISUAL_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

export default Board;
