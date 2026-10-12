import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { TRAINING as T } from '../game/constants';
import { controller } from '../runtime';

// Ball and paddles. Positions come straight from the controller every frame; nothing
// here goes through React state.
function GameObjects() {
  const group = useRef();
  const ball = useRef();
  const top = useRef();
  const bottom = useRef();
  const renderState = useRef({});

  useFrame(() => {
    controller.advance();
    const r = controller.getRenderState(renderState.current);
    group.current.visible = controller.ui.getState().screen === 'gameplay';
    ball.current.visible = r.ballVisible;
    ball.current.position.set(r.ballX, r.ballY, 0);
    top.current.position.set(r.topX, r.topY, 0);
    bottom.current.position.set(r.bottomX, r.bottomY, 0);
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={ball} visible={false}>
        <sphereGeometry args={[T.BALL_DIAMETER / 2, 32, 32]} />
        <meshStandardMaterial />
      </mesh>
      <mesh ref={top}>
        <planeGeometry args={[T.PADDLE_WIDTH, T.PADDLE_HEIGHT]} />
        <meshStandardMaterial color="rgb(187,30,50)" />
      </mesh>
      <mesh ref={bottom}>
        <planeGeometry args={[T.PADDLE_WIDTH, T.PADDLE_HEIGHT]} />
        <meshStandardMaterial color="rgb(20,192,243)" />
      </mesh>
    </group>
  );
}

export default GameObjects;
