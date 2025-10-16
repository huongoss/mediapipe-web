import React from 'react';
import './ui.css';

export type LeaderboardEntry = { name:string; score:number; date:number };

export const Leaderboard: React.FC<{
  entries: LeaderboardEntry[];
  onClose: ()=>void;
}> = ({ entries, onClose }) => {
  return (
    <div className="hud">
      <div className="hud-row center-top">
        <div className="ui-card panel leaderboard" style={{minWidth:340}}>
          <h3>Leaderboard</h3>
          {entries.length === 0 && <div className="entry"><span>No scores yet</span><span>—</span></div>}
          {entries.map((e,i)=> (
            <div className="entry" key={i}>
              <span>{i+1}. {e.name}</span>
              <strong>{e.score}</strong>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
            <button className="button ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
