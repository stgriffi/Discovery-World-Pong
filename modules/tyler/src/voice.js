// Plays TYLER's voice clips with HTMLAudio. play() always settles: 'ended' when the clip
// finishes, 'stopped' if stop() interrupts it, 'failed' if the browser refuses to play it
// (e.g. autoplay blocked) -- it never leaves the caller waiting forever.
import AudioPlayer from './AudioPlayer';

export function createHtmlVoice(player = new AudioPlayer(), { volume = 0.9 } = {}) {
  const settlers = new Map(); // clip id -> settle function of the playing clip

  function stop(id) {
    const audio = player.audioFiles.getAudio(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    const settle = settlers.get(id);
    if (settle) settle('stopped');
  }

  return {
    play(id) {
      const audio = player.audioFiles.getAudio(id);
      if (!audio) return Promise.resolve('failed');
      if (settlers.has(id)) stop(id);
      return new Promise((resolve) => {
        const settle = (result) => {
          if (settlers.get(id) !== settle) return;
          settlers.delete(id);
          audio.onended = null;
          resolve(result);
        };
        settlers.set(id, settle);
        audio.volume = volume;
        audio.currentTime = 0;
        audio.onended = () => settle('ended');
        audio.play().catch((err) => {
          console.warn(`[tyler] could not play ${id}: ${err.message}`);
          settle('failed');
        });
      });
    },
    stop,
    stopAll() {
      [...settlers.keys()].forEach(stop);
    },
    durationOf(id) {
      const audio = player.audioFiles.getAudio(id);
      return audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    },
  };
}
