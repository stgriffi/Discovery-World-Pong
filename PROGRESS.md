# PROGRESS — Discovery World Pong stabilization

Started 2026-10-12 on the dev twin (`discovery-world-pong-twin`), on Scott's fork (`stgriffi/Discovery-World-Pong`).
Goals in order: (1) no crashes, (2) reliable state machines, (3) lag-free sound, (4) round timer, (5) make TYLER play
the way it was trained; retrain only if it's still too easy.

## Branches

Each phase is a branch stacked on the previous one; they merge into `main` in this order once verified:

| Branch | Phase | State |
|---|---|---|
| `feature/ball-bugfix` | 0–1: foundations, new physics + game core, Rapier removed | soak test running |
| `feature/game-flow` | 2: TYLER, human paddle, Python PongAPI, Last Wills, web paddle | code + unit tests done |
| `feature/audio` | 3: Web Audio engine, sound effects, music loops, kiosk prefs | code + unit tests done |
| `feature/round-timer` | 4: round timer HUD | code done |
| `feature/ai-fidelity` | 5: AI input fidelity, evaluation stats, docs | code done; AI image building |

## Status

- [x] **Phase 0 — Foundations**: push access, CLAUDE.md, Node 22, reproducible Docker builds (TypeScript pinned to 4.9,
      broken drei import removed, lockfile, `npm ci`), source maps, audio players created once, MP3s.
- [x] **Phase 1 — Gameboard rewrite** (`feature/ball-bugfix`)
  - [x] `pongSim.js` physics, matching the training environment tick-for-tick (7,400 ticks vs the original Python)
  - [x] Shared `PongAPI` + base state machine hardening, schema fixes
  - [x] `GameController` (game flow, gameplay machine, timers, MQTT)
  - [x] React rewrite: always-mounted scene, one HUD, preloaded assets, error reporting + capped auto-reload; Rapier removed
  - [x] First live soak on the twin: 3 games, no failures
  - [ ] 40-game soak (running), then merge to `main`
- [x] **Phase 2 — Game flow across services** (`feature/game-flow`)
  - [x] TYLER: `TylerController` with per-clip fallbacks, so a blocked/failed clip can't freeze the game
  - [x] human-paddle-control: streams positions every frame in a game, `stop` after 4 s away (`presence.py`, `blob.py`)
  - [x] Python `PongAPI`: callback exceptions contained, validators compiled once, no NaN, async connect, Last Will
  - [x] Last Will `stop` for both Python paddles; AI busy loop removed; web paddle mount-order bug fixed
  - [x] Gameboard publishes `game/stats` (TYLER's faces react to scoring)
- [x] **Phase 3 — Lag-free audio** (`feature/audio`): `dw-audio` Web Audio engine; paddle/wall/score/defeat sounds;
      looping music; activation sound on player detection; `create_profiles.sh` writes autoplay prefs (applied on the twin)
- [x] **Phase 4 — Round timer HUD** (`feature/round-timer`): 0:30 countdown (red for the last 5 s), SUDDEN DEATH in L3
- [ ] **Phase 5 — AI** (`feature/ai-fidelity`)
  - [x] Own paddle drawn at the training row, training midline, 30 px per decision, per-level models, frame-aligned
        decisions, warm-up; TensorFlow GPU memory growth
  - [x] Soak tool reports TYLER's return rate per level
  - [ ] Run the AI against the soak bots and record return rates; decide on retraining

Tests: gameboard `CI=true npx react-scripts test --watchAll=false` (128), TYLER (10), human paddle pytest (52),
Python PongAPI pytest (8), plus `tools/soak` end-to-end runs.

## Needs you

- Depth-camera checks with a person in front of the RealSense: the paddle should follow you smoothly while moving,
  and walking away for ~4 s should end the game.
- Visual/audio sign-off on the real kiosk screens: paddles sit 7.5 px further in (the training rows), the board is
  drawn 4% wider so the ball's edge meets the border, the round timer placement, sound volumes and left/right walls.
- Decide on retraining once the Phase 5 evaluation numbers are in.

## Decisions (confirmed 2026-10-12)

- Replace @react-three/rapier with a deterministic 2D physics module; keep React Three Fiber for graphics.
- Physics copies the MSOE training environment (`git show 670d82c:src/game/pong.py`) so TYLER sees what it was trained on.
- Rounds: L1 30 s, L2 30 s, L3 sudden death (TYLER's first point ends the game).
- Fix human-paddle-control too; for the AI, fix input mismatches first and evaluate before retraining.
- Commit + push as I go; merge to `main` once each phase is verified.

## Design changes adopted during implementation

- Serve hold is 17 ticks (the exact training behavior), not 16.
- `game/play` carries unrounded ball coordinates plus a `frame` tick id, one message per 60 Hz physics tick.
- Walls keep the training rule (ball *center* clamped to the board); the board is drawn 200 px wide so the border
  lines up with the ball's edge. Paddles are clamped inside the border.
- TYLER's paddle chases the AI's latest target at ≤ 6 px/tick. (Possible later refinement: the AI echoes `frame` so
  the gameboard applies each decision exactly 3 ticks after its frame, as in training.)
- The "both paddles report start" dev shortcut is removed: `move_intro_complete` is only legal from `moveIntro`.
- Only the gameboard publishes `reset`; TYLER won't (a narrator reload mustn't abort a visitor's game).
- Restart rule: a game starts only on a paddle *becoming* ready after idle began, after a 5 s cooldown. A player who
  stays gets a new game after the welcome screen (like v1.2.1).
- The level clock counts physics ticks from the serve; L3 has a hidden 150 s safety cap.
- Shared FSM/schema/PongAPI fixes moved into Phase 1 (the controller depends on them).
- Docker builds use Node 22 (Node 20 reached end-of-life in April 2026).
- `player_exit` is not accepted during the outro, so a player leaving doesn't cut TYLER's goodbye short.

## Root cause of the crash (short version)

Rapier (Rust→WASM) panics when JS touches a rigid body React already removed. The panic leaves a borrow flag set, so
every later `world.step()` throws "recursive use of an object detected which would lead to unsafe aliasing in rust".
react-three-rapier never clears forwarded object refs on unmount, `ballRef` lived in a context that outlives
`GamePlay`, and `GamePlay` (with all bodies) is unmounted and remounted between games.

## Other notable findings

- The original training code survives in `~/Discovery-World-Pong`, branch `origin/archive/non-containerized`
  (`reinforcement.py`, `reinforcement_selfplay.py`, `exhibit/train/simulator.py`): TYLER decided every 5 ticks, each
  action applied 3 ticks later at 6 px/tick. Retraining is feasible if needed.
- TYLER's MP3 clips are newer edits than the WAVs (slightly different durations); the unused WAVs are still in the repo.
- The neural-net visualizer is blank in v2 (nothing publishes `game/level`/`ai/activation`) and has its own bugs
  (level mapping, label order, weights from a different model) — not addressed yet.
- `.github/workflows/deploy.yml` runs `docker compose up` without a profile, which starts nothing — not addressed.

## Log

- 2026-10-12 — Investigation and plan approved. Deploy key added; push verified. CLAUDE.md and this file created.
- 2026-10-12 — Phase 0 done. Phase 1: physics (trace-verified), shared hardening, GameController, React rewrite.
  v1.2.1 stack stopped on the twin; v2 (broker, TYLER, new gameboard) running for soak tests. First soak clean.
- 2026-10-12 — Phases 2–5 code landed on stacked branches with unit tests; 40-game soak in progress.
