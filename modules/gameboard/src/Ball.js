import { useThree } from "@react-three/fiber"
import { RigidBody } from '@react-three/rapier';
// import {useGamePlayContext} from './GamePlayContext';
import { useRef } from "react"

const Ball = ({ position, args, color  }) => {
  // const {
  //   ballRef,
  // } = useGamePlayContext();

  const ref = useRef()
  const { viewport } = useThree()

  const onCollisionEnter = () => (
    ref.current.setTranslation(position),
    ref.current.setLinvel({ x: 0, y: 100, z: 0 })
  )

  return (
    <>
      <RigidBody
        ref={ref}
        position={position}
        colliders="ball"
        restitution={1.0}
        friction={0.0}>
        <mesh >
          <sphereGeometry args={args} />
          <meshStandardMaterial color={color} />
        </mesh>
      </RigidBody>
      <RigidBody
        type="fixed"
        colliders={false}
        position={[0, viewport.height, 0]}
        onCollisionEnter={onCollisionEnter}>
        <CuboidCollider args={[viewport.width, 2, viewport.width]} />
      </RigidBody>
      <RigidBody
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
