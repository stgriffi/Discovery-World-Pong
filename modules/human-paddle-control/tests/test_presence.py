from presence import (
    ABSENCE_TIMEOUT_S,
    COOLDOWN_AFTER_GAME_S,
    GIVE_UP_AFTER_STOP_S,
    STILL_SAMPLES,
    PaddlePresence,
)

FRAME = 1 / 30


class Clock:
    def __init__(self):
        self.now = 100.0

    def tick(self, seconds=FRAME):
        self.now += seconds
        return self.now


def feed(presence, clock, position, seconds):
    """Feed camera samples for `seconds`; return all published messages."""
    out = []
    for _ in range(int(round(seconds / FRAME))):
        out += presence.on_sample(position, clock.tick())
    return out


def states(messages):
    return [value for kind, value in messages if kind == 'state']


def positions(messages):
    return [value for kind, value in messages if kind == 'position']


def test_reports_ready_once_a_player_stands_still():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    assert states(p.start(clock.now)) == ['not_ready']
    out = feed(p, clock, 0.4, (STILL_SAMPLES - 2) * FRAME)
    assert states(out) == []
    out = feed(p, clock, 0.4, 3 * FRAME)
    assert states(out) == ['ready']
    assert states(feed(p, clock, 0.4, 5)) == []  # only changes are published


def test_a_player_walking_past_is_not_ready():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    out = []
    for i in range(200):
        out += p.on_sample((i % 30) / 30, clock.tick())  # sweeping across the camera
    assert 'ready' not in states(out)


def test_leaving_in_idle_reports_not_ready_after_a_second():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    feed(p, clock, 0.5, 2)
    out = feed(p, clock, None, 0.9)
    assert states(out) == []
    out = feed(p, clock, None, 0.2)
    assert states(out) == ['not_ready']


def test_streams_every_frame_during_a_game_even_while_moving():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    feed(p, clock, 0.5, 2)
    p.on_transition('player_ready', clock.now)
    out = []
    for i in range(60):
        out += p.on_sample(0.2 + i / 100, clock.tick())
    assert len(positions(out)) == 60
    assert states(out) == []


def test_walking_away_during_a_game_sends_stop_once():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    p.on_transition('player_ready', clock.now)
    feed(p, clock, 0.5, 1)
    out = feed(p, clock, None, ABSENCE_TIMEOUT_S - 0.2)
    assert states(out) == []
    out = feed(p, clock, None, 0.5)
    assert states(out) == ['stop']
    assert states(feed(p, clock, None, 2)) == []
    assert states(p.on_transition('player_exit', clock.now)) == ['not_ready']


def test_gives_up_waiting_for_the_game_to_end_after_stop():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    p.on_transition('player_ready', clock.now)
    out = feed(p, clock, None, ABSENCE_TIMEOUT_S + GIVE_UP_AFTER_STOP_S + 0.5)
    assert states(out) == ['stop', 'not_ready']
    assert p.phase == 'idle'


def test_no_stop_during_the_outro():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    p.on_transition('player_ready', clock.now)
    p.on_transition('level3_complete', clock.now)
    assert states(feed(p, clock, None, 15)) == []


def test_after_a_game_reports_not_ready_then_ready_again_for_a_player_still_there():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    p.on_transition('player_ready', clock.now)
    feed(p, clock, 0.5, 5)
    assert states(p.on_transition('game_complete', clock.now)) == ['not_ready']
    out = feed(p, clock, 0.5, COOLDOWN_AFTER_GAME_S - 0.1)
    assert states(out) == []
    out = feed(p, clock, 0.5, STILL_SAMPLES * FRAME + 0.2)
    assert states(out) == ['ready']


def test_joins_a_game_even_if_player_ready_was_missed():
    clock = Clock()
    p = PaddlePresence(now=clock.now)
    p.on_transition('level1_intro_complete', clock.now)
    assert positions(p.on_sample(0.3, clock.tick())) == [0.3]
