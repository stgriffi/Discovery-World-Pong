# Gameboard

The exhibit's main game screen (port 5000): React Three Fiber rendering on top of a plain-JS
game core in `src/game/`.

- `src/game/pongSim.js` — deterministic Pong physics ported from the MSOE training environment
  (verified tick-for-tick by `pongSim.trace.test.js`; regenerate the fixture with `tools/physics-trace/run.sh`).
- `src/game/GameController.js` — exhibit state machine, in-level gameplay machine, timers and MQTT.
- `src/runtime.js` — creates the MQTT client, audio and controller once at startup.
- `src/scene/`, `src/hud/` — rendering only; everything stays mounted and is shown/hidden.

```bash
npm ci
REACT_APP_MQTT_BROKER=localhost npm start      # dev server; needs the mqtt-broker container
CI=true npx react-scripts test --watchAll=false
npm run build
```

URL knobs for testing: `?round=5` (5 s levels), `?watchdogScale=0.2` (shorter waits for TYLER).
