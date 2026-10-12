import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import welcome from './imgs/WelcomeScreen.png';
import moveLeftRight from './imgs/gameInstructions/GameInstructions-MoveLeftRight.png';
import board from './imgs/PONG_Board.svg';
import score from './imgs/scores/Score.png';
import font from './fonts/Roboto-Bold.ttf';

export const IMAGES = Object.freeze({ welcome, moveLeftRight, board, score });
export const FONT = font;

// Start loading every texture now, so the scene suspends once at startup and never again
// mid-game (a suspend hides the whole canvas until the asset arrives).
export function preloadTextures() {
  Object.values(IMAGES).forEach((url) => useLoader.preload(THREE.TextureLoader, url));
}
