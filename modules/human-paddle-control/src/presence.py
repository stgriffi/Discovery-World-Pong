"""What the human paddle tells the rest of the exhibit, as a pure state machine.

Fed camera samples (a position in [0, 1], or None when nobody is visible) and game/state
transitions, it returns the MQTT messages to publish:

- Idle: report "ready" once a player has stood still for ~1.7 s, "not_ready" after they
  have been gone for a second. Only changes are published (retained).
- In a game: publish the position on every camera frame the player is visible. If they
  have been gone for ABSENCE_TIMEOUT_S, publish "stop" once so the gameboard ends the game.
- Outro: keep publishing positions, but never "stop", so TYLER's goodbye isn't cut off.

Previously the service ran the 1.7 s stand-still check on every pass of its loop and only
published a position when the player was standing still, so the paddle barely moved.
"""
from collections import deque

STILL_SAMPLES = 50  # ~1.7 s at 30 fps
STILL_MAX_STD = 0.06
ABSENT_BEFORE_NOT_READY_S = 1.0
ABSENCE_TIMEOUT_S = 4.0  # in a game: gone this long means the player left
GIVE_UP_AFTER_STOP_S = 10.0  # if the game hasn't ended this long after "stop", go idle
COOLDOWN_AFTER_GAME_S = 2.0  # report not_ready for at least this long after a game

IDLE, IN_GAME, OUTRO = 'idle', 'in_game', 'outro'

TO_IDLE = {'game_complete', 'player_exit', 'reset', 'start', 'stop'}
TO_OUTRO = {'level3_complete'}
TO_IN_GAME = {
    'player_ready',
    'intro_complete',
    'move_intro_complete',
    'level1_intro_complete',
    'level1_complete',
    'level2_intro_complete',
    'level2_complete',
    'level3_intro_complete',
}


def _std(values):
    mean = sum(values) / len(values)
    return (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5


class PaddlePresence:
    def __init__(self, now=0.0):
        self.phase = IDLE
        self.reported = None  # last published paddle state
        self.window = deque(maxlen=STILL_SAMPLES)
        self.last_seen = None
        self.stop_sent_at = None
        self.cooldown_until = now

    # Each method returns a list of messages: ('state', name) or ('position', x).

    def start(self, now):
        return self._report('not_ready')

    def on_transition(self, transition, now):
        if transition in TO_IDLE:
            return self._enter_idle(now)
        if transition in TO_OUTRO:
            self.phase = OUTRO
            return []
        if transition in TO_IN_GAME and self.phase != IN_GAME:
            self.phase = IN_GAME
            self.last_seen = now
            self.stop_sent_at = None
        return []

    def on_sample(self, position, now):
        if position is not None:
            self.last_seen = now

        if self.phase == IDLE:
            return self._idle_sample(position, now)

        messages = []
        if position is not None:
            messages.append(('position', position))
        if self.phase == IN_GAME:
            gone_for = now - self.last_seen if self.last_seen is not None else 0.0
            if self.stop_sent_at is None and gone_for >= ABSENCE_TIMEOUT_S:
                self.stop_sent_at = now
                messages += self._report('stop', force=True)
            elif self.stop_sent_at is not None and now - self.stop_sent_at >= GIVE_UP_AFTER_STOP_S:
                messages += self._enter_idle(now)
        return messages

    def _enter_idle(self, now):
        self.phase = IDLE
        self.window.clear()
        self.stop_sent_at = None
        self.cooldown_until = now + COOLDOWN_AFTER_GAME_S
        return self._report('not_ready', force=True)

    def _idle_sample(self, position, now):
        if position is None:
            self.window.clear()
            gone_for = now - self.last_seen if self.last_seen is not None else ABSENT_BEFORE_NOT_READY_S
            if self.reported == 'ready' and gone_for >= ABSENT_BEFORE_NOT_READY_S:
                return self._report('not_ready')
            return []
        self.window.append(position)
        if now < self.cooldown_until or len(self.window) < STILL_SAMPLES:
            return []
        if _std(self.window) <= STILL_MAX_STD:
            return self._report('ready')
        return []

    def _report(self, state, force=False):
        if state == self.reported and not force:
            return []
        self.reported = state
        return [('state', state)]
