export const TEXT = Object.freeze({
  BLANK: '',
  GET_READY: 'GET READY',
  COUNTDOWN: Object.freeze(['3', '2', '1', 'GO!']),
  TIME_UP: 'TIME!',
  HUMAN_WINS: 'HUMAN WINS!',
  TYLER_WINS: 'TYLER WINS!',
  DRAW: "IT'S A DRAW",
  SUDDEN_DEATH: 'SUDDEN DEATH',
});

// Every glyph any HUD text can show. drei's <Text> suspends once per (font, characters)
// pair, so sharing one string means all text loads during the single startup suspend.
export const HUD_CHARACTERS = "0123456789:!'. ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function formatClock(ticks, hz = 60) {
  const seconds = Math.max(0, Math.ceil(ticks / hz));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
