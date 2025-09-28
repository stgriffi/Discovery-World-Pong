import { RigidBody } from '@react-three/rapier';
import { useRef, useEffect } from "react"

const Ball = ({ initPosition, initSpeed, isReset }) => {
  const ballRef = useRef();
  const ballRadius = 4.0;
  const ballSegments = 32;

  useEffect(() => {
    if (isReset) {
      ballRef.current.setTranslation(initPosition);
      ballRef.current.setLinvel({ x: 0, y: 0, z: 0 });
    } else {
      ballRef.current.setLinvel({ x: 0, y: initSpeed, z: 0 }, true);
    }
  }, [isReset])

  return (
    <RigidBody
      ref={ballRef}
      colliders="ball"
      mass={1}
      restitution={1}
      friction={0}>
      <mesh >
        <sphereGeometry args={[ballRadius, ballSegments, ballSegments]} />
        <meshStandardMaterial />
      </mesh>
    </RigidBody>
  );
};

export default Ball;
