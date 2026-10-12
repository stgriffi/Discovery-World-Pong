import './App.css';
import React from 'react';
import MainScene from './MainScene';
import { errorReporter } from './runtime';

// If rendering ever fails, report it and reload (capped, see errorReporter.js).
class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    errorReporter.report('error', error.message, { stack: error.stack, componentStack: info.componentStack });
    errorReporter.scheduleReload(`render error: ${error.message}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function App() {
  return (
    <div className="App">
      <SceneErrorBoundary>
        <MainScene />
      </SceneErrorBoundary>
    </div>
  );
}

export default App;
