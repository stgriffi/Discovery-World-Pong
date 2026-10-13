# PROGRESS — Discovery World Pong stabilization

Started 2026-10-12 on the dev twin (`discovery-world-pong-twin`), on Scott's fork (`stgriffi/Discovery-World-Pong`).
Goals in order: (1) no crashes, (2) reliable state machines, (3) lag-free sound, (4) round timer, (5) make TYLER play
the way it was trained; retrain only if it's still too easy.

**Status (2026-10-13): all five phases are done, verified on the twin, and merged to `main`.** Scott tested the
depth camera hands-on ("the game is working great"); TYLER's difficulty stays as it is unless Discovery World asks
for a change; the neural-net visualizer works again; CI on the fork is green.

## Verification on the twin

| Run | Setup | Result |
|---|---|---|
| Phase 1 soak | new gameboard + TYLER, bot paddles, 5 s rounds, 30% walk-aways | 40 games (31 completed, 9 walk-aways), 55 min, **no failures**, no page errors, `game/play` 60 msg/s |
| Integrated soak | all phases + real GPU AI playing TYLER | 15 games (11 completed, 4 walk-aways), **no failures** |
| AI evaluation | all phases, real AI, 30 s rounds, 5 full games | **no failures**; levels exactly 30 s + countdown; numbers below |
| Physics trace | `pongSim.js` vs the original training `pong.py` | identical over 7,400 ticks (≤ 1e-9) |
| AI frame check | AI renderer vs training renderer, 2000 random states | **2000/2000** identical (old AI code: 0/2000) |
| Unit tests | gameboard 129, TYLER 10, human paddle 52, Python PongAPI 12 | all passing |
| Hardware smoke test | rewritten human paddle on the real D435 | camera starts, state + 13 fps depth feed published, clean shutdown |
| Camera test with Scott | kiosk windows on all four screens, real camera + AI, 13 games | positions 27–30/s over the full width; every walk-away ended the game exactly 4.0 s after the camera lost the player; short steps out (0.5–3.2 s) never did; cooldowns as designed; no errors from the gameboard or TYLER |
| Neural-net visualizer | real AI, kiosk window | exported weights match TensorFlow's (≤ 5e-4 relative); draws the ball, active neurons and output probabilities in the right order during play; blank between games; `ai/activation` 12/s, ~24 KB |

Screenshots of every stage (gameboard + TYLER): `tools/soak/results/shot-*.png` (untracked; regenerate with
`node tools/soak/screenshots.mjs --no-top-bot`).

### TYLER's AI: before vs after the input fixes (same bots, same seed, 30 s rounds)

| Level (model) | Old AI rally returns | Old AI serves | Fixed AI rally returns | Fixed AI serves |
|---|---|---|---|---|
| 1 (5000) | 21% (6/28) | 90% | 43% (15/35) | 100% |
| 2 (15000) | 8% (2/24) | 76% | 58% (23/40) | 100% |
| 3 (22850) | 25% (18/71) | 74% | 43% (48/113) | 100% |

Longest rally: old 5 hits, fixed 15. The old AI also always used the hardest model. Against a competent bot TYLER
still misses more than half of rally shots, but against a real player on the camera it won every game (10–4, 10–3,
16–1, 13–3), so the difficulty stays as it is.

## Waiting on

- Discovery World's view of the difficulty: retrain or tune TYLER only if they ask (options under "Next steps").

## Twin state right now

- Running (compose project `pong`, `TAG=local`): `mqtt-broker`, `gameboard` (:5000), `human-visualizer` (:5001),
  `neural-net-visualizer` (:5002), `tyler` (:5003), `ai-paddle-control` (GPU), `human-paddle-control` (D435).
  Kiosk windows are open on all four screens (`/opt/pong/setup/open_windows_pt.sh`; it closes every Firefox first).
- The camera counts whoever sits at the twin's desk (within 2 m) as a player, so games keep starting while someone
  is there. Harmless; to stop it: `cd ~/pong-scott && COMPOSE_PROJECT_NAME=pong docker compose --profile bottom-player-depth stop human-paddle-control`
  (start it again with `... up -d human-paddle-control`, plus `TAG=local`). The exhibit floor must be clear within 2 m
  apart from the player.
- The v1.2.1 containers were removed (images kept). Nothing runs `docker compose` at boot — containers come back
  through Docker's restart policy — so **a reboot brings back this v2 stack, not v1.2.1**. To go back to v1.2.1:
  ```bash
  cd ~/pong-scott && COMPOSE_PROJECT_NAME=pong docker compose --profile dev --profile top-player-ai-gpu --profile bottom-player-depth down
  cd ~/Discovery-World-Pong && TAG=1.2.1 docker compose --profile prod up -d
  ```
- Kiosk Firefox profiles carry autoplay prefs in `user.js` (written by `setup/create_profiles.sh`).

## What changed (all on `main`)

- **Crash fixed by removing Rapier.** `gameboard/src/game/pongSim.js` is a line-by-line port of the training
  physics; the scene stays mounted for the life of the page; a plain-JS `GameController` owns the game flow,
  timers and MQTT. Root cause of the old crash: Rapier (Rust→WASM) panics when JS touches a rigid body React already
  removed; react-three-rapier never clears forwarded refs on unmount, `ballRef` outlived `GamePlay`, and `GamePlay`
  (with every body) was remounted between games. The panic left a borrow flag set, so every later `world.step()`
  threw "recursive use of an object detected which would lead to unsafe aliasing in rust".
- **State machines**: one timer bag per state (no stale level timers), hard reset on idle, edge-triggered paddle
  states with a cooldown (no instant auto-restart), `reset` resync, watchdogs for TYLER's transitions, `player_exit`
  that can actually fire (human paddle sends `stop`), Last Will messages, schema/validation fixed in JS and Python.
- **TYLER** can no longer freeze the game on a blocked/failed clip (per-clip fallbacks).
- **Human paddle** streams positions every frame during a game (it used to update about every 2 s, and only while
  the player stood still).
- **Audio**: shared Web Audio engine (`dw-audio`) — sounds fire in the same frame as the event; paddle, wall, score and
  defeat sounds now play; music loops; activation sound on player detection; ~60 MB of WAV loading replaced by MP3s.
- **Round timer**: 0:30 countdown under LEVEL (red for the last 5 s), SUDDEN DEATH in level 3.
- **AI**: draws its paddle in the training row (+ midline), moves 30 px per decision, per-level models, decisions on
  the gameboard's tick counter, warm-up; TensorFlow GPU memory 908 MiB instead of ~22.8 GB.
- **Neural-net visualizer**: v2 had dropped its data. The AI publishes `ai/activation` again (as v1.2.1 did) and the
  gameboard publishes `game/level` (retained, 0 between games). Its weights were from three models that aren't in
  the repo; they're now exported from the AI's own model files during the image build (`Config.AI_MODELS` lists them
  once). Also fixed: level 1 drew the medium network and level 3 crashed the page, and the LEFT/NONE/RIGHT nodes didn't
  match the network's outputs (left, right, none); benchmark timers no longer send ~100 log messages/s over MQTT.
- **Builds**: Node 22, lockfiles + `npm ci`, TypeScript pinned to 4.9 (npm resolved TypeScript 7, breaking CRA),
  source maps on; human-paddle image fixed for RealSense's new apt signing key.
- **CI on the fork**: images build without pushing (a fork's token can't push to `ghcr.io/aaron97neu`), one module's
  failure no longer cancels the others, and the twin deploy is skipped where it isn't set up.
- **Tools**: `tools/soak` (end-to-end soak + AI evaluation + screenshots), `tools/physics-trace`, `tools/ai-check`.

## Next steps (suggested)

1. **Only if Discovery World wants TYLER harder.** Options, cheapest first:
   - Faster TYLER paddle or a wider TYLER paddle at deployment (the training config even has
     `DEPLOYMENT_PADDLE_ADVANTAGE` for this) — minutes of work, tunable per level.
   - Retrain with the original training code (`~/Discovery-World-Pong`, branch `origin/archive/non-containerized`:
     `DiscoveryWorldPongAIExhibit/reinforcement_selfplay.py` and `.../exhibit/train/simulator.py`), on this twin's
     RTX 3090. The gameboard physics now match that environment exactly, so new models will transfer; point
     `Config.AI_MODELS` at them and the visualizer follows. `tools/soak` measures the result.
   - Optional exactness: the AI echoes `frame` so the gameboard applies each decision 3 ticks after its frame, as in training.
2. Both visualizers load their MQTT client library from cdnjs, so they need internet when the page loads; bundle the
   libraries if the exhibit's network is unreliable.
3. `.github/workflows/deploy.yml` runs `docker compose up -d --build --remove-orphans` without a profile, which
   starts nothing (every service has a profile).
4. Unused WAV originals are still in the repo (only the MP3s are loaded).

## Decisions (confirmed 2026-10-12) and design changes made during implementation

- Replace @react-three/rapier with deterministic 2D physics copied from the MSOE training environment; keep R3F.
- Rounds: L1 30 s, L2 30 s, L3 sudden death (TYLER's first point ends it; hidden 150 s cap).
- Serve hold is 17 ticks (exact training behavior). `game/play` is unrounded, once per 60 Hz tick, with a `frame` id.
- Walls keep the training rule (ball *centre* clamped); the board is drawn 200 px wide to match visually.
- TYLER's paddle chases the AI's target at ≤ 6 px/tick (training speed).
- `move_intro_complete` only from `moveIntro` (the idle dev shortcut is gone); `player_exit` not accepted in the outro.
- Only the gameboard publishes `reset`; TYLER doesn't (a narrator reload mustn't abort a game).
- A game starts only on a paddle *becoming* ready after idle began, after a 5 s cooldown; a player who stays gets a
  new game after the welcome screen (like v1.2.1).
- Docker builds use Node 22 (Node 20 reached end-of-life in April 2026).
- 2026-10-13: TYLER's difficulty is fine for now (Scott); no retraining unless Discovery World asks.
- 2026-10-13: restore the neural-net visualizer. `game/level` is 1-based (0 between games), like `game/stats`.

## Log

- 2026-10-12 — Investigation and plan approved. Deploy key added; push verified. CLAUDE.md and this file created.
- 2026-10-12 — Phase 0 done. Phase 1: physics (trace-verified), shared hardening, GameController, React rewrite.
  v1.2.1 stack stopped on the twin; v2 running for soak tests. Phases 2–5 landed on stacked branches with tests.
- 2026-10-13 — 40-game soak clean; Phase 1 merged. Full stack + GPU AI deployed. The integration run caught two
  issues, both fixed: retained paddle states lost before the async MQTT connect, and the timer covering TYLER's
  paddle. Human-paddle image fixed (RealSense apt key). Integrated soak clean; AI evaluated (A/B above).
  All branches merged to `main`.
- 2026-10-13 — CI on the fork fixed (build without pushing; skip the twin deploy). Camera test with Scott passed.
  Neural-net visualizer restored and verified on the kiosk screen.
