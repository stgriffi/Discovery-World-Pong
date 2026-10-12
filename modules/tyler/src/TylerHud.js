import { Hud, PerspectiveCamera, Text } from '@react-three/drei';
import HudImage from './HudImage';
import mainFont from './fonts/Roboto-Bold.ttf';
import * as IMAGES from './loadImages';
import { useView } from './useView';

const FACES = {
  sleeping: IMAGES.TYLERFace_Sleeping1,
  neutral: IMAGES.TYLERFace_Neutral,
  moveLeft: IMAGES.TYLERFace_MoveLeft,
  happy: IMAGES.TYLERFace_Happy,
  annoyed: IMAGES.TYLERFace_Annoyed,
};

// Every face stays mounted and is shown/hidden, so changing faces never suspends.
function Face() {
  const face = useView((view) => view.face);
  return (
    <>
      {Object.entries(FACES).map(([name, image]) => (
        <group key={name} visible={face === name}>
          <HudImage position={[0.0, 0.0, 0.0]} scale={4.0} image={image} />
        </group>
      ))}
    </>
  );
}

function Caption() {
  const text = useView((view) => view.text);
  return (
    <group position={[0.0, -2.0, 0.0]}>
      <mesh>
        <planeGeometry args={[5.0, 2.5]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <Text position={[-2.4, 1.1, 0.0]} maxWidth={4.8} anchorX="left" anchorY="top" font={mainFont} fontSize={0.3} color="white">
        {text}
      </Text>
    </group>
  );
}

function TylerHud() {
  const asleep = useView((view) => view.state === 'idle' || view.state === 'stopped');

  return (
    <Hud>
      <PerspectiveCamera makeDefault position={[0, 0, 10]} />
      <group position={[0.0, 1.5, 0.0]}>
        <Text position={[0.0, 2.2, 0.0]} font={mainFont} fontSize={0.4} color="white">
          T.Y.L.E.R.
        </Text>
        <Face />
      </group>
      <group visible={asleep} position={[0.0, -2.0, 0.0]}>
        <HudImage position={[0.0, 0.0, 0.0]} scale={2.7} image={IMAGES.welcomeScreen} />
      </group>
      <group visible={!asleep}>
        <Caption />
      </group>
    </Hud>
  );
}

export default TylerHud;
