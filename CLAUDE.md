# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Rockwell Automation "Pong" exhibit at Discovery World (Milwaukee). A visitor plays Pong by moving left/right in
front of an Intel RealSense D435 depth camera against **TYLER**, a neural-network opponent trained MSOE-style
("Pong from pixels" REINFORCE). It is a set of Docker services that talk over MQTT; the browser UIs run in Firefox
kiosk windows on four monitors. Ongoing stabilization work (Rapier removal, state machines, audio, AI fidelity) is
tracked in `PROGRESS.md`.

## Services (`modules/`)

| Module | Port | Role |
|---|---|---|
| `gameboard` | 5000 | React Three Fiber game screen: ball/paddle physics, in-level gameplay state machine, HUD, music. Publishes `game/play` and most game-flow transitions. |
| `human-visualizer` | 5001 | Depth-camera heatmap (static page, subscribes `depth/feed`). |
| `neural-net-visualizer` | 5002 | Draws TYLER's network (static page; subscribes `game/level`, `ai/activation`, which nothing publishes in v2). |
| `tyler` | 5003 | TYLER character + voice clips (React). Drives the intro/level-intro/outro transitions. |
| `web-paddle-control` | 5004 / 5005 | Dev-only button paddles (top / bottom), built twice from one image with `REACT_APP_PADDLE_ID`. |
| `single-screen-development` | 5006 | Dev dashboard (Vite/TS) showing all screens in iframes plus logs. |
| `mqtt-broker` | 1883, ws 9001 | Mosquitto, anonymous. Browsers connect to `ws://<page host>:9001`. |
| `ai-paddle-control` | – | Python/TF top paddle (TYLER). |
| `human-paddle-control` | – | Python bottom paddle from the RealSense camera; also publishes `depth/feed`. |
| `log-server` | – | Streams every container's docker logs to MQTT `docker/logs/<name>`. |

`modules/shared/`: `schema/PongAPISchema.json` (canonical MQTT schema), `js_packages/dw/state-machine` (`PongAPI` +
`createBaseGameStateMachine`, consumed by the JS apps as a `file:` dependency), `py_packages/dw` (Python `PongAPI`,
`Topics`, `Config`), `validation/*.h5` (AI weights), `models/*.js` (weights for the NN visualizer).

## Commands

All services build in Docker; every compose service has a profile, so a bare `docker compose up` starts nothing.
Profiles: `dev`, `prod`, `top-player-ai-gpu`, `top-player-ai-cpu`, `bottom-player-depth` (the README's
`top-player-web`/`bottom-player-web` don't exist — the web paddles are in `dev`).

```bash
docker compose --profile dev up -d --build                                   # UIs, broker, explorer, web paddles
docker compose --profile dev --profile top-player-ai-gpu --profile bottom-player-depth up -d   # match the exhibit
docker compose --profile prod up -d                                          # exhibit set only
docker compose --profile dev build gameboard                                 # rebuild one service
docker compose --profile dev build --build-arg CERTS=zscaler                 # behind Rockwell's ZScaler proxy
docker exec mqtt-broker mosquitto_sub -v -t '#'                              # watch MQTT (or mqtt-explorer on :4000)
./setup/open_windows.sh / ./setup/close_windows.sh                           # kiosk windows (monitor-layout specific)
```

Local JS development (Node 22 LTS via nvm, see `.nvmrc`; in non-interactive shells run `. ~/.nvm/nvm.sh` first):

```bash
cd modules/gameboard && npm ci                                    # the shared file: package's deps are hoisted here
REACT_APP_MQTT_BROKER=localhost npm start                         # needs the mqtt-broker container running
npm test -- --watchAll=false                                      # CRA Jest, all tests
npx react-scripts test --watchAll=false src/game/pongSim.test.js  # one file; add -t "name" for one test
```

CRA's ESLint runs inside `npm start`/`npm run build` (warnings only); `single-screen-development` has `npm run lint`.
Python services have no host toolchain (host `python3` lacks pip/venv); run Python tests in a throwaway
`python:3.10-slim` container with the module mounted.

## Game flow across services

- **Base state machine** (`shared/js_packages/dw/state-machine/lib/BaseGameStateMachine.js`):
  `stopped → idle → intro → moveIntro → level1Intro → level1 → level2Intro → level2 → level3Intro → level3 → outro → idle`,
  plus `playerExit`. The gameboard **and** TYLER each run their own instance and stay in sync only because both are
  driven by the same `game/state` `{"transition": ...}` messages. Never transition locally: publish the transition and
  let the MQTT echo drive every instance.
- **Who publishes which transition**: gameboard → `player_ready`, `player_exit`, `move_intro_complete` (idle shortcut
  when both paddles report `start`), `level1_complete`/`level2_complete` (level timers), `level3_complete` (L3 is
  sudden death: TYLER's first point ends the game). TYLER → `intro_complete`, `move_intro_complete`,
  `level1/2/3_intro_complete`, `game_complete`, each when its voice clip ends. If TYLER isn't running or audio
  autoplay is blocked, the game stalls in those states.
- **Paddle states** (`paddle/{top,bottom}/state`, retained): the AI always publishes `start`; the human paddle
  publishes `ready`/`not_ready` from presence detection.
- **Gameboard → AI contract**: `game/play` = `{ball:{position:{x,y}}, paddle_top/paddle_bottom:{position:{x∈[0,1]}}}`.
  Gameboard world is 192×160, origin at center, +y up, top paddle = TYLER. The AI converts to its training frame
  (top-left origin, +y down: `x+96`, `80−y`), renders a synthetic frame, and infers on every 5th message, so the
  `game/play` cadence matters (training ran at 60 Hz).

## AI details

Dense 7680→200→3 (LEFT/RIGHT/NONE) policy net on a thresholded 80×96 difference frame. Weights:
`shared/validation/smoothreward_s6_f5_d3_{5000,15000,22850}.h5` = easy/medium/hard by level. There is no training
code in the repo; the training environment survives only in history: `git show 670d82c:src/game/pong.py` and
`670d82c:src/shared/config.py` (the physics source of truth: ball 2 px/tick +0.2 per paddle hit, 7-segment
bounce-angle table read with Python negative indexing, paddles at y 10.5/149.5, serve held 16 ticks then straight
at TYLER).

## Gotchas

- **Schema copies**: Dockerfiles copy `shared/schema/PongAPISchema.json` over
  `js_packages/dw/state-machine/lib/PongAPISchema.json`; keep the lib copy identical for local dev. Python validates
  per topic and silently drops messages that don't conform (e.g. `game/state` values missing from the enum); the JS
  `PongAPI` currently validates nothing (`validate({ topic: message })` uses a literal key).
- **Python MQTT**: paho-mqtt 1.6 runs callbacks on its network thread; an uncaught exception there kills the thread
  while the process stays up, so Docker never restarts it.
- **Gameboard stack**: React 19, R3F 9, drei 10, three 0.180, built with `react-scripts` 5 (the ejected `config/` and
  `scripts/` folders are unused leftovers). `index.js` uses StrictMode, so effects run twice under `npm start`: every
  MQTT observer registration needs cleanup. Keep high-frequency data (paddle/ball positions) out of React state and
  context. Only one drei `<Hud>` at render priority 1 may be mounted at a time; each one clears the canvas.
- **Rapier**: the long-standing crash ("recursive use of an object detected which would lead to unsafe aliasing in
  rust") came from touching Rapier bodies that React had already removed; Rapier is being replaced by a plain-JS
  physics module (see `PROGRESS.md`).
- **Audio**: kiosk Firefox profiles need `media.autoplay.default=0`; otherwise TYLER's clips never play and the game
  never leaves the intro.
- **Builds**: `.env` files are baked into the CRA images (`REACT_APP_MQTT_PORT=9001`; the broker host defaults to the
  page's hostname). Dockerfiles copy `modules/shared` to `/src/shared` next to `/src/<app>` so `file:../shared/...`
  resolves like local dev, then `npm ci` from the committed lockfile. react-scripts 5 needs TypeScript ^4: keep
  `typescript@^4.9.5` pinned, because npm otherwise resolves TypeScript 7, which breaks CRA's ESLint.
  Use `TAG=local` with compose builds so locally built images never mix with old pulled `:next` images.

## Exhibit twin

`discovery-world-pong-twin` is a development twin of the exhibit. It may be running the stable v1.2.1 stack from
`~/Discovery-World-Pong` (compose project `discovery-world-pong`), which uses the same container names and ports as
this repo; stop it before `docker compose up` here, and restore it with
`cd ~/Discovery-World-Pong && TAG=1.2.1 docker compose --profile prod up -d`. Pushes from this checkout use a repo-local
deploy key (`git config core.sshCommand`); don't change the global `dw_deploy` setting in `~/.gitconfig`, which the
CI deploy relies on.

## Branching and CI

Trunk-based on `main`, with `feature/…`, `bugfix/…`, `release/x.y.z` and `archive/…` branches (docs/CONTRIBUTING.md).
`.github/workflows/build-and-push.yml` builds every module image on each push (tags: sha, branch, `pr-N`, `next` on
`main`, semver on `release/x.y.z`); `deploy-dev.yml` deploys `main` to the physical twin; `deploy-prod.yml` is manual.
