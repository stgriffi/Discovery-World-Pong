import json
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ['PONG_API_SCHEMA'] = os.path.join(os.path.dirname(__file__), '..', '..', 'schema', 'PongAPISchema.json')

from dw.state_machine import pong_api  # noqa: E402
from dw.state_machine.pong_api import PongAPI, Topics  # noqa: E402


class FakeClient:
    def __init__(self, client_id):
        self.client_id = client_id
        self.published = []
        self.subscribed = []
        self.will = None
        self.suppress_exceptions = False

    def will_set(self, topic, payload=None, qos=0, retain=False):
        self.will = (topic, payload, qos, retain)

    def publish(self, topic, payload, qos=0, retain=False):
        self.published.append((topic, json.loads(payload), retain))

    def subscribe(self, topic):
        self.subscribed.append(topic)

    def reconnect_delay_set(self, min_delay, max_delay):
        pass

    def connect_async(self, host, port, keepalive):
        self.connect_args = (host, port, keepalive)

    def loop_start(self):
        pass


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(pong_api.mqtt, 'Client', FakeClient)
    return PongAPI('test', will=(Topics.PADDLE_BOTTOM_STATE, {'state': 'stop'}))


def message(topic, payload):
    return types.SimpleNamespace(topic=topic, payload=json.dumps(payload).encode())


def test_callback_exceptions_are_contained(api):
    seen = []

    def broken(_):
        raise KeyError('state_transition')

    api.register_observer(Topics.GAME_STATE, broken)
    api.register_observer(Topics.GAME_STATE, seen.append)
    api.on_message(None, None, message('game/state', {'transition': 'reset'}))
    assert seen == [{'transition': 'reset'}]
    assert api.client.suppress_exceptions is True


def test_bad_messages_are_dropped(api):
    seen = []
    api.register_observer(Topics.GAME_STATE, seen.append)
    api.on_message(None, None, types.SimpleNamespace(topic='game/state', payload=b'{not json'))
    api.on_message(None, None, message('game/state', {'transition': 'bogus'}))
    api.on_message(None, None, message('some/other/topic', {'x': 1}))
    assert seen == []


def test_new_transitions_validate(api):
    for transition in ('level2_intro_complete', 'level3_intro_complete', 'reset'):
        assert api.validate_message('game/state', {'transition': transition})


def test_update_validates_and_refuses_nan(api):
    api.on_connect(api.client, None, {}, 0)
    assert api.update(Topics.PADDLE_BOTTOM_POSITION, {'position': {'x': 0.25}}) is True
    assert api.update(Topics.PADDLE_BOTTOM_POSITION, {'position': {'x': 1.5}}) is False
    assert api.update(Topics.PADDLE_BOTTOM_POSITION, {'position': {'x': float('nan')}}) is False
    assert api.client.published == [('paddle/bottom/position', {'position': {'x': 0.25}}, False)]


def test_neural_net_visualizer_messages_validate(api):
    assert api.validate_message('game/level', {'level': 0})
    assert api.validate_message('game/level', {'level': 3})
    assert not api.validate_message('game/level', {'level': 4})
    packet = [[0, 1, -1] * 2560, [0.5] * 200, [0.2, 0.3, 0.5]]
    assert api.validate_message('ai/activation', packet)
    assert not api.validate_message('ai/activation', packet[:2])


def test_topics_without_a_schema_are_allowed(api):
    api.on_connect(api.client, None, {}, 0)
    assert api.update(Topics.PADDLE_TOP, {'anything': 1}) is True


def test_last_will_is_retained(api):
    assert api.client.will == ('paddle/bottom/state', json.dumps({'state': 'stop'}), 1, True)


def test_subscribes_observed_topics_on_connect(api):
    api.register_observer(Topics.GAME_STATE, lambda m: None)
    api.on_connect(api.client, None, {}, 0)
    assert api.client.subscribed == ['game/state']
    assert api.is_connected()
    api.on_disconnect(api.client, None, 1)
    assert not api.is_connected()


def test_requires_topics_members(api):
    with pytest.raises(TypeError):
        api.update('game/state', {'transition': 'reset'})


def test_retained_state_published_before_connecting_is_sent_on_connect(api):
    assert api.update(Topics.PADDLE_TOP_STATE, {'state': 'start'}, retain=True) is True
    assert api.client.published == []
    api.on_connect(api.client, None, {}, 0)
    assert api.client.published == [('paddle/top/state', {'state': 'start'}, True)]


def test_retained_state_is_republished_after_a_reconnect(api):
    api.on_connect(api.client, None, {}, 0)
    api.update(Topics.PADDLE_BOTTOM_STATE, {'state': 'not_ready'}, retain=True)
    api.update(Topics.PADDLE_BOTTOM_STATE, {'state': 'ready'}, retain=True)
    api.on_disconnect(api.client, None, 1)
    api.client.published.clear()
    api.on_connect(api.client, None, {}, 0)
    assert api.client.published == [('paddle/bottom/state', {'state': 'ready'}, True)]


def test_ephemeral_messages_are_dropped_while_disconnected(api):
    assert api.update(Topics.PADDLE_TOP_POSITION, {'position': {'x': 0.5}}) is False
    assert api.client.published == []
