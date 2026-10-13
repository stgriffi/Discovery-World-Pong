# PROGRESS — Discovery World Pong stabilization

Started 2026-10-12 on the dev twin (`discovery-world-pong-twin`), on Scott's fork (`stgriffi/Discovery-World-Pong`).
Goals in order: (1) no crashes, (2) reliable state machines, (3) lag-free sound, (4) round timer, (5) make TYLER play
the way it was trained; retrain only if it's still too easy.

**Status (2026-10-13): all five phases are done, verified on the twin, and merged to `main`.** What's left needs a
person: hardware checks with the depth camera, sign-off on the real screens, and the retraining decision.

## Verification on the twin

| Run | Setup | Result |
|---|---|---|
| Phase 1 soak | new gameboard + TYLER, bot paddles, 5 s rounds, 30% walk-aways | 40 games (31 completed, 9 walk-aways), 55 min, **no failures**, no page errors, `game/play` 60 msg/s |
| Integrated soak | all phases + real GPU AI playing TYLER | 15 games (11 completed, 4 walk-aways), **no failures** |
| AI evaluation | all phases, real AI, 30 s rounds, 5 full games | **no failures**; levels exactly 30 s + countdown; numbers below |
| Physics trace | `pongSim.js` vs the original training `pong.py` | identical over 7,400 ticks (≤ 1e-9) |
| AI frame check | AI renderer vs training renderer, 2000 random states | **2000/2000** identical (old AI code: 0/2000) |
| Unit tests | gameboard 128, TYLER 10, human paddle 52, Python PongAPI 11 | all passing |
| Hardware smoke test | rewritten human paddle on the real D435 | camera starts, state + 13 fps depth feed published, clean shutdown |

Screenshots of every stage (gameboard + TYLER): `tools/soak/results/shot-*.png` (untracked; regenerate with
`node tools/soak/screenshots.mjs --no-top-bot`).

### TYLER's AI: before vs after the input fixes (same bots, same seed, 30 s rounds)

| Level (model) | Old AI rally returns | Old AI serves | Fixed AI rally returns | Fixed AI serves |
|---|---|---|---|---|
| 1 (5000) | 21% (6/28) | 90% | 43% (15/35) | 100% |
| 2 (15000) | 8% (2/24) | 76% | 58% (23/40) | 100% |
| 3 (22850) | 25% (18/71) | 74% | 43% (48/113) | 100% |

Longest rally: old 5 hits, fixed 15. The old AI also always used the hardest model. The fixes roughly doubled TYLER's
returns, but it still misses more than half of rally shots against a competent bot — see "Next steps".

## Needs you

- **Depth camera with a person**: start `human-paddle-control` (see below), stand on the mark: "ready" after ~1.7 s
  still, the paddle should follow you smoothly while moving, and walking away for ~4 s should end the game.
  On this twin the camera sees an object within 2 m (top centre of its view) and reports a player with nobody there,
  so I left `human-paddle-control` stopped; the exhibit floor must be clear within 2 m apart from the player.
- **Sign-off on the real screens**: paddles sit 7.5 px further in (the training rows), the board is drawn 4% wider so
  the ball's edge meets the border, the round timer sits under LEVEL, sound volumes, left/right wall sounds.
- **Retraining decision** (see "Next steps").

## Twin state right now

- Running (compose project `pong`, `TAG=local`): `mqtt-broker`, `gameboard` (:5000), `tyler` (:5003),
  `ai-paddle-control` (GPU). `human-paddle-control` stopped (see above). Kiosk windows are not open:
  run `/opt/pong/setup/open_windows_pt.sh` (or log out and back in) to put the screens up.
- The v1.2.1 containers were removed (images kept). Nothing runs `docker compose` at boot — containers come back
  through Docker's restart policy — so **a reboot brings back this v2 stack, not v1.2.1**. To go back to v1.2.1:
  ```bash
  cd ~/pong-scott && COMPOSE_PROJECT_NAME=pong docker compose --profile dev --profile top-player-ai-gpu --profile bottom-player-depth down
  cd ~/Discovery-World-Pong && TAG=1.2.1 docker compose --profile prod up -d
  ```
- Start the depth camera: `cd ~/pong-scott && COMPOSE_PROJECT_NAME=pong TAG=local docker compose --profile bottom-player-depth up -d human-paddle-control`
- Kiosk Firefox profiles now carry autoplay prefs in `user.js` (written by `setup/create_profiles.sh`).

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
- **Builds**: Node 22, lockfiles + `npm ci`, TypeScript pinned to 4.9 (npm resolved TypeScript 7, breaking CRA),
  source maps on; human-paddle image fixed for RealSense's new apt signing key.
- **Tools**: `tools/soak` (end-to-end soak + AI evaluation + screenshots), `tools/physics-trace`, `tools/ai-check`.

## Next steps (suggested)

1. **Make TYLER harder.** Options, cheapest first:
   - Faster TYLER paddle or a wider TYLER paddle at deployment (the training config even has
     `DEPLOYMENT_PADDLE_ADVANTAGE` for this) — minutes of work, tunable per level.
   - Retrain with the original training code (`~/Discovery-World-Pong`, branch `origin/archive/non-containerized`:
     `DiscoveryWorldPongAIExhibit/reinforcement_selfplay.py` and `.../exhibit/train/simulator.py`), on this twin's
     RTX 3090. The gameboard physics now
     match that environment exactly, so new models will transfer. `tools/soak` measures the result.
   - Optional exactness: the AI echoes `frame` so the gameboard applies each decision 3 ticks after its frame, as in training.
2. Neural-net visualizer is blank in v2 (nothing publishes `game/level`/`ai/activation`; it also has label-order and
   level-mapping bugs and weights from different models).
3. `.github/workflows/deploy.yml` runs `docker compose up` without a profile (starts nothing); the CI builds push to
   `ghcr.io/aaron97neu`, which fails from this fork.
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

## Log

- 2026-10-12 — Investigation and plan approved. Deploy key added; push verified. CLAUDE.md and this file created.
- 2026-10-12 — Phase 0 done. Phase 1: physics (trace-verified), shared hardening, GameController, React rewrite.
  v1.2.1 stack stopped on the twin; v2 running for soak tests. Phases 2–5 landed on stacked branches with tests.
- 2026-10-13 — 40-game soak clean; Phase 1 merged. Full stack + GPU AI deployed. The integration run caught two
  issues, both fixed: retained paddle states lost before the async MQTT connect, and the timer covering TYLER's
  paddle. Human-paddle image fixed (RealSense apt key). Integrated soak clean; AI evaluated (A/B above).
  All branches merged to `main`.
