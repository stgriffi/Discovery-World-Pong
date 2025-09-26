import React, { useEffect } from 'react';
import {useGameContext} from './GameContext';
import {useGamePlayContext} from './GamePlayContext';
import GamePlayStateMachine from './GamePlayStateMachine';
import GameStateMachine from './GameStateMachine';
import { PongAPI } from 'dw-state-machine';
import GamePlay from './GamePlay';
import GamePlayHud from './GamePlayHud';
import GameInstructionsHud from './GameInstructionHud';

const Game = () => {
  const {
    gameStateMachine,
    pongAPI,
    isGamePlayComplete,
  } = useGameContext();

  const {
    topPaddleState, setTopPaddleState,
    bottomPaddleState, setBottomPaddleState,
  } = useGamePlayContext();  

  useEffect(() => {
    if (gameStateMachine) {
      gameStateMachine.start();
    }
  }, [gameStateMachine]);

  useEffect(() => {
    if (pongAPI) {
      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_TOP_STATE, 
        onPaddleTopState
      );

      pongAPI.registerObserver(
        PongAPI.Topics.PADDLE_BOTTOM_STATE, 
        onPaddleBottomState
      );
    }
  }, [pongAPI]);

  useEffect(() => {
    if (gameStateMachine) {
      if (pongAPI &&  pongAPI.isConnected()) {     
        if (gameStateMachine.state != "idle"
          && (topPaddleState == "stop" || bottomPaddleState == "stop")) {
          const message = {
            "transition": "player_exit"
          };
    
          pongAPI.update(PongAPI.Topics.GAME_STATE, message );
        }  
    
        if (gameStateMachine.state === "idle"
          && (topPaddleState == "start" && bottomPaddleState == "ready") 
          || (topPaddleState == "ready" && bottomPaddleState == "start")) {
          const message = {
            "transition": "player_ready"
          };
    
          pongAPI.update(PongAPI.Topics.GAME_STATE, message );
        }
    
        if (gameStateMachine.state === "idle" 
          && (topPaddleState == "start" && bottomPaddleState == "start")) {
          
          const message = {
            "transition": "move_intro_complete"
          };
    
          pongAPI.update(PongAPI.Topics.GAME_STATE, message );
        } 
      }
    }

  });

  const onPaddleTopState = (message) => {
    const paddleState = message.state;
    setTopPaddleState(paddleState);      
  }

  const onPaddleBottomState = (message) => {
    const paddleState = message.state;
    setBottomPaddleState(paddleState);      
  } 

  return (
    <group>
      <GameStateMachine />
      <GamePlayStateMachine />
      {isGamePlayComplete ? (
        <group>
          <GameInstructionsHud />
        </group>  
      ) : (
        <group> 
          <GamePlay />
          <GamePlayHud />
        </group>
      )}
    </group>
  );
  
};

export default Game;