# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Rockwell Automation "Pong" exhibit at Discovery World (Milwaukee). A visitor plays Pong by moving left/right in
front of an Intel RealSense D435 depth camera against **TYLER**, a neural-network opponent trained MSOE-style
("Pong from pixels" REINFORCE). It is a set of Docker services that talk over MQTT; the browser UIs run in Firefox
kiosk windows on four monitors. The 2026 stabilization work (Rapier removal, state machines, audio, AI fidelity) is
tracked in `PROGRESS.md`.

## Services (`modules/`)

| Module | Port | Role |
|---|---|---|
| `gameboard` | 5000 | Game screen (React Three Fiber) on a plain-JS game core: physics, in-level gameplay, level clock, HUD, music and sound effects. Publishes `game/play`, `game/stats` and most game-flow transitions. |
| `human-visualizer` | 5001 | Depth-camera heatmap (static page, subscribes `depth/feed`). |
| `neural-net-visualizer` | 5002 | Draws TYLER's network live (static page): `game/level` picks the network (blank at 0, between games), `ai/activation` animates it. Its weight files are exported from the AI's model files during the image build (`export_weights.py`). |
| `tyler` | 5003 | TYLER character + voice clips (React). Narrates and drives the intro/level-intro/outro transitions. |
| `web-paddle-control` | 5004 / 5005 | Dev-only button paddles (top / bottom), built twice from one image with `REACT_APP_PADDLE_ID`. |
| `single-screen-development` | 5006 | Dev dashboard (Vite/TS) showing all screens in iframes plus logs. |
| `mqtt-broker` | 1883, ws 9001 | Mosquitto, anonymous. Browsers connect to `ws://<page host>:9001`. |
| `ai-paddle-control` | – | Python/TF top paddle (TYLER's AI). |
| `human-paddle-control` | – | Python bottom paddle from the RealSense camera; also publishes `depth/feed`. |
| `log-server` | – | Streams every container's docker logs to MQTT `docker/logs/<name>`. |

`modules/shared/`: `schema/PongAPISchema.json` (canonical MQTT schema), `js_packages/dw/state-machine` (`PongAPI`,
`Topics`, `createBaseGameStateMachine`) and `js_packages/dw/audio` (Web Audio engine) — consumed by the JS apps as
`file:` dependencies — `py_packages/dw` (Python `PongAPI`, `Topics`, `Config`) and `validation/*.h5` (AI weights;
`Config.AI_MODELS` names the one used for each level, for both the AI and the NN visualizer's build).

## Commands

All services build in Docker; every compose service has a profile, so a bare `docker compose up` starts nothing.
Profiles: `dev`, `prod`, `top-player-ai-gpu`, `top-player-ai-cpu`, `bottom-player-depth` (the README's
`top-player-web`/`bottom-player-web` don't exist — the web paddles are in `dev`). Use `TAG=local` so locally built
images never mix with old pulled `:next` images, and `COMPOSE_PROJECT_NAME=pong` on the twin (it owns `pong-network`).

```bash
export TAG=local COMPOSE_PROJECT_NAME=pong
docker compose --profile dev up -d --build mqtt-broker tyler gameboard      # core stack for testing
docker compose --profile dev --profile top-player-ai-gpu --profile bottom-player-depth up -d --build   # like the exhibit
docker compose --profile dev build --build-arg CERTS=zscaler                # behind Rockwell's ZScaler proxy
docker exec mqtt-broker mosquitto_sub -v -t '#'                              # watch MQTT (or mqtt-explorer on :4000)
./setup/open_windows.sh / ./setup/close_windows.sh                           # kiosk windows (monitor-layout specific)
./setup/create_profiles.sh                                                   # kiosk Firefox profiles + autoplay prefs
```

JS apps (Node 22 LTS via nvm, see `.nvmrc`; in non-interactive shells run `. ~/.nvm/nvm.sh` first):

```bash
cd modules/gameboard && npm ci                                    # same for modules/tyler, modules/web-paddle-control
REACT_APP_MQTT_BROKER=localhost npm start                         # needs the mqtt-broker container running
CI=true npx react-scripts test --watchAll=false                   # all tests
CI=true npx react-scripts test --watchAll=false src/game/__tests__/pongSim.test.js -t "serve"   # one test
npm run build
```

Gameboard URL knobs: `?round=5` (5 s levels), `?watchdogScale=0.2` (shorter waits for TYLER's transitions).

Python tests run in throwaway containers (host `python3` lacks pip/venv):

```bash
docker run --rm -v "$PWD/modules/human-paddle-control:/w:ro" -w /w python:3.10-slim \
  sh -c "pip install -q numpy pytest && python -B -m pytest -q -p no:cacheprovider tests"
docker run --rm -v "$PWD/modules/shared:/w:ro" -w /w/py_packages python:3.8-slim \
  sh -c "pip install -q paho-mqtt==1.6.1 jsonschema==4.23.0 pytest && python -B -m pytest -q -p no:cacheprovider tests"
```

End-to-end and physics tools:

```bash
cd tools/soak && npm ci && npx playwright install firefox         # once
node soak.mjs --games 20 --round 5 --exit-rate 0.3                # full games via MQTT bots + real pages in Firefox
node soak.mjs --no-top-bot --human-skill perfect --exit-rate 0 --minutes 20   # TYLER's return rate per level (AI running)
tools/physics-trace/run.sh                                        # regenerate the training-physics fixture
```

## Game flow across services

- **Exhibit state machine** (`shared/js_packages/dw/state-machine/lib/BaseGameStateMachine.js`):
  `stopped → idle → intro → moveIntro → level1Intro → level1 → level2Intro → level2 → level3Intro → level3 → outro → idle`.
  `player_exit` is legal from every in-game state except the outro; `reset` from any state; `move_intro_complete`
  only from `moveIntro`. Apart from `game_complete`/`reset`, each transition is legal from exactly one state, so
  duplicated or late messages are no-ops. The gameboard **and** TYLER each run an instance driven only by
  `game/state` `{"transition": ...}` messages — never transition locally; publish and let the broker echo drive you.
- **Who publishes what**: gameboard → `reset` (once, on its first MQTT connect — TYLER must not, so a narrator reload
  can't abort a game), `player_ready`, `player_exit`, `level1_complete`/`level2_complete` (30 s game clock from the
  serve), `level3_complete` (L3 is sudden death: TYLER's first point ends it; hidden 150 s cap), and watchdog
  copies of TYLER's transitions if TYLER stays silent. TYLER → `intro_complete`, `move_intro_complete`,
  `level1/2/3_intro_complete`, `game_complete` when its clips finish (with its own timeout fallback). For the
  neural-net visualizer: gameboard → `game/level` (retained; 1–3 from each level intro, 0 in idle), AI →
  `ai/activation` after every decision (`[frame difference 80×96, hidden 200, outputs left/right/none]`).
- **Starting and ending games**: a game starts only when the bottom paddle *becomes* `ready` after idle began, the
  top paddle is `ready`/`start`, and a cooldown has passed (3 s after page load, 5 s after a game). A paddle state
  `stop` ends the game. The human paddle sends `stop` after 4 s without a player; both Python paddles set an MQTT
  Last Will of `stop`, so a crashed container ends the game instead of leaving a stale "ready".
- **Gameboard → AI contract**: `game/play` = `{ball:{position:{x,y}}, paddle_top/paddle_bottom:{position:{x∈[0,1]}},
  frame}` once per 60 Hz physics tick, unrounded, during level play. World is 192×160, origin at center, +y up, top
  paddle = TYLER; paddle x maps as `192·p`. TYLER's AI decides on `frame % 5 == 0` and publishes a target position;
  the gameboard moves TYLER's paddle toward it at 6 px/tick (training speed).

## Gameboard architecture (`modules/gameboard/src`)

- `game/pongSim.js` — deterministic physics ported line-by-line from the training environment
  (`git show 670d82c:src/game/pong.py`): swept paddle collisions, the 7-segment bounce table with Python
  negative indexing and round-half-even (`pyMath.js`), +0.2 px/tick per volley, the 17-tick serve. Verified tick for
  tick by `pongSim.trace.test.js` against a fixture recorded from the original Python. Don't "fix" its quirks — TYLER
  was trained on them.
- `game/GameController.js` — owns the exhibit state machine, the gameplay machine (`inactive → levelIntro →
  countdown → serve → rally → pointPause → … → levelOver | gameOver`), every timer (a timer bag cleared on each state
  change), MQTT, and a small UI store. Plain JS: test it with the fake broker in `src/test-utils/fakeBroker.js`.
- `runtime.js` — creates the MQTT client, audio, error reporter and controller once at module load.
- `scene/`, `hud/` — rendering only. Everything stays mounted for the life of the page and is shown/hidden with
  `visible`; there is exactly one drei `<Hud>` (each one at priority 1 clears the canvas). Ball/paddles are
  positioned in one `useFrame` from `controller.getRenderState()`; no high-frequency data in React state.
- `audio/` — maps game events to `dw-audio` clips (volumes from `audio_files/Audio Intent_Excel.xlsx`).
- `errorReporter.js` — uncaught errors → MQTT `app/logs/gameboard`; capped auto-reload on render failure or error bursts.

TYLER (`modules/tyler/src`) follows the same pattern: `TylerController.js` + `tylerScript.js` (per-state face, text,
clips, transition), `runtime.js` singletons, `voice.js` on `dw-audio`.

## Gotchas

- **Schema copies**: Dockerfiles copy `shared/schema/PongAPISchema.json` over
  `js_packages/dw/state-machine/lib/PongAPISchema.json`; keep them identical (a gameboard test checks this, and that
  the `game/state` enum matches the state machine). JS and Python both validate per topic now and drop
  non-conforming messages — add new transitions to the enum or they will be dropped.
- **Shared JS packages** have no `node_modules`; their imports (`mqtt`, `ajv`, `uuid`, `javascript-state-machine`)
  resolve from each app's `node_modules` (CRA's webpack fallback; Jest via `moduleNameMapper` in package.json). `ajv`
  is v6 in some apps and v8 in others — keep `PongAPI`'s use to the constructor + `compile`.
- **react-scripts 5 needs TypeScript ^4**: keep `typescript@^4.9.5` pinned; npm otherwise resolves TypeScript 7,
  which breaks CRA's ESLint and fails the build.
- **Python MQTT**: paho-mqtt 1.6 runs callbacks on its network thread; `dw.state_machine.PongAPI` catches callback
  exceptions (an uncaught one used to kill the thread silently). The AI image runs Python 3.8 — keep shared Python 3.8-compatible.
- **Human paddle**: decisions live in `presence.py` (pure, unit-tested); `blob.py` keeps the original blob algorithm.
- **Audio/autoplay**: kiosk profiles need the prefs written by `setup/create_profiles.sh`. If audio is blocked,
  sound effects are skipped and TYLER/gameboard fallbacks keep the game moving.
- **CRA env**: `.env` files are baked into the images (`REACT_APP_MQTT_PORT=9001`; broker host defaults to the
  page's hostname). Source maps are on so browser stack traces point at original files.

## Exhibit twin

`discovery-world-pong-twin` is a development twin of the exhibit. It may be running the stable v1.2.1 stack from
`~/Discovery-World-Pong` (compose project `discovery-world-pong`), which uses the same container names and ports as
this repo; stop it before `docker compose up` here, and restore it with
`cd ~/Discovery-World-Pong && TAG=1.2.1 docker compose --profile prod up -d`. Pushes from this checkout use a repo-local
deploy key (`git config core.sshCommand`); don't change the global `dw_deploy` setting in `~/.gitconfig`, which the
CI deploy relies on. The original training code lives in that checkout on branch `origin/archive/non-containerized`.

## Branching and CI

Trunk-based on `main`, with `feature/…`, `bugfix/…`, `release/x.y.z` and `archive/…` branches (docs/CONTRIBUTING.md).
`.github/workflows/build-and-push.yml` builds every module image on each push (tags: sha, branch, `pr-N`, `next` on
`main`, semver on `release/x.y.z`); `deploy-dev.yml` deploys `main` to the physical twin; `deploy-prod.yml` is manual.
