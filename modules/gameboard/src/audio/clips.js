// Gameboard sounds. Volumes follow audio_files/Audio Intent_Excel.xlsx.
import activation from '../audio_files/exhibit_activation_noise.mp3';
import musicIdle from '../audio_files/music_idle.mp3';
import musicBackground from '../audio_files/music_background.mp3';
import levelDefeat from '../audio_files/level_defeat.mp3';
import paddleHit from '../audio_files/paddle_hit.mp3';
import pointLose from '../audio_files/point_lose.mp3';
import pointScore from '../audio_files/point_score.mp3';
import wallHitLeft from '../audio_files/wall_hit_left.wav';
import wallHitRight from '../audio_files/wall_hit_right.wav';

export const CLIPS = Object.freeze({
  activation: { url: activation, bus: 'sfx', gain: 1.0, maxVoices: 1 },
  musicIdle: { url: musicIdle, bus: 'music', gain: 0.5, maxVoices: 1 },
  musicBackground: { url: musicBackground, bus: 'music', gain: 0.5, maxVoices: 1 },
  levelDefeat: { url: levelDefeat, bus: 'sfx', gain: 1.0, maxVoices: 1 },
  paddleHit: { url: paddleHit, bus: 'sfx', gain: 0.9, maxVoices: 3 },
  pointLose: { url: pointLose, bus: 'sfx', gain: 1.0, maxVoices: 1 },
  pointScore: { url: pointScore, bus: 'sfx', gain: 1.0, maxVoices: 1 },
  wallHitLeft: { url: wallHitLeft, bus: 'sfx', gain: 0.75, maxVoices: 2 },
  wallHitRight: { url: wallHitRight, bus: 'sfx', gain: 0.75, maxVoices: 2 },
});

export const TYLER_PADDLE_GAIN = 0.65; // TYLER's own hits are quieter than the player's
