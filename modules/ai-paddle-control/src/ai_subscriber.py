import time
import logging
# import paho.mqtt.client as mqtt
import numpy as np
import json

# from shared import utils
# from shared.config import Config
from dw.state_machine import PongAPI, Topics
from dw import Config
# from dw.utils import utils

import cv2
import math

# game/state transitions that start a level, and the level (model) they start.
LEVEL_STARTS = {"player_ready": 1, "level1_intro_complete": 1, "level1_complete": 2, "level2_complete": 3}
GAME_OVER = {"game_complete", "player_exit", "reset", "start", "stop"}


class AISubscriber:
    """
    MQTT compliant game state subscriber.
    Always stores the latest up-to-date combination of game state factors.
    """

    # def on_connect(self, client, userdata, flags, rc):
    #     print("Connected with result code " + str(rc))
    #     client.subscribe("puck/position")
    #     client.subscribe("player1/score")
    #     client.subscribe("player2/score")
    #     client.subscribe("paddle1/position")
    #     client.subscribe("paddle2/position")
    #     client.subscribe("game/level")
    #     client.subscribe("game/frame")

    # def on_message(self, client, userdata, msg):
    #     topic = msg.topic
    #     payload = json.loads(msg.payload)
    #     if topic == "puck/position":
    #         self.puck_x = payload["x"]
    #         self.puck_y = payload["y"]
    #     if topic == "paddle1/position":
    #         self.bottom_paddle_x = payload["position"]
    #     if topic == "paddle2/position":
    #         self.top_paddle_x = payload["position"]
    #     if topic == "game/level":
    #         self.game_level = payload["level"]
    #     if topic == "game/frame":
    #         self.frame = payload["frame"]
    #         if Config.instance().NETWORK_TIMESTAMPS:
    #             print(f'{time.time_ns() // 1_000_000} F{self.frame} RECV GM->AI')
    #         self.trailing_frame = self.latest_frame
    #         self.latest_frame = self.render_latest_preprocessed()

    def on_game_state(self, message):
        """
        Follow the exhibit's game flow: pick the model for each level, start every level
        with a blank previous frame (as training started each game), and re-announce
        readiness when a game ends.
        """
        transition = message.get("transition")
        if transition in LEVEL_STARTS:
            self.game_level = LEVEL_STARTS[transition]
            self.latest_frame = None
            self.trailing_frame = None
        elif transition in GAME_OVER:
            self.game_level = 1
            self.latest_frame = None
            self.trailing_frame = None
        if transition == "game_complete":
            data = {"state": "start"}
            self.publish(Topics.PADDLE_TOP_STATE, data, retain=True)

    # def state(self, message):
    #     on_game_state(self, message)


    def on_game_play(self, message):
        """
        Callback method for when the BaseState changes.

        Parameters:
        changed_state (dict): The changed state values.
        """

        paddle_adjustment_top = 192
        paddle_adjustment_bottom = 192
        ball_adjustment_x = 96
        ball_adjustment_y = 80
        self.puck_x = message["ball"]["position"]["x"] + ball_adjustment_x
        self.puck_y = ball_adjustment_y - message["ball"]["position"]["y"]
        self.bottom_paddle_x = message["paddle_bottom"]["position"]["x"] * paddle_adjustment_bottom
        self.top_paddle_x = message["paddle_top"]["position"]["x"] * paddle_adjustment_top

        # print(f"self.puck_x: ", self.puck_x )
        # print(f"self.puck_y: ", self.puck_y )
        # print(f"self.top_paddle_x", self.top_paddle_x)

        # self.game_level = message["level"]
        # self.frame = message["frame"]

        # self.trailing_frame = self.latest_frame
        # self.latest_frame = self.render_latest_preprocessed()

        # if self.frame == self.config.AI_FRAME_INTERVAL:
        #     self.trailing_frame_ball = self.latest_frame_ball
        #     self.latest_frame_ball = self.render_latest_preprocessed_ball()
        #     self.latest_frame_paddle = self.render_latest_preprocessed_paddle()
        #     # if self.trailing_frame_ball is not None:
        #     #     np.savetxt(f"files/trailing_frame_ball{self.frame}.txt", self.trailing_frame_ball, fmt='%d')
        #     # np.savetxt(f"files/latest_frame_ball{self.frame}.txt", self.latest_frame_ball, fmt='%d')
        #     # np.savetxt(f"files/latest_frame_paddle{self.frame}.txt", self.latest_frame_paddle, fmt='%d')      

        #     if self.trigger_event is not None:
        #         self.trigger_event()
        #     self.frame = 1
        # else:
        #     self.frame += 1  

        # Decide every AI_FRAME_INTERVAL ticks, as in training. The gameboard numbers its
        # game/play messages per physics tick; fall back to counting messages without it.
        frame = message.get("frame")
        if frame is not None:
            decide = frame % self.config.AI_FRAME_INTERVAL == 0
        else:
            decide = self.frame == self.config.AI_FRAME_INTERVAL
        if decide:
            self.trailing_frame = self.latest_frame
            self.latest_frame = self.render_latest_preprocessed()
            # if self.trailing_frame is not None:
            #     np.savetxt(f"files/trailing_frame{self.step}.txt", self.trailing_frame, fmt='%d')
            # np.savetxt(f"files/latest_frame{self.step}.txt", self.latest_frame, fmt='%d')

            if self.trigger_event is not None:
                self.trigger_event()
            self.frame = 1
        else:
            self.frame += 1  

        self.step += 1

    def draw_rect(self, screen, x, y, w, h, color):
        """
        Utility to draw a rectangle on the screen state ndarray
        :param screen: ndarray representing the screen
        :param x: leftmost x coordinate
        :param y: Topmost y coordinate
        :param w: width (px)
        :param h: height (px)
        :param color: RGB int tuple
        :return:
        """
        # IMPORTANT: See notes in the corresponding method in Pong.py
        # This needs to be set up such that everything is drawn symmetrically
        y = math.ceil(y)
        x = math.ceil(x)
        screen[max(y, 0):y+h, max(x, 0):x+w] = color

    def publish(self, topic, message, retain: bool = False):
        """
        Use the state subscriber to send a message since we have the connection open anyway
        :param topic: MQTT topic
        :param message: payload object, will be JSON stringified
        :return:
        """
        self.pong_api.update(topic, message, retain)

        # if topic == 'paddle1/frame' and Config.instance().NETWORK_TIMESTAMPS:
        #     print(f'{time.time_ns() // 1_000_000} F{message["frame"]} SEND AI->GM')
        # p = json.dumps(message)
        # self.client.publish(topic, payload=p, qos=qos)

# *********************************************************************************
    # def render_latest_ball(self, bottom=False):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     :return: ndarray of RGB screen pixels
    #     """
    #     screen = np.zeros((self.config.HEIGHT, self.config.WIDTH, 3), dtype=np.float32)
    #     screen[:, :] = (140, 60, 0)  # BGR for a deep blue

    #     self.draw_rect(screen, self.puck_x - self.config.BALL_DIAMETER / 2, self.puck_y - (self.config.BALL_DIAMETER / 2),
    #               self.config.BALL_DIAMETER, self.config.BALL_DIAMETER, 255)

    #     if bottom:  # Flip screen vertically because the model is trained as the top paddle
    #         screen = np.flip(screen, axis=0)

    #     appendix = "_flip" if bottom else ""
    #     # cv2.imwrite(f"screens/frame_ball{self.step}{appendix}.png", screen)

    #     return screen
    
    # def render_latest_paddle(self, bottom=False):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     :return: ndarray of RGB screen pixels
    #     """
    #     screen = np.zeros((self.config.HEIGHT, self.config.WIDTH, 3), dtype=np.float32)
    #     screen[:, :] = (140, 60, 0)  # BGR for a deep blue
    #     if bottom:
    #         self.draw_rect(screen, self.bottom_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.BOTTOM_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
    #               self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
    #     else:
    #         # self.draw_rect(screen, self.top_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.TOP_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
    #         #          self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
    #         self.draw_rect(screen, self.top_paddle_x - self.config.PADDLE_WIDTH / 2, (self.config.PADDLE_HEIGHT / 2),
    #                  self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)

    #     if bottom:  # Flip screen vertically because the model is trained as the top paddle
    #         screen = np.flip(screen, axis=0)

    #     appendix = "_flip" if bottom else ""
    #     # cv2.imwrite(f"screens/frame_paddle{self.step}{appendix}.png", screen)

    #     return screen

    # def render_latest_preprocessed_ball(self):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     Scaled down for AI consumption
    #     :return: ndarray of RGB screen pixels
    #     """
    #     latest = self.render_latest_ball()
    #     return utils.preprocess(latest)

    # def render_latest_preprocessed_paddle(self):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     Scaled down for AI consumption
    #     :return: ndarray of RGB screen pixels
    #     """
    #     latest = self.render_latest_paddle()
    #     return utils.preprocess(latest)
    
    # def render_latest_diff(self):
    #     """
    #     Render the current game pixel state, subtracted from the previous
    #     Guarantees that adjacent frames are used for the diff
    #     :return: ndarray of RGB screen pixels
    #     """
    #     if self.trailing_frame_ball is None:
    #         return self.latest_frame_ball + self.latest_frame_paddle
    #     return (self.latest_frame_ball - self.trailing_frame_ball) + self.latest_frame_paddle
    
    def render_latest(self, bottom=False):
        """
        Render the current game pixel state by hand in an ndarray
        :return: ndarray of RGB screen pixels
        """
        screen = np.zeros((self.config.HEIGHT, self.config.WIDTH, 3), dtype=np.float32)
        screen[:, :] = (140, 60, 0)  # BGR for a deep blue
        # The training render drew a 2 px midline first (Pong.render).
        self.draw_rect(screen, 0, self.config.HEIGHT / 2 - 1, self.config.WIDTH, 2, 255)
        if bottom:
            self.draw_rect(screen, self.bottom_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.BOTTOM_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
                  self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
        else:
            self.draw_rect(screen, self.top_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.TOP_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
                     self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
        self.draw_rect(screen, self.puck_x - self.config.BALL_DIAMETER / 2, self.puck_y - (self.config.BALL_DIAMETER / 2),
                  self.config.BALL_DIAMETER, self.config.BALL_DIAMETER, 255)

        if bottom:  # Flip screen vertically because the model is trained as the top paddle
            screen = np.flip(screen, axis=0)

        appendix = "_flip" if bottom else ""
        # cv2.imwrite(f"screens/frame{self.step}{appendix}.png", screen)

        return screen

    def preprocess(self, I):
        state = cv2.cvtColor(I, cv2.COLOR_BGR2GRAY)
        h, w = state.shape
        state = cv2.resize(state, (w // 2, h // 2))
        state[state < 250] = 0
        state[state == 255] = 1
        # return state.astype(np.float)
        return state.astype(float)
    
    def render_latest_preprocessed(self):
        """
        Render the current game pixel state by hand in an ndarray
        Scaled down for AI consumption
        :return: ndarray of RGB screen pixels
        """
        latest = self.render_latest()
        # return utils.preprocess(latest)
        # logging.info(f"latest: {latest}")
        p = self.preprocess(latest)
        # p = utils.preprocess(latest)
        return p
    
        # return self.preprocess(latest)

    def render_latest_diff(self):
        """
        Render the current game pixel state, subtracted from the previous
        Guarantees that adjacent frames are used for the diff
        :return: ndarray of RGB screen pixels
        """
        if self.trailing_frame is None:
            return self.latest_frame
        return self.latest_frame - self.trailing_frame


# *********************************************************************************

    # def render_latest(self, bottom=False):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     :return: ndarray of RGB screen pixels
    #     """
    #     logging.info('top_paddle_x : %s', self.top_paddle_x)
    #     logging.info('puck_x : %s', self.puck_x)
    #     logging.info('puck_y : %s', self.puck_y)

    #     screen = np.zeros((self.config.HEIGHT, self.config.WIDTH, 3), dtype=np.float32)
    #     screen[:, :] = (140, 60, 0)  # BGR for a deep blue
    #     if bottom:
    #         self.draw_rect(screen, self.bottom_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.BOTTOM_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
    #               self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
    #     else:
    #         self.draw_rect(screen, self.top_paddle_x - self.config.PADDLE_WIDTH / 2, self.config.TOP_PADDLE_Y - (self.config.PADDLE_HEIGHT / 2),
    #                  self.config.PADDLE_WIDTH, self.config.PADDLE_HEIGHT, 255)
    #     self.draw_rect(screen, self.puck_x - self.config.BALL_DIAMETER / 2, self.puck_y - (self.config.BALL_DIAMETER / 2),
    #               self.config.BALL_DIAMETER, self.config.BALL_DIAMETER, 255)

    #     if bottom:  # Flip screen vertically because the model is trained as the top paddle
    #         screen = np.flip(screen, axis=0)
    #     #appendix = "_flip" if bottom else ""
    #     #cv2.imwrite(f"frame{self.frame}{appendix}.png", screen)
    #     return screen

    # def render_latest_preprocessed(self):
    #     """
    #     Render the current game pixel state by hand in an ndarray
    #     Scaled down for AI consumption
    #     :return: ndarray of RGB screen pixels
    #     """
    #     latest = self.render_latest()
    #     return utils.preprocess(latest)

    # def render_latest_diff(self):
    #     """
    #     Render the current game pixel state, subtracted from the previous
    #     Guarantees that adjacent frames are used for the diff
    #     :return: ndarray of RGB screen pixels
    #     """
    #     if self.trailing_frame is None:
    #         return self.latest_frame
    #     return self.latest_frame - self.trailing_frame

    # def ready(self):
    #     """
    #     Determine if all state attributes have been received since initialization
    #     :return: Boolean indicating that all state values are populated.
    #     """
    #     return self.puck_x is not None \
    #            and self.puck_y is not None \
    #            and self.bottom_paddle_x is not None \
    #            and self.top_paddle_x is not None \
    #            and self.game_level is not None

    def __init__(self, config, trigger_event=None):
        """
        :param trigger_event: Function to call each time a new state is received
        """
        # If this service dies, the broker tells the gameboard TYLER is gone.
        self.pong_api = PongAPI("ai-paddle-control", will=(Topics.PADDLE_TOP_STATE, {"state": "stop"}))

        self.config = config
        self.trigger_event = trigger_event
        # self.client = mqtt.Client(client_id="ai-paddle-control")
        # self.client.on_connect = lambda client, userdata, flags, rc : self.on_connect(client, userdata, flags, rc)
        # self.client.on_message = lambda client, userdata, msg : self.on_message(client, userdata, msg)
        print("Initializing subscriber")
        # self.client.connect_async("localhost", port=1883, keepalive=60)
        # self.client.connect_async("192.168.2.214", port=1883, keepalive=60)
        # self.client.connect_async("mqtt-broker", port=1883, keepalive=60)

        self.puck_x = None
        self.puck_y = None
        self.bottom_paddle_x = None
        self.top_paddle_x = None
        self.game_level = 1
        # self.frame = 0
        self.latest_frame = None
        self.trailing_frame = None
        self.trailing_frame = None
        self.latest_frame_paddle = None
        self.latest_frame_ball = None
        self.trailing_frame_ball = None
        self.step = 1
        self.frame = self.config.AI_FRAME_INTERVAL

    def start(self):
        # self.client.loop_forever()
        self.pong_api.start()
        self.pong_api.register_observer(Topics.GAME_PLAY, self.on_game_play)
        self.pong_api.register_observer(Topics.GAME_STATE, self.on_game_state)
        data = {"state": "ready"}    
        self.publish(Topics.PADDLE_TOP_STATE, data)      

