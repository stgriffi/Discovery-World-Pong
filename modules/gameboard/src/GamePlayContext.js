import { createContext, useContext, useState, useRef } from "react";
import AudioPlayer from './AudioPlayer';
import * as TEXT from './loadText';

const GamePlayContext = createContext();
const useGamePlayContext = () => useContext(GamePlayContext);

const GamePlayProvider = ({ children }) => {
  const [audioPlayer] = useState(new AudioPlayer());
  const [volume] = useState(0.5);
  const [speed] = useState(200);
  const [playTime] = useState(10000);
  const [delay] = useState(500);
  const [level, setLevel] = useState(0);
  const [countdown, setCountdown] = useState(TEXT.blank);
  const [topScore, setTopScore] = useState(0);
  const [bottomScore, setBottomScore] = useState(0);
  const [topPaddlePosition, setTopPaddlePosition] = useState(0.5);
  const [topPaddleState, setTopPaddleState] = useState("not_ready");
  const [bottomPaddlePosition, setBottomPaddlePosition] = useState(0.5);
  const [bottomPaddleState, setBottomPaddleState] = useState("not_ready");
  const [isTopPaddleReset, setIsTopPaddleReset] = useState(false);
  const [isBottomPaddleReset, setIsBottomPaddleReset] = useState(false);
  const [isBallReset, setIsBallReset] = useState(true);
  const ballRef = useRef();

  return (
    <GamePlayContext.Provider value={{
      audioPlayer,
      volume,
      speed,
      playTime,
      delay,
      level, setLevel,
      countdown, setCountdown,
      topScore, setTopScore,
      bottomScore, setBottomScore,
      topPaddlePosition, setTopPaddlePosition,
      topPaddleState, setTopPaddleState,
      bottomPaddlePosition, setBottomPaddlePosition,
      bottomPaddleState, setBottomPaddleState,
      isTopPaddleReset, setIsTopPaddleReset,
      isBottomPaddleReset, setIsBottomPaddleReset,
      isBallReset, setIsBallReset,
      ballRef,
    }}>
      {children}
    </GamePlayContext.Provider>
  );
};

export { useGamePlayContext, GamePlayContext, GamePlayProvider};