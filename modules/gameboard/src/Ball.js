import { useThree } from "@react-three/fiber"
import { RigidBody, CuboidCollider, CoefficientCombineRule } from '@react-three/rapier';
import {useGamePlayContext} from './GamePlayContext';
import { useRef, useEffect, useCallback } from "react"

const Ball = ({ position, args, isReset }) => {
  // const {
  //   ballRef,
  // } = useGamePlayContext();

  const ballRef = useRef();
  const { viewport } = useThree()

  const onCollisionEnter = useCallback(() => {
    console.log("ball onCollisionEnter");
    ballRef.current.setTranslation({ x: 0, y: 0, z: 0 });
    ballRef.current.setLinvel({ x: 0, y: 100, z: 0 });
  }, [ballRef])

  useEffect(() => {
    if (isReset) {
      ballRef.current.setTranslation({ x: 0, y: 0, z: 0 });
      ballRef.current.setLinvel({ x: 0, y: 0, z: 0 });
    } else {
      ballRef.current.setLinvel({ x: 0, y: 100, z: 0 }, true);
    }
  }, [isReset])

  return (
    <>
      <RigidBody
        ref={ballRef}
        // position={position}
        // linvel={[0, 100, 0]}
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
        restitution={0}
        restitutionCombineRule={CoefficientCombineRule.Min}
        position={[0, viewport.height, 0]}
        onCollisionEnter={onCollisionEnter}>
        <CuboidCollider args={[viewport.width, 2, viewport.width]} />
      </RigidBody>
      <RigidBody
        name="BottomBoundry"
        type="fixed"
        colliders={false}
        restitution={0}
        restitutionCombineRule={CoefficientCombineRule.Min}
        position={[0, -viewport.height, 0]}
        onCollisionEnter={onCollisionEnter}>
        <CuboidCollider args={[viewport.width, 2, viewport.width]} />
      </RigidBody>
    </>
  );
};

export default Ball;
