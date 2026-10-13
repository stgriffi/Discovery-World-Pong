import json
import logging
import os
from enum import Enum

import paho.mqtt.client as mqtt
from jsonschema import Draft7Validator

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


class Topics(Enum):
    GAME_PLAY = 'game/play'
    GAME_STATS = 'game/stats'
    GAME_STATE = 'game/state'
    GAME_LEVEL = 'game/level'
    AI_ACTIVATION = 'ai/activation'
    PADDLE_TOP = 'paddle/top'
    PADDLE_BOTTOM = 'paddle/bottom'
    PADDLE_TOP_POSITION = 'paddle/top/position'
    PADDLE_TOP_STATE = 'paddle/top/state'
    PADDLE_TOP_STATE_TRANSITION = 'paddle/top/state_transition'
    PADDLE_BOTTOM_POSITION = 'paddle/bottom/position'
    PADDLE_BOTTOM_STATE = 'paddle/bottom/state'
    PADDLE_BOTTOM_STATE_TRANSITION = 'paddle/bottom/state_transition'
    DEPTH_FEED = 'depth/feed'


def _load_schema_properties():
    """Per-topic schemas from PongAPISchema.json ($PONG_API_SCHEMA, next to this file, or the cwd)."""
    candidates = [
        os.environ.get('PONG_API_SCHEMA'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'PongAPISchema.json'),
        'PongAPISchema.json',
    ]
    for path in candidates:
        if path and os.path.exists(path):
            with open(path, 'r') as file:
                return json.load(file).get('properties', {})
    log.warning('PongAPISchema.json not found; MQTT messages will not be validated')
    return {}


class PongAPI:
    def __init__(self, client_id, broker='mqtt-broker', port=1883, will=None):
        """
        :param will: optional (Topics member, message dict). The broker publishes it, retained,
                     if this client disappears without disconnecting (e.g. the container crashes).
        """
        self.client_id = client_id
        self.broker = broker
        self.port = port
        self.client = mqtt.Client(client_id)
        # An exception in a callback must never kill paho's network thread: the process
        # would keep running, deaf and mute, and Docker would never restart it.
        self.client.suppress_exceptions = True
        self.connected = False

        # Observers per topic, so we can subscribe and notify on messages.
        self.observers = {topic: [] for topic in Topics}
        self.validators = {topic: Draft7Validator(schema) for topic, schema in _load_schema_properties().items()}
        self._unvalidated_warned = set()
        # Last retained message per topic (e.g. this paddle's state). Published again on
        # every (re)connect: one sent before the connection is up would otherwise be lost,
        # and a restarted broker may have forgotten it.
        self._retained = {}

        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message

        if will is not None:
            will_topic, will_message = will
            self.client.will_set(will_topic.value, json.dumps(will_message), qos=1, retain=True)

    def on_connect(self, client, userdata, flags, rc):
        if rc != 0:
            log.error('MQTT connection refused (result code %s)', rc)
            return
        log.info('Connected to MQTT broker %s:%s', self.broker, self.port)
        self.connected = True
        for topic, observers in self.observers.items():
            if observers:
                self.client.subscribe(topic.value)
        for topic, payload in self._retained.items():
            self.client.publish(topic, payload, qos=1, retain=True)

    def on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            log.warning('Lost the MQTT connection (rc=%s); reconnecting', rc)

    def on_message(self, client, userdata, msg):
        try:
            topic = Topics(msg.topic)
        except ValueError:
            log.warning('Message on unexpected topic %s', msg.topic)
            return
        try:
            payload = json.loads(msg.payload)
        except (TypeError, ValueError) as e:  # JSONDecodeError is a ValueError
            log.error('Dropping non-JSON message on %s: %s', msg.topic, e)
            return
        if not self.validate_message(msg.topic, payload):
            return
        for callback in list(self.observers[topic]):
            try:
                callback(payload)
            except Exception:
                log.exception('Observer for %s failed', msg.topic)

    def validate_message(self, topic, message):
        """:param topic: topic string or Topics member."""
        if isinstance(topic, Topics):
            topic = topic.value
        validator = self.validators.get(topic)
        if validator is None:
            if topic not in self._unvalidated_warned:
                self._unvalidated_warned.add(topic)
                log.warning('No schema for topic %s; not validating it', topic)
            return True
        error = next(iter(validator.iter_errors(message)), None)
        if error is not None:
            log.error('Invalid message on %s: %s', topic, error.message)
            return False
        return True

    def start(self):
        # connect_async + loop_start keeps retrying until the broker is reachable instead
        # of failing at startup if it isn't up yet.
        self.client.reconnect_delay_set(min_delay=1, max_delay=10)
        self.client.connect_async(self.broker, self.port, 60)
        self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
        self.connected = False

    def is_connected(self):
        return self.connected

    def register_observer(self, topic, callback):
        if not isinstance(topic, Topics):
            raise TypeError('topic must be a Topics member, got %r' % (topic,))
        self.observers[topic].append(callback)
        if self.connected:
            self.client.subscribe(topic.value)

    def update(self, topic, message, retain=False):
        """Publish a message. Returns True if it was handed to the MQTT client."""
        if not isinstance(topic, Topics):
            raise TypeError('topic must be a Topics member, got %r' % (topic,))
        if not self.validate_message(topic.value, message):
            return False
        try:
            # allow_nan=False: NaN isn't JSON, and browsers can't parse it.
            payload = json.dumps(message, allow_nan=False)
        except (TypeError, ValueError) as e:
            log.error('Could not encode message for %s: %s', topic.value, e)
            return False
        if retain:
            self._retained[topic.value] = payload
            if not self.connected:
                return True  # sent as soon as the connection is up
            self.client.publish(topic.value, payload, qos=1, retain=True)
            return True
        if not self.connected:
            return False  # ephemeral data isn't worth queueing
        self.client.publish(topic.value, payload, retain=False)
        return True
