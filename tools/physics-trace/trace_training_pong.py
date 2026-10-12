"""Record a tick-by-tick trace of the original MSOE training physics.

Runs the training environment's own pong.py (fetched from git history by run.sh) on
scripted inputs and prints a JSON fixture. modules/gameboard/src/game/__tests__/
pongSim.trace.test.js replays the same inputs through pongSim.js and requires the
same ball, paddle and score values.

Usage: tools/physics-trace/run.sh  (needs git and docker)
"""
import json
import random
import sys
import types

src_dir = sys.argv[1]
sys.path.insert(0, src_dir)

# pong.py imports `keyboard` (for manual play) and shared.utils.Timer; neither affects physics.
sys.modules["keyboard"] = types.SimpleNamespace(is_pressed=lambda key: False)
utils = types.ModuleType("shared.utils")


class Timer:
    @staticmethod
    def start(name):
        pass

    @staticmethod
    def stop(name):
        pass


utils.Timer = Timer
sys.modules["shared.utils"] = utils

from pong import Pong  # noqa: E402


def snapshot(env):
    ball = env.ball
    return [
        env.frames,
        ball.x, ball.y, ball.velocity[0], ball.velocity[1], ball.speed,
        bool(ball.up), ball.delay_counter,
        env.top.x, env.bottom.x, env.score_top, env.score_bottom,
    ]


def run(name, ticks, choose_inputs):
    env = Pong()
    inputs, checkpoints = [], []
    prev_key = None
    for i in range(ticks):
        top_action, bottom_action, motion = choose_inputs(env, i)
        inputs.append([top_action, bottom_action, motion])
        env.step(bottom_action, top_action, frames=1, motion_position=motion)
        snap = snapshot(env)
        # Keep every tick where direction, speed or score changed, plus every 10th tick.
        key = (snap[3] > 0, snap[4] > 0, snap[5], snap[10], snap[11], snap[7] == 0)
        if key != prev_key or i % 10 == 0 or i < 40:
            checkpoints.append([i] + snap)
        prev_key = key
    return {"name": name, "ticks": ticks, "inputs": inputs, "checkpoints": checkpoints}


def idle(env, i):
    return "NONE", "NONE", None


def make_random(seed):
    rng = random.Random(seed)
    state = {"top": "NONE", "motion": 0.5}

    def choose(env, i):
        if i % 5 == 0:  # TYLER-style decisions every 5 ticks
            state["top"] = rng.choice(["LEFT", "RIGHT", "NONE"])
        state["motion"] = min(1.0, max(0.0, state["motion"] + rng.uniform(-0.03, 0.03)))
        return state["top"], "ABSOLUTE", state["motion"]

    return choose


def make_tracker(seed):
    rng = random.Random(seed)
    state = {"top": "NONE", "queue": [], "offset": 0.0}

    def choose(env, i):
        ball = env.ball
        if i % 5 == 0:
            if ball.x < env.top.x - 3:
                action = "LEFT"
            elif ball.x > env.top.x + 3:
                action = "RIGHT"
            else:
                action = "NONE"
            state["queue"].append((i + 3, action))  # applied 3 ticks late, like training
            state["offset"] = rng.uniform(-12, 12)  # varies the human hit position
        while state["queue"] and state["queue"][0][0] <= i:
            state["top"] = state["queue"].pop(0)[1]
        motion = min(1.0, max(0.0, (ball.x + state["offset"]) / 192.0))
        return state["top"], "ABSOLUTE", motion

    return choose


scenarios = [
    run("idle", 400, idle),
    run("random", 3000, make_random(1234)),
    run("tracker", 4000, make_tracker(42)),
]
json.dump({
    "source": "git show 670d82c:src/game/pong.py (training physics)",
    "fields": ["frames", "x", "y", "vx", "vy", "speed", "up", "delay",
               "topX", "bottomX", "scoreTop", "scoreBottom"],
    "scenarios": scenarios,
}, sys.stdout, separators=(",", ":"))
