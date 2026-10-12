// Maps game events from the GameController to sounds (see clips.js for volumes).
import { TYLER_PADDLE_GAIN } from './clips';

export function createGameAudio(engine) {
  let session = 0; // bumped whenever the exhibit returns to idle
  let inIdle = true;

  const playLoop = (id) => {
    if (!engine.isPlaying(id)) engine.play(id, { loop: true });
  };

  return {
    onBaseState(state, from) {
      if (state === 'idle') {
        session += 1;
        inIdle = true;
        engine.stop('musicBackground', 1.5);
        playLoop('musicIdle');
      } else if (from === 'idle') {
        // A player was detected: the activation sound cuts off the idle music, and the
        // game music starts when it finishes.
        inIdle = false;
        const mySession = session;
        engine.stop('musicIdle', 0.15);
        engine.play('activation').ended.then(() => {
          if (mySession === session && !inIdle) playLoop('musicBackground');
        });
      }
    },

    onGameplay(name, { bottomScore, topScore }) {
      // End of level 1 or 2 with the player behind.
      if (name === 'levelOver' && bottomScore < topScore) engine.play('levelDefeat');
    },

    onSimEvents(events, { level }) {
      events.forEach((event) => {
        if (event.type === 'paddleHit') {
          engine.play('paddleHit', { gain: event.side === 'top' ? TYLER_PADDLE_GAIN : 1 });
        } else if (event.type === 'wallHit') {
          // Sides are as the player sees them (the player stands at the bottom edge).
          engine.play(event.side === 'left' ? 'wallHitLeft' : 'wallHitRight');
        } else if (event.type === 'goal') {
          if (event.scorer === 'human') engine.play('pointScore');
          else engine.play(level === 3 ? 'levelDefeat' : 'pointLose'); // sudden death lost
        }
      });
    },
  };
}
