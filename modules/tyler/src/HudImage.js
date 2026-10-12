import React, { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

function HudImage({ image, position = [0, 0, 0], scale = 1.0 }) {
  const texture = useLoader(THREE.TextureLoader, image);
  const aspect = useMemo(() => {
    const { width, height } = texture.image || {};
    return width && height ? width / height : 1;
  }, [texture]);

  return (
    <mesh position={position}>
      <planeGeometry args={[aspect * scale, scale]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

export default HudImage;
