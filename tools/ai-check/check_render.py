"""Golden check: the AI's frame drawing vs the training environment's top-only render."""
import random, sys, types
import numpy as np
import cv2

sys.path.insert(0, '/check/training')
sys.modules['keyboard'] = types.SimpleNamespace(is_pressed=lambda k: False)
utils = types.ModuleType('shared.utils')
utils.Timer = type('Timer', (), {'start': staticmethod(lambda n: None), 'stop': staticmethod(lambda n: None)})
sys.modules['shared.utils'] = utils
from pong import Pong  # training environment (670d82c)

sys.path.insert(0, '/app/src')
from ai_subscriber import AISubscriber  # the deployed AI
from dw import Config

def preprocess(img):  # training utils.preprocess_custom
    state = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = state.shape
    state = cv2.resize(state, (w // 2, h // 2))
    state[state < 250] = 0
    state[state == 255] = 1
    return state.astype(float)

env = Pong()
ai = AISubscriber(Config.instance())
rng = random.Random(7)
mismatches = 0
for i in range(2000):
    x_t, y_t, paddle = rng.uniform(0, 192), rng.uniform(-4, 164), rng.uniform(6, 186)
    env.top.x, env.ball.x, env.ball.y = paddle, x_t, y_t
    expected = preprocess(env.render(top_only=True))
    # What the AI receives on MQTT from the gameboard, and converts back.
    msg = {'ball': {'position': {'x': x_t - 96, 'y': 80 - y_t}},
           'paddle_top': {'position': {'x': paddle / 192}}, 'paddle_bottom': {'position': {'x': 0.5}}}
    ai.puck_x = msg['ball']['position']['x'] + 96
    ai.puck_y = 80 - msg['ball']['position']['y']
    ai.top_paddle_x = msg['paddle_top']['position']['x'] * 192
    actual = ai.render_latest_preprocessed()
    if not np.array_equal(expected, actual):
        mismatches += 1
        if mismatches <= 3:
            print('mismatch at', (x_t, y_t, paddle), 'differing pixels:', int((expected != actual).sum()))
print(f'{2000 - mismatches}/2000 frames identical to the training render')
