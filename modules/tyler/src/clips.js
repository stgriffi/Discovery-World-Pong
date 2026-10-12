// TYLER's voice clips (the design calls for TYLER at 80-100% volume).
import tylerIntro from './audio_files/tyler_intro.mp3';
import tylerMove from './audio_files/tyler_move.mp3';
import tylerDuel from './audio_files/tyler_duel.mp3';
import tylerCountdown from './audio_files/tyler_countdown.mp3';
import tylerLevelOneComplete from './audio_files/tyler_level_one_complete.mp3';
import tylerLevelTwoComplete from './audio_files/tyler_level_two_complete.mp3';
import tylerLevelThreeComplete from './audio_files/tyler_level_three_complete.mp3';
import tylerOutro from './audio_files/tyler_outro.mp3';

const voice = (url) => ({ url, bus: 'voice', gain: 0.9, maxVoices: 1 });

export const CLIPS = Object.freeze({
  tylerIntro: voice(tylerIntro),
  tylerMove: voice(tylerMove),
  tylerDuel: voice(tylerDuel),
  tylerCountdown: voice(tylerCountdown),
  tylerLevelOneComplete: voice(tylerLevelOneComplete),
  tylerLevelTwoComplete: voice(tylerLevelTwoComplete),
  tylerLevelThreeComplete: voice(tylerLevelThreeComplete),
  tylerOutro: voice(tylerOutro),
});
