import React, { useState, useRef, useEffect, useCallback } from 'react';
import {PongAPI} from 'dw-state-machine';
import { api, PADDLE_ID } from './api';

const INTERVAL = process.env.REACT_APP_INTERVAL || 70;
const INCREMENT = parseFloat(process.env.REACT_APP_INCREMENT) || 0.05;
const MAX = process.env.REACT_APP_MAX || 1.0;
const MIN = process.env.REACT_APP_MIN || 0.0;
const PADDLEID = PADDLE_ID;

let paddlePositionTopic = PongAPI.Topics.PADDLE_BOTTOM_POSITION;
let paddleStateTopic = PongAPI.Topics.PADDLE_BOTTOM_STATE;
let paddleStateTransitionTopic = PongAPI.Topics.PADDLE_BOTTOM_STATE_TRANSITION;

if (PADDLEID === 'top') {
  paddleStateTopic = PongAPI.Topics.PADDLE_TOP_STATE;
  paddlePositionTopic = PongAPI.Topics.PADDLE_TOP_POSITION;
  paddleStateTransitionTopic = PongAPI.Topics.PADDLE_TOP_STATE_TRANSITION;
}

console.log(`#############################`);
console.log(`paddleId: ${PADDLEID}`);
console.log(`paddleTopic: ${paddleStateTopic}`);
console.log(`paddleStateTransitionTopic: ${paddleStateTransitionTopic}`);
console.log(`interval: ${INTERVAL}`);
console.log(`increment: ${INCREMENT}`);
console.log(`max: ${MAX}`);
console.log(`min: ${MIN}`);
console.log(`******************************`); 

const Controller = () => {
  const [position, setPosition] = useState(0.5);
  const [isReset, setIsReset] = useState(false);

  const lIntervalId = useRef(null);
  const rIntervalId = useRef(null);

  useEffect(() => {
    const unsubscribe = api.registerObserver(paddleStateTransitionTopic, onPaddleStateTransition);
    // Announce this paddle once connected (publishing before the connection is dropped).
    const stopListening = api.onConnectionChange((connected, { first }) => {
      if (connected && first) api.update(paddleStateTopic, { state: "ready" });
    });
    if (api.isConnected()) api.update(paddleStateTopic, { state: "ready" });

    // disable the pinch zoom on mobile
    const disablePinchZoom = (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', disablePinchZoom, { passive: false });

    return () => {
      document.removeEventListener('touchmove', disablePinchZoom);
      unsubscribe();
      stopListening();
      api.update(paddleStateTopic, { state: "not_ready" });
    };
  }, []);

  useEffect(() => {
    api.update(paddlePositionTopic, { position: { x: parseFloat(position.toFixed(2)) } });
  }, [position]);  
  
  useEffect(() => {
    if (isReset) {
      console.log(`isReset: ${isReset}`);
      setIsReset(false);
      console.log(`position: ${position}`);
      api.update(paddlePositionTopic, { position: { x: parseFloat(position.toFixed(2)) } });  
      api.update(paddleStateTopic, { state: "reset" });
    }
  }, [isReset, position]);

  const onPaddleStateTransition = (message) => {
      const paddleStateTransition = message.transition;
      if (paddleStateTransition === 'reset') {
        console.log('Paddle Message:', message);

        setPosition(0.5);
        setIsReset(true);

        // api.update(paddleStateTopic, { state: "reset" });
        // api.update(paddleStateTopic, { state: "start" });
      }
  }

  const move = useCallback((direction) => {
    // console.log('move: ', direction);

    setPosition((prevPosition) => {
      let newPosition = prevPosition;
      if (direction === 'L') {
        newPosition = Math.max(MIN, newPosition - INCREMENT);
      } else if (direction === 'R') {
        newPosition = Math.min(MAX, newPosition + INCREMENT);
      }
      console.log(`newPosition: ${newPosition}`);
      return newPosition;
    });
  },[]);

  const handleMouseDown =  useCallback((direction) => {
    // A second press without a release (touch + mouse) must not leave a timer running.
    clearInterval(lIntervalId.current);
    clearInterval(rIntervalId.current);
    if (direction === 'L') {
      move(direction);
      lIntervalId.current = setInterval(() => move('L'), INTERVAL);
      // console.log(`lIntervalId.current: ${lIntervalId.current}`);
    } else if (direction === 'R') {
      move(direction);
      rIntervalId.current = setInterval(() => move('R'), INTERVAL);
      // console.log(`rIntervalId.current: ${rIntervalId.current}`);
    }
  },[move]);

  const handleMouseUp =  useCallback((direction) => {
    // console.log('handleMouseUp: ', direction);
    // console.log(`lIntervalId.current: ${lIntervalId.current}`);
    // console.log(`rIntervalId.current: ${rIntervalId.current}`);

    if (direction === 'L') {
      clearInterval(lIntervalId.current);
      // console.log(`lIntervalId.current: ${lIntervalId.current}`);
      lIntervalId.current = null;
    } else if (direction === 'R') {
      clearInterval(rIntervalId.current);
      // console.log(`rIntervalId.current: ${rIntervalId.current}`);
      rIntervalId.current = null;
    }
  },[]);

  const handleMouseLeave =  useCallback((direction) => {
    // console.log('handleMouseLeave: ', direction);
    if (direction === 'L' && lIntervalId.current) {
      clearInterval(lIntervalId.current);
      // console.log(`lIntervalId.current: ${lIntervalId.current}`);
      lIntervalId.current = null;
    } else if (direction === 'R' && rIntervalId.current) {
      clearInterval(rIntervalId.current);
      // console.log(`rIntervalId.current: ${rIntervalId.current}`);
      rIntervalId.current = null;
    }
  },[]);

  const startButton = useCallback(() => {
    // console.log("Start button clicked");
    // Add code to handle the start button click here
    api.update(paddleStateTopic, { state: "start" });
  }, []);

  const stopButton = useCallback(() => {
    // console.log("Stop button clicked");
    api.update(paddleStateTopic, { state: "stop" });
  }, []);


  const readyButton = useCallback(() => {
    // console.log("Ready button clicked");
    api.update(paddleStateTopic, { state: "ready" });
  }, []);

  return (
    <div className="Controller">
      <button className="split-button"
        onMouseDown={() => handleMouseDown('L')}
        onMouseUp={() => handleMouseUp('L')}
        onMouseLeave={() => handleMouseLeave('L')}
        onTouchStart={() => handleMouseDown('L')}
        onTouchEnd={() => handleMouseUp('L')}
        onTouchCancel={() => handleMouseLeave('L')}
      >
        L
      </button>
      <button className="split-button"
        onMouseDown={() => handleMouseDown('R')}
        onMouseUp={() => handleMouseUp('R')}
        onMouseLeave={() => handleMouseLeave('R')}
        onTouchStart={() => handleMouseDown('R')}
        onTouchEnd={() => handleMouseUp('R')}
        onTouchCancel={() => handleMouseLeave('R')}
      >
        R
      </button>
      <div className="right-panel">
      <button className="small-button" onClick={stopButton}>
          <i className="fas fa-stop" style={{ color: 'red' }}></i>
      </button>
      <button className="small-button" onClick={startButton}>
          <i className="fas fa-play" style={{ color: 'green' }}></i>
      </button>
      <button className="small-button" onClick={readyButton}>
          <i className="fas fa-check" style={{ color: 'blue' }}></i>
      </button>
      </div>
    </div>
  );  

  // return (
  //   <div className="Controller">
  //     <button className="split-button"
  //       onMouseDown={() => handleMouseDown('L')}
  //       onMouseUp={() => handleMouseUp('L')}
  //       onMouseLeave={() => handleMouseLeave('L')}
  //       onTouchStart={() => handleMouseDown('L')}
  //       onTouchEnd={() => handleMouseUp('L')}
  //       onTouchCancel={() => handleMouseLeave('L')}
  //     >
  //       L
  //     </button>
  //     <button className="split-button"
  //       onMouseDown={() => handleMouseDown('R')}
  //       onMouseUp={() => handleMouseUp('R')}
  //       onMouseLeave={() => handleMouseLeave('R')}
  //       onTouchStart={() => handleMouseDown('R')}
  //       onTouchEnd={() => handleMouseUp('R')}
  //       onTouchCancel={() => handleMouseLeave('R')}
  //     >
  //       R
  //     </button>

      
  //   </div>
  // );
};

export default Controller;
