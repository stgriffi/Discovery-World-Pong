// Interim audio for the GameController: the existing HTMLAudio player, music only.
// Phase 3 replaces this with Web Audio (decoded buffers) and adds sound effects.
import AudioPlayer from '../AudioPlayer';

export function createLegacyAudio({ musicVolume = 0.5 } = {}) {
  const player = new AudioPlayer();
  ['musicIdle', 'musicBackground'].forEach((id) => {
    const element = player.audioFiles.getAudio(id);
    if (element) element.loop = true;
  });

  const play = (id, volume) => {
    player.setVolume(id, volume);
    player.play(id).catch((err) => console.warn(`[audio] could not play ${id}: ${err.message}`));
  };

  return {
    onBaseState(state, from) {
      if (state === 'idle') {
        player.stop('musicBackground');
        play('musicIdle', musicVolume);
      } else if (from === 'idle') {
        // A player was detected.
        player.stop('musicIdle');
        play('exhibitActivationNoise', 1.0);
        play('musicBackground', musicVolume);
      }
    },
    onGameplay() {},
    onSimEvents() {},
  };
}
