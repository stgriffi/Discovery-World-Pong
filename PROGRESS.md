# PROGRESS — Discovery World Pong stabilization

Started 2026-10-12 on the dev twin (`discovery-world-pong-twin`), branch `feature/ball-bugfix` (Scott's fork,
`stgriffi/Discovery-World-Pong`). Goals in order: (1) no crashes, (2) reliable state machines, (3) lag-free sound,
(4) round timer, (5) make TYLER play the way it was trained; retrain only if it's still too easy.

## Status

- [ ] **Phase 0 — Foundations**
  - [x] Push access: repo-local deploy key (`~/.ssh/pong_scott_deploy`) + author Scott Griffiths; first push `0fa7daf`
  - [x] Pre-existing staged GamePlay.js fix committed on its own (`0fa7daf`)
  - [x] Node 20 (nvm, user-level)
  - [x] CLAUDE.md
  - [ ] Build hygiene: Node 20 Dockerfiles, gameboard lockfile, unused deps, source maps, Jest config
  - [ ] Quick stability wins: AudioPlayer created once, MP3 music, stray backtick
- [ ] **Phase 1 — Gameboard rewrite**: plain-JS physics matching MSOE training, GameController + gameplay FSM,
      always-mounted scene, PongAPI hardening, error reporting; Rapier removed; soak test; merge to `main`
- [ ] **Phase 2 — Game flow across services**: shared FSM `reset`/`skip_intro`/`playerExit`, schema + validation,
      edge-triggered paddle states, watchdogs, TYLER timeouts, human-paddle rewrite, Last Will messages
- [ ] **Phase 3 — Lag-free audio**: Web Audio for gameboard + TYLER, SFX, music loops, kiosk autoplay prefs
- [ ] **Phase 4 — Round timer HUD**: 0:30 countdown in L1/L2, "SUDDEN DEATH" in L3
- [ ] **Phase 5 — AI input fidelity + evaluation harness**

## Needs you

- Depth-camera checks with a person in front of the RealSense (Phase 2): tracking while moving, walking away ends the game.
- Visual/audio sign-off on the real kiosk screens (paddle position change, ball–wall look, volumes).
- Decide on retraining once the Phase 5 evaluation numbers are in.

## Decisions (confirmed 2026-10-12)

- Replace @react-three/rapier with a deterministic 2D physics module; keep React Three Fiber for graphics.
- Physics copies the MSOE training environment (`git show 670d82c:src/game/pong.py`) so TYLER sees what it was trained on.
- Rounds: L1 30 s, L2 30 s, L3 sudden death (TYLER's first point ends the game).
- Fix human-paddle-control too; for the AI, fix input mismatches first and evaluate before retraining.
- Commit + push as I go; merge `feature/ball-bugfix` into `main` once Phase 1 is verified, then feature branches.

## Root cause of the crash (short version)

Rapier (Rust→WASM) panics when JS touches a rigid body React already removed. The panic leaves a borrow flag set, so
every later `world.step()` throws "recursive use of an object detected which would lead to unsafe aliasing in rust".
react-three-rapier never clears forwarded object refs on unmount, `ballRef` lived in a context that outlives
`GamePlay`, and `GamePlay` (with all bodies) is unmounted and remounted between games. Details: the plan in
`~/.claude/plans/hi-claude-the-code-melodic-wombat.md` and CLAUDE.md.

## Other notable findings

- Human paddle barely moves during play: `game_state` is never updated after the TYLER rewrite (#262), so the
  1.7 s "stand still" check runs every loop and positions are only sent while the player is still.
- `player_exit` can't fire in production (no service sends paddle state `stop`); stale level timers can end a later
  game's level early; a stale `ready` restarts a game the instant one ends.
- TYLER sends its transitions only from audio `onended` with no catch/timeout, so blocked audio freezes the game.
- `useState(new AudioPlayer())` rebuilt ~60 MB of WAV audio elements on every render of the gameboard provider.
- TYLER's AI draws its own paddle in the wrong row, moves 20 px instead of 30, and is pinned to the hard model.

## Log

- 2026-10-12 — Investigation and plan approved. Deploy key added; push verified. CLAUDE.md and this file created.
