# PROGRESS — Discovery World Pong stabilization

Started 2026-10-12 on the dev twin (`discovery-world-pong-twin`), branch `feature/ball-bugfix` (Scott's fork,
`stgriffi/Discovery-World-Pong`). Goals in order: (1) no crashes, (2) reliable state machines, (3) lag-free sound,
(4) round timer, (5) make TYLER play the way it was trained; retrain only if it's still too easy.

## Status

- [x] **Phase 0 — Foundations**
  - [x] Push access: repo-local deploy key (`~/.ssh/pong_scott_deploy`) + author Scott Griffiths
  - [x] Pre-existing staged GamePlay.js fix committed on its own (`0fa7daf`)
  - [x] CLAUDE.md, this file, Node 22 LTS via nvm (`.nvmrc`)
  - [x] Gameboard builds reproducibly again (`662371c`): TypeScript pinned to 4.9 (npm was resolving TypeScript 7,
        which crashes CRA's ESLint), nonexistent drei `GridHelper` import removed, lockfile committed, unused deps dropped
  - [x] Docker images build on `node:22-bookworm` with `npm ci`; source maps on (`32b660e`)
  - [x] Audio players created once instead of every render; MP3s instead of 60 MB of WAVs (`77dde65`)
- [ ] **Phase 1 — Gameboard rewrite**
  - [x] `pongSim.js` physics, matching the training environment tick-for-tick (`696c0de`)
  - [x] Shared `PongAPI` + base state machine hardening, schema fixes (`f8206df`)
  - [x] `GameController` (game flow, gameplay machine, timers, MQTT) with tests (`2329b89`)
  - [ ] React rewrite: always-mounted scene, single HUD, preloaded assets, Rapier removed
  - [ ] Error reporting to `app/logs/gameboard` + guarded auto-reload
  - [ ] Run on the twin (dev profile, web paddles), soak test, then merge to `main`
- [ ] **Phase 2 — Game flow across services**: TYLER timeouts, human-paddle rewrite, Python `pong_api` robustness,
      Last Will messages, web-paddle fixes
- [ ] **Phase 3 — Lag-free audio**: Web Audio for gameboard + TYLER, SFX, music loops, kiosk autoplay prefs
- [ ] **Phase 4 — Round timer HUD** (the controller already computes the clock text)
- [ ] **Phase 5 — AI input fidelity + evaluation harness**

Tests: `cd modules/gameboard && CI=true npx react-scripts test --watchAll=false` — 116 passing.

## Needs you

- Depth-camera checks with a person in front of the RealSense (Phase 2): tracking while moving, walking away ends the game.
- Visual/audio sign-off on the real kiosk screens (paddles moved 7.5 px inward to the training rows, board drawn
  4% wider so the ball's edge meets the border at a bounce, volumes).
- Decide on retraining once the Phase 5 evaluation numbers are in.

## Decisions (confirmed 2026-10-12)

- Replace @react-three/rapier with a deterministic 2D physics module; keep React Three Fiber for graphics.
- Physics copies the MSOE training environment (`git show 670d82c:src/game/pong.py`) so TYLER sees what it was trained on.
- Rounds: L1 30 s, L2 30 s, L3 sudden death (TYLER's first point ends the game).
- Fix human-paddle-control too; for the AI, fix input mismatches first and evaluate before retraining.
- Commit + push as I go; merge `feature/ball-bugfix` into `main` once Phase 1 is verified, then feature branches.

## Design changes adopted during implementation (from the design reviews)

- Serve hold is 17 ticks (the exact training behavior), not 16.
- `game/play` carries unrounded ball coordinates plus a `frame` tick id; TYLER draws the ball with `ceil()`, so
  rounding moved it by a pixel. One message per 60 Hz physics tick, independent of the display's refresh rate.
- Walls keep the training rule (ball *center* clamped to the board); the board is drawn 200 px wide instead of
  192 so the border lines up with the ball's edge. Paddles are clamped inside the border.
- TYLER's paddle chases its latest target at ≤ 6 px/tick (training speed). Applying each AI decision exactly
  3 ticks after its frame, as in training, needs a small AI change (echo `frame`) — planned for Phase 5.
- The "both paddles report start" dev shortcut is removed rather than renamed: `move_intro_complete` is now only
  legal from `moveIntro`, so a late copy can't start a game from idle.
- Only the gameboard publishes `reset` (on its first connect). TYLER won't: a narrator reload mustn't abort a
  visitor's game; the gameboard's watchdogs carry the game and `game_complete` resyncs TYLER.
- Restart rule: a game starts only on a paddle *becoming* ready after idle began, after a 5 s cooldown. A player
  who stays gets a new game after the welcome screen (like v1.2.1); a stale "ready" no longer restarts instantly.
  (A 3 s "ignore window" was considered and rejected: it would also ignore a new player stepping right in.)
- The level clock counts physics ticks from the serve (deterministic, testable) rather than wall time.
- Shared FSM/schema/PongAPI fixes moved from Phase 2 into Phase 1, because the controller depends on them.
- Docker builds use Node 22 (Node 20 reached end-of-life in April 2026).

## Root cause of the crash (short version)

Rapier (Rust→WASM) panics when JS touches a rigid body React already removed. The panic leaves a borrow flag set, so
every later `world.step()` throws "recursive use of an object detected which would lead to unsafe aliasing in rust".
react-three-rapier never clears forwarded object refs on unmount, `ballRef` lived in a context that outlives
`GamePlay`, and `GamePlay` (with all bodies) is unmounted and remounted between games.

## Other notable findings

- The original training code survives in `~/Discovery-World-Pong`, branch `origin/archive/non-containerized`
  (`reinforcement.py`, `reinforcement_selfplay.py`, `exhibit/train/simulator.py`, `exhibit/ai/model.py` with
  `train()`): TYLER decided every 5 ticks, each action applied 3 ticks later at 6 px/tick. Retraining is feasible.
- Human paddle barely moves during play: `game_state` is never updated after the TYLER rewrite (#262), so the
  1.7 s "stand still" check runs every loop and positions are only sent while the player is still.
- `player_exit` can't fire in production (no service sends paddle state `stop`).
- TYLER sends its transitions only from audio `onended` with no catch/timeout, so blocked audio freezes the game.
- TYLER's AI draws its own paddle in the wrong row, moves 20 px instead of 30, and is pinned to the hard model.
- TYLER's MP3 clips are newer edits than the WAVs (slightly different durations).
- `ai-paddle-control`'s TensorFlow grabs ~22.8 of the 3090's 24 GB by default; set `TF_FORCE_GPU_ALLOW_GROWTH`.

## Log

- 2026-10-12 — Investigation and plan approved. Deploy key added; push verified. CLAUDE.md and this file created.
- 2026-10-12 — Phase 0 done. Phase 1: physics (trace-verified against the training code), shared package
  hardening, and the GameController landed with 116 tests. Next: the React rewrite.
