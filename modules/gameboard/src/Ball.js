import { useThree } from "@react-three/fiber"
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import {useGamePlayContext} from './GamePlayContext';
// import { useRef } from "react"

const Ball = ({ position, args, color  }) => {
  const {
    ballRef,
  } = useGamePlayContext();

  const { viewport } = useThree()

  const onCollisionEnter = () => (
    console.log("ball onCollisionEnter"),
    ballRef.current.setTranslation(position),
    ballRef.current.setLinvel({ x: 0, y: 100, z: 0 })
  )

  return (
    <>
      <RigidBody
        ref={ballRef}
        position={position}
        linvel={[0, 100, 0]}
        colliders="ball"
        mass={1}
        restitution={1.0}
        friction={0.0}>
        <mesh >
          <sphereGeometry args={args} />
          <meshStandardMaterial />
        </mesh>
      </RigidBody>
      <RigidBody
        name="TopBoundry"
        type="fixed"
        colliders={false}
        position={[0, viewport.height, 0]}
        onCollisionEnter={onCollisionEnter}>
        <CuboidCollider args={[viewport.width, 2, viewport.width]} />
      </RigidBody>
      <RigidBody
        name="BottomBoundry"
        type="fixed"
        colliders={false}
        position={[0, -viewport.height, 0]}
        onCollisionEnter={onCollisionEnter}>
        <CuboidCollider args={[viewport.width, 2, viewport.width]} />
      </RigidBody>
    </>
  );
};

export default Ball;
