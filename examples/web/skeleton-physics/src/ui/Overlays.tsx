import React from 'react';
import './ui.css';

export const HomeOverlay: React.FC<{ onStart: ()=>void; onLeaderboard: ()=>void; onStory: ()=>void; }>=({onStart,onLeaderboard,onStory})=> (
  <div className="overlay">
    <div className="overlay-card">
      <h1>Skeleton Physics</h1>
      <p>Move your body to smack the balls. Rack up combos and chase milestones!</p>
      <div className="overlay-row">
        <button className="button" onClick={onStart}>Start</button>
        <button className="button secondary" onClick={onLeaderboard}>Leaderboard</button>
        <button className="button ghost" onClick={onStory}>Story Mode</button>
      </div>
    </div>
  </div>
);

export const PauseOverlay: React.FC<{ onResume: ()=>void; onRestart: ()=>void; }>=({onResume,onRestart})=> (
  <div className="overlay">
    <div className="overlay-card">
      <h1>Paused</h1>
      <div className="overlay-row">
        <button className="button" onClick={onResume}>Resume</button>
        <button className="button ghost" onClick={onRestart}>Restart</button>
      </div>
    </div>
  </div>
);

export const ResultOverlay: React.FC<{ score:number; best:number; onShare:()=>void; onPlayAgain:()=>void }>=({score,best,onShare,onPlayAgain})=> (
  <div className="overlay">
    <div className="overlay-card">
      <h1>Result</h1>
      <p>Score: <strong>{score}</strong></p>
      <p>Best: <strong>{best}</strong></p>
      <div className="overlay-row">
        <button className="button" onClick={onPlayAgain}>Play again</button>
        <button className="button secondary" onClick={onShare}>Share</button>
      </div>
    </div>
  </div>
);
