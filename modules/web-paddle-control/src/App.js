import './App.css';

import React, {useEffect, useState, useRef} from 'react'
import { v4 as uuidv4 } from 'uuid';
// import {MQTTClient, BaseState} from 'dw-state-machine';
// import {BaseState} from 'dw-state-machine';
// import { logger } from 'dw-utils';
import Controller from './Controller'
// import AppMQTTClient from './AppMQTTClient';
import {PongAPI} from 'dw-state-machine';

const logger = require('./logger');

function App() {
  // logger.info('This is a winston info message');
  const [size, setSize] = useState({ width: 800, height: 600 });
  // const screenWidth = window.innerWidth;
  // const screenHeight = window.innerHeight;
  // const gameState = new BaseState();

  const paddleId = process.env.REACT_APP_PADDLE_ID || 'bottom';
  const title =  paddleId.charAt(0).toUpperCase() + paddleId.slice(1) + " Web Paddle";
  const broker = process.env.REACT_APP_MQTT_BROKER || window.location.hostname;
  const port = process.env.REACT_APP_MQTT_PORT || 9001;
  const brokerUrl = `ws://${broker}:${port}`;
  const clientId = process.env.REACT_APP_MQTT_CLIENT_ID || 'web-paddle-control';
  const uuid = uuidv4();
  const fullClientId = `${clientId}-${uuid}`;

  // console.log("broker: ", broker);
  // console.log("port: ", port);
  // console.log("clientId: ", clientId);
  // console.log("fullClientId: ", fullClientId);

  // const pongAPI = new PongAPI(fullClientId, brokerUrl);
  // const pongAPIRef = useRef(new PongAPI(fullClientId, brokerUrl));
  const pongAPIRef = useRef(null); // Use useRef to store the PongAPI instance

  useEffect(() => {

    // const broker = process.env.REACT_APP_MQTT_BROKER || window.location.hostname;
    // const port = process.env.REACT_APP_MQTT_PORT || 9001;
    // const brokerUrl = `ws://${broker}:${port}`;
    // const clientId = process.env.REACT_APP_MQTT_CLIENT_ID || 'web-paddle-control';
    // const paddleId = process.env.REACT_APP_PADDLE_ID || 'bottom';
    // const fullClientId = `${paddleId}-${clientId}`;

    // console.log("broker: ", broker);
    // console.log("port: ", port);
    // console.log("clientId: ", clientId);
    // console.log("paddleId: ", paddleId);
    // console.log("fullClientId: ", fullClientId);

    // // const mqttClient = new AppMQTTClient(brokerUrl, { fullClientId }, gameState);
    // const mqttClient = new AppMQTTClient(brokerUrl, fullClientId, gameState);
    
    // mqttClient.start();

    document.title = title;

    // pongAPI.start();
    if (!pongAPIRef.current) {
      pongAPIRef.current = PongAPI(fullClientId, brokerUrl);
    }

    if (pongAPIRef.current) {
      pongAPIRef.current.start();
    }

    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      // Cleanup if necessary
      window.removeEventListener('resize', handleResize);
      // mqttClient.stop();

      // pongAPI.stop();
      if (pongAPIRef.current) {
        pongAPIRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="App" >
      {/* <MainScene width={screenWidth} height={screenHeight} /> */}
      <Controller pongAPIRef={pongAPIRef} style={{ width: size.width, height: size.height }} />
    </div>
  );
}

export default App;