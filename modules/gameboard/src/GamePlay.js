import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLoader, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PongAPI } from 'dw-state-machine';
import {useGameContext} from './GameContext';
import {useGamePlayContext} from './GamePlayContext';
import * as IMAGES from './loadImages';
import * as TEXT from './loadText';
import Gameboard from './Gameboard';
import Ball from './Ball';
import Paddle from './Paddle';
// import Goal from './Goal';
import Wall from './Wall';

const gameboardHeight = 160; // height used in AI 
const gameboardWidth = 192; // width used in AI
const gameboardZ = -3.0;
const paddleWidth = 20;
const paddleHeigth = 3.0;
const paddlePadding = 3.0
const ballRadius = 4.0;
const wallWidth = 1.0;
// const goalWidth = 0.1;
const ballStartPosition = [0, -(gameboardHeight / 2) + 10, 0];
const angles = [-60, -45, -30, 0, 0, 30, 45, 60]; // Bounce angles

function GamePlay() {

  const {
    pongAPI,
    gamePlayStateMachine,
  } = useGameContext();

  const {
    audioPlayer,
    volume,
    speed,
    level,
    setCountdown,
    topPaddlePosition, setTopPaddlePosition,
    bottomPaddlePosition, setBottomPaddlePosition,
    topScore,
    setTopScore,
    bottomScore,
    setBottomScore,      
    isTopPaddleReset,
    setIsTopPaddleReset,
    isBottomPaddleReset,
    setIsBottomPaddleReset,
    isBallReset,
    setIsBallReset,
    ballRef,
  } = useGamePlayContext();

  // const [isBallReset, setIsBallReset] = useState(true);
  
  const topPaddleRef = useRef();
  const bottomPaddleRef = useRef();

  const max = (gameboardWidth - paddleWidth) / 2;
  const min = -max;

  const gameboardTexture = useLoader(THREE.TextureLoader, IMAGES.gameboard);

  const [prevBallPosition, setPrevBallPosition] = useState({x: 0.0, y: 0.0, z: 0.0});

  useEffect(() => {
    if (pongAPI) {
      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_TOP_POSITION, 
        onPaddleTopPosition
      );

      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_BOTTOM_POSITION, 
        onPaddleBottomPosition
      );

      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_TOP_STATE_TRANSITION, 
        onPaddleTopStateTransition
      );

      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_BOTTOM_STATE_TRANSITION, 
        onPaddleBottomStateTransition
      );      
    }

    audioPlayer.setVolume('paddleHit', volume);
    audioPlayer.setVolume('pointScore', volume);
    audioPlayer.setVolume('pointLose', volume);

  }, []);

  useFrame(() => {
    if (gamePlayStateMachine 
      && pongAPI 
      &&  pongAPI.isConnected()) {
      switch (gamePlayStateMachine.state) {
        case "gameStarted":
          break;            
        case "gameReset":
          setIsBallReset(true);
          // if(!isBallReset) {
          //   setIsBallReset(true);                  
          // } else {
          //   if (!isTopPaddleReset || !isBottomPaddleReset) {
          //       setIsBallReset(true);   
          //   }
          // }
          break;
        case "levelReset":
          setIsBallReset(true);
          // if(!isBallReset) {
          //   setIsBallReset(true);                  
          // } else {
          //   if (!isTopPaddleReset || !isBottomPaddleReset) {
          //     setIsBallReset(true);   
          //   }
          // }
          break;
        case "playReset":
            if (isTopPaddleReset && isBottomPaddleReset && isBallReset) {
              gamePlayStateMachine.startNoCountdown();
            } else {
              setIsBallReset(true);
            }
          break;
        case "countdown":
          break;
        case "noCountdown":
          break;
        case "play":
          setIsBallReset(false);
          // try {
          //   if (ballRef && ballRef.current) {
          //     const ballPosition = ballRef.current.translation();
          //     ballPosition.x = Math.round(ballPosition.x);
          //     ballPosition.y = Math.round(ballPosition.y);
          //     ballPosition.z = Math.round(ballPosition.z);
  
          //     if (ballPosition.x != prevBallPosition.x || 
          //       ballPosition.y != prevBallPosition.y) 
          //     {
          //       const message = {
          //         "ball": {
          //           "position": {
          //             "x": ballPosition.x,
          //             "y": ballPosition.y
          //           }
          //         },
          //         "paddle_top": {
          //           "position": {
          //             "x": topPaddlePosition
          //           }
          //         },
          //         "paddle_bottom": {
          //           "position": {
          //             "x":bottomPaddlePosition
          //           }
          //         }
          //       };
          
          //       pongAPI.update(PongAPI.Topics.GAME_PLAY, message );
          //       // setPrevBallPosition(ballPosition); // causes issues with the ball
          //     }
  
          //     if (ballPosition.y > 90) {
          //       setBottomScore((prev) => prev + 1);
          //       gamePlayStateMachine.startPlayReset();
          //     }
  
          //     if (ballPosition.y < -90) {     
          //       if (level === 3) {
          //         setTopScore((prev) => prev + 1);   
          //         gamePlayStateMachine.endGame();
          //       } else {
          //         setTopScore((prev) => prev + 1);
          //         gamePlayStateMachine.startPlayReset();
          //       }
          //     }
          //   }
          // } catch (error) {
          //   console.log(`Error: ${error.message}`);
          // }               
          break;
        case "gameComplete":
          gamePlayStateMachine.startGameReset();
          if (bottomScore > topScore) {
            setCountdown(TEXT.human_wins);
          }
      
          if (bottomScore < topScore) {
            setCountdown(TEXT.tyler_wins);
          }
      
          if (bottomScore == topScore) {
            setCountdown(TEXT.draw);
          }

          const message = {
            "transition": "level3_complete"
          };

          pongAPI.update(PongAPI.Topics.GAME_STATE, message);
        break;
        default:
          console.log("Unknown state");
      }
    }

    if (topPaddleRef.current) {
      const xfactor = ((topPaddlePosition - 0.5) * (gameboardWidth - paddleWidth));

      const newPositionX = Math.round(Math.max(min, Math.min(max, xfactor)) * 100) / 100;
      const currentPosition = topPaddleRef.current.translation();
      topPaddleRef.current.setTranslation({ x: newPositionX, y: currentPosition.y, z: currentPosition.z }, true);
    }

    if (bottomPaddleRef.current) {
      const xfactor = ((bottomPaddlePosition - 0.5) * (gameboardWidth - paddleWidth));

      const newPositionX = Math.round(Math.max(min, Math.min(max, xfactor)) * 100) / 100;
      const currentPosition = bottomPaddleRef.current.translation();
      bottomPaddleRef.current.setTranslation({ x: newPositionX, y: currentPosition.y, z: currentPosition.z }, true);
    }   

  });
 
  const onPaddleTopStateTransition = (message) => {
    const paddleStateTransition = message.transition;
   
    if (paddleStateTransition == "reset") {
      setIsTopPaddleReset(true);
    }     
  }

  const onPaddleBottomStateTransition = (message) => {
    const paddleStateTransition = message.transition;

    if (paddleStateTransition == "reset") {
      setIsBottomPaddleReset(true);
    }     
  } 

  const onPaddleTopPosition = (message) => {
    const paddlePosition = message.position.x;
    setTopPaddlePosition(paddlePosition);   
  }

  const onPaddleBottomPosition = (message) => {
      const paddlePosition = message.position.x;
      setBottomPaddlePosition(paddlePosition);        
  }  

  // Function to handle collision events using useCallback
  const handleCollision = useCallback((event) => {
    console.log("handleCollision");
    // // Extract the rigid body of the colliding object and the target object from the event
    // const otherObject = event.rigidBody;
    // const targetObject = event.target.rigidBody;

    // // Check if the colliding object is a ball and the target object is a paddle
    // if (otherObject.userData && otherObject.userData.isBall && 
    //   targetObject.userData && targetObject.userData.isPaddle) {

    //   // Play an audio clip for the paddle hit using the audio player reference
    //   audioPlayer.play('paddleHit').catch((error) => {
    //     console.error('Error playing audio:', error);
    //   });

    //   // Calculate the collision point on the paddle
    //   const collisionPoint = event.manifold.localContactPoint1().x;
    //   const regionIndex = Math.min(7, Math.floor((collisionPoint + (paddleWidth / 2)) / 2.5))

    //   // Check if the region index is within the valid range of angles array
    //   if (regionIndex >= 0 && regionIndex < angles.length) {
    //     // Convert the angle to radians
    //     const radians = (angles[regionIndex] * (Math.PI / 180));
    //     // Calculate the new velocity for the ball based on the collision point and angle
    //     // Adjust y based on whether it's the top or bottom paddle
    //     const newVelocity = {
    //       x: speed * Math.sin(radians),
    //       y: speed * Math.cos(radians) * (targetObject.isTop ? -1 : 1), 
    //       z: 0,
    //     };   

    //     // console.log("ballRef.current before setLinvel:", JSON.stringify(newVelocity, null, 2));
    //     // Set the new linear velocity for the ball   
    //     otherObject.setLinvel(newVelocity, true);
    //   }
    // }
  }, []);

  return (
    // Goal component was an attempt to use Rapier sensor to register goal but
    // it was duplicating collisions.

    <group position={[0, 0, 0]} >
      <Gameboard 
        position={[0.0, 0.0, gameboardZ]} 
        args={[gameboardWidth, gameboardHeight]} 
        map={gameboardTexture} 
      />

      <Wall 
        position={[gameboardWidth / 2, 0, 0]} 
        args={[wallWidth, gameboardHeight]} 
      />

      <Wall 
        position={[-gameboardWidth / 2, 0, 0]} 
        args={[wallWidth, gameboardHeight]} 
      />

      <Paddle
        paddleRef={topPaddleRef}
        isTop={true}
        position={[0.0, gameboardHeight / 2 - paddlePadding, 0.0]} 
        args={[paddleWidth, paddleHeigth]} 
        color="rgb(187,30,50)" 
        handleCollision={handleCollision}
      />

      <Paddle 
        paddleRef={bottomPaddleRef}
        isTop={false}
        position={[0.0, -gameboardHeight / 2 + paddlePadding, 0.0]} 
        args={[paddleWidth, paddleHeigth]} 
        color="rgb(20,192,243)" 
        handleCollision={handleCollision}
      />

        <Ball 
          position={ballStartPosition} 
          args={[ballRadius, 32, 32]}
          isReset={isBallReset}
          // color="rgb(255,255,255)" 
        />

    </group>
  );
}

export default GamePlay;