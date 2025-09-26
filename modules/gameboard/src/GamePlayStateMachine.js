import { useEffect } from 'react';
import StateMachine from 'javascript-state-machine';
import {useGameContext} from './GameContext';
import {useGamePlayContext} from './GamePlayContext';
import { PongAPI } from 'dw-state-machine';
import * as TEXT from './loadText';

const GamePlayStateMachine = () => {
    const {
        pongAPI,
        setGamePlayStateMachine,
    } = useGameContext();

    const {
        speed,
        delay,
        setCountdown,
        setIsTopPaddleReset,
        setIsBottomPaddleReset,
        setIsBallReset,
        ballRef,
    } = useGamePlayContext();  

    useEffect(() => {
        const fsm = new StateMachine({   
            init: 'gameStarted',
            transitions: [
                { name: 'startGameReset', from: ["gameComplete"], to: 'gameReset' },
                { name: 'startLevelReset', from: ["gameStarted", "gameReset", "play"], to: 'levelReset' },
                { name: 'startCountdown', from: ['levelReset'], to: 'countdown' },
                { name: 'startNoCountdown', from: ['playReset'], to: 'noCountdown' },
                { name: 'startPlay', from: ['countdown', 'noCountdown'], to: 'play' },
                { name: 'startPlayReset', from: ['play'], to: 'playReset' },
                { name: 'endGame', from: ['play'], to: 'gameComplete' },
            ],
            methods: {
                onGameStarted: () => {
                    console.log('GamePlayStateMachine gameStarted state');
                },
                onGameReset: () => {
                    console.log('GamePlayStateMachine gameReset state');
                },
                onLevelReset: () => {
                    console.log('GamePlayStateMachine levelReset state');

                    setIsTopPaddleReset(false);                 
                    setIsBottomPaddleReset(false);                 
                    setIsBallReset(false);
    
                    const message =  { "transition": "reset" };
                    pongAPI.update(PongAPI.Topics.PADDLE_TOP_STATE_TRANSITION ,message );
                    pongAPI.update(PongAPI.Topics.PADDLE_BOTTOM_STATE_TRANSITION, message ); 
                },
                onPlayReset: () => {
                    console.log('GamePlayStateMachine playReset state');
                    setIsTopPaddleReset(false);                 
                    setIsBottomPaddleReset(false);                 
                    setIsBallReset(false);
        
                    const message =  { "transition": "reset" };
                    pongAPI.update(PongAPI.Topics.PADDLE_TOP_STATE_TRANSITION ,message );
                    pongAPI.update(PongAPI.Topics.PADDLE_BOTTOM_STATE_TRANSITION, message );
                },
                onCountdown: () => {
                    console.log('GamePlayStateMachine countdown state');

                    setCountdown(TEXT.countdown_three);
                    setTimeout(() => {
                        setCountdown(TEXT.countdown_two);
                        setTimeout(() => {
                            setCountdown(TEXT.countdown_one);
                            setTimeout(() => {
                                setCountdown(TEXT.countdown_go);
                                setTimeout(() => {
                                    setCountdown(TEXT.blank);
                                    fsm.startPlay();
                                    }, delay); 
                            }, delay); 
                        }, delay);
                    }, delay);
                },
                onNoCountdown: () => {
                    console.log('GamePlayStateMachine noCountdown state');

                    setTimeout(() => {
                        fsm.startPlay();
                    }, delay);                   
                },
                onPlay: () => {
                    console.log('GamePlayStateMachine play state');

                    if (ballRef && ballRef.current) {
                        ballRef.current.setLinvel({ x: 0, y: speed, z: 0 }, true);
                    }  
                },
                onGameComplete: () => {
                    console.log('GamePlayStateMachine gameComplete state');
                },
                onInvalidTransition: function(transition, from, to) {
                    console.log("transition '%s' not allowed from state '%s'", transition, from);
                    return false;
                },                    
            },
        });

        setGamePlayStateMachine(fsm);
    }, []);     

    return null;
};

export default GamePlayStateMachine;