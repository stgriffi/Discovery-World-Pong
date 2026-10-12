import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './runtime'; // connects to MQTT and starts TYLER's controller
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
