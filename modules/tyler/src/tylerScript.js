import * as TEXT from './loadText';

// What TYLER does in each exhibit state: the face to show, the text, the voice clips to
// play in order, and the transition to publish once they finish.
export const SCRIPT = Object.freeze({
  idle: { face: 'sleeping', text: TEXT.blank, clips: [] },
  intro: { face: 'neutral', text: TEXT.intro, clips: [{ id: 'tylerIntro' }], transition: 'intro_complete' },
  moveIntro: { face: 'moveLeft', text: TEXT.move, clips: [{ id: 'tylerMove' }], transition: 'move_intro_complete' },
  level1Intro: { face: 'neutral', text: TEXT.duel, clips: [{ id: 'tylerDuel' }], transition: 'level1_intro_complete' },
  level1: { face: 'moveLeft', text: TEXT.countdown, clips: [{ id: 'tylerCountdown' }], after: { text: TEXT.blank } },
  level2Intro: {
    face: 'neutral',
    text: TEXT.level_one_complete,
    clips: [{ id: 'tylerLevelOneComplete' }],
    transition: 'level2_intro_complete',
  },
  level2: { face: 'moveLeft', text: TEXT.countdown, clips: [{ id: 'tylerCountdown' }], after: { text: TEXT.blank } },
  level3Intro: {
    face: 'neutral',
    text: TEXT.level_two_complete,
    clips: [{ id: 'tylerLevelTwoComplete' }],
    transition: 'level3_intro_complete',
  },
  level3: { face: 'moveLeft', text: TEXT.countdown, clips: [{ id: 'tylerCountdown' }], after: { text: TEXT.blank } },
  outro: {
    face: 'neutral',
    text: TEXT.level_three_complete,
    clips: [{ id: 'tylerLevelThreeComplete' }, { id: 'tylerOutro', text: TEXT.outro }],
    transition: 'game_complete',
  },
});

// Clip lengths (s) of the MP3s, used until the browser reports the real duration.
export const CLIP_SECONDS = Object.freeze({
  tylerIntro: 7.05,
  tylerMove: 6.03,
  tylerDuel: 3.84,
  tylerCountdown: 2.06,
  tylerLevelOneComplete: 6.53,
  tylerLevelTwoComplete: 7.94,
  tylerLevelThreeComplete: 6.87,
  tylerOutro: 3.19,
});
