import os
import threading
import sys
import time
import logging
from model import PGAgent
# from model import PGAgent
# from shared.config import Config
from ai_subscriber import AISubscriber
import numpy as np
import cv2
# import threading
# from shared.config import Config
# from shared.utils import Timer
from dw.state_machine import Topics
from dw import Config
# from dw.utils import utils

# from queue import Queue

logging.basicConfig(level=logging.INFO)

class AIDriver:
    # #MODEL = 'validation/canstop_randomstart_6850.h5'#'../../validation/newhit_10k.h5'
    # MODEL_1 = f'./validation/canstop_randomstart_3k.h5'
    # MODEL_2 = f'./validation/canstop_randomstart_6850.h5'
    # MODEL_3 = f'./validation/canstop_randomstart_10k.h5'

    # One model per level, harder each level: Config.AI_MODELS names the files in this folder.
    MODEL_DIR = "./validation"
    level = 1
    def publish_inference(self):
        self.agent = self.agents.get(self.state.game_level, self.agents[1])

        # Get latest state diff
        diff_state = self.state.render_latest_diff()   
        
        # np.savetxt(f"files/diff{self.state.step}.txt", diff_state, fmt='%d')

        # with open("diff.txt", "a") as file:
        #     file.write(f"{diff_state}\n\n")

        # grayscale_image = utils.convert_to_grayscale_image(diff_state)

        # # Save or display the image using OpenCV
        # cv2.imwrite(f"screens/diff_frame{self.state.step}.png", grayscale_image)

        # current_frame_id = self.state.frame    

        # Compute the number of frames that have passed since the last frame
        #frame_diff = self.state.frame - self.last_acted_frame
        #self.last_acted_frame = self.state.frame
        #if frame_diff >= 0:
        #    # Throw away negative diffs because we're in a new round
        #    self.frame_diffs.append(frame_diff)

        # Infer on flattened state vector
        x = diff_state.ravel()     

        action, _, probs = self.agent.act(x, greedy=True)
        logging.debug('step: %s level: %s action: %s', self.state.step, self.state.game_level, action)

        # Training held each action for AI_FRAME_INTERVAL ticks at 6 px/tick. The gameboard
        # moves TYLER's paddle toward this target at that same speed.
        step = 6 * self.config.AI_FRAME_INTERVAL
        target = self.state.top_paddle_x
        if action == 0:
            target -= step
        elif action == 1:
            target += step
        target = min(self.config.WIDTH, max(0.0, target))
        if self.paddle1:
            self.state.publish(Topics.PADDLE_TOP_POSITION, {"position": {"x": target / self.config.WIDTH}})

        # What TYLER saw and how it decided, for the neural-net visualizer.
        self.state.publish(Topics.AI_ACTIVATION, self.agent.get_activation_packet())

        #if len(self.frame_diffs) > 10:
        #    print(
        #        f"Frame distribution: mean {np.mean(self.frame_diffs)}"
        #        f", stdev {np.std(self.frame_diffs)} counts {np.unique(self.frame_diffs, return_counts=True)}")
        #    self.frame_diffs = []
        #Timer.stop('inf')

    # def inference_loop(self):
    #     while True:
    #         current_frame_id = self.state.frame
    #         if self.last_acted_frame == current_frame_id:
    #             time.sleep(0.001)
    #         else:
    #             self.publish_inference()
    #             self.last_acted_frame = current_frame_id

    # def __init__(self, config=Config.instance(), paddle1=True, in_q = Queue()):
    def __init__(self, config=Config.instance(), paddle1=True):
       
        # self.q = in_q
        self.config = config
        self.paddle1 = paddle1
        self.paddle2 = not self.paddle1

        # We have all 3 agents already loaded instead of loading between levels. Saves a lot of time and prevents freezing
        self.agents = {}
        for level, model in self.config.AI_MODELS.items():
            self.agents[level] = PGAgent(self.config.CUSTOM_STATE_SIZE, self.config.CUSTOM_ACTION_SIZE)
            self.agents[level].load(os.path.join(AIDriver.MODEL_DIR, model))
        # The first inference on each model is slow; get it out of the way before games start.
        for agent in self.agents.values():
            agent.act(np.zeros(self.config.CUSTOM_STATE_SIZE), greedy=True)
        self.agent = self.agents[1]
        self.state = AISubscriber(self.config, trigger_event=lambda: self.publish_inference())
        self.last_frame_id = self.state.frame
        self.last_tick = time.time()
        self.frame_diffs = []
        self.last_acted_frame = 0
        # self.inference_thread = threading.Thread(target=self.inference_loop)
        # self.inference_thread.start()
        self.state.start()
        data = {"state": "start"}    
        self.state.publish(Topics.PADDLE_TOP_STATE, data, retain=True)      


# def main(in_q):
def main():
    # main is separated out so that we can call it and pass in the queue from GUI
    config = Config.instance()
    # instance = AIDriver(config = config, in_q = in_q)
    instance = AIDriver(config = config)
    try:
        # Block without spinning: a busy loop burned a CPU core and competed for the GIL
        # with the MQTT thread, which is where inference runs.
        threading.Event().wait()
    except KeyboardInterrupt:
        print("Closing")

if __name__ == "__main__":
    # main("")
    main()

