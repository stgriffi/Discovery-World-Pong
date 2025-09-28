import { useThree } from "@react-three/fiber"
import { RigidBody, CuboidCollider, CoefficientCombineRule} from '@react-three/rapier';

function Goal({ isTop, onGoal }) {
  const { viewport } = useThree()
  const thickness = 2;
  const goalName = isTop ? "TopGoal" : "BottomGoal";
  const y_position = isTop ? viewport.height : -viewport.height;

  return (
    <RigidBody
      name={goalName}
      type="fixed"
      colliders={false}
      restitution={0}
      restitutionCombineRule={CoefficientCombineRule.Min}
      position={[0, y_position, 0]}
      onCollisionEnter={onGoal}
    >
    <CuboidCollider args={[2*viewport.width, thickness, viewport.width]} />    
    </RigidBody>
  );
}

export default Goal;
