import './App.css';
import React, { useEffect } from 'react';
import Controller from './Controller';
import { PADDLE_ID } from './api';

function App() {
  useEffect(() => {
    document.title = `${PADDLE_ID.charAt(0).toUpperCase()}${PADDLE_ID.slice(1)} Web Paddle`;
  }, []);

  return (
    <div className="App">
      <Controller />
    </div>
  );
}

export default App;
