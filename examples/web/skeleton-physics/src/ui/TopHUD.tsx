import React from 'react';
import './ui.css';

export const TopHUD: React.FC<{
  score: number;
  multiplier: number;
  best: number;
}> = ({ score, multiplier, best }) => {
  const pct = Math.min(100, Math.max(0, (multiplier - 1) / 2 * 100)); // 1..3 -> 0..100%
  return (
    <div className="top-hud">
      <div className="hud-chip">
        <span>Best</span>
        <strong>{best}</strong>
      </div>
      <div className="score-pill">
        <span>Score</span>
        <strong>{score}</strong>
        <span className="x">x{multiplier.toFixed(1)}</span>
      </div>
      <div className="combo-bar">
        <div className="combo-fill" style={{ width: pct + '%' }} />
      </div>
    </div>
  );
};
