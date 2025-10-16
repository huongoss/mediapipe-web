import React from 'react';
import './ui.css';

export type GameState = {
  score: number;
  multiplier: number;
  best: number;
  isTracking: boolean;
  isPaused: boolean;
  showOverlay: boolean;
  player?: string;
};

export type GameUIProps = GameState & {
  onToggleTracking: () => void;
  onToggleOverlay: () => void;
  onReset: () => void;
  onPause: () => void;
  onShare: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
};

export const GameUI: React.FC<GameUIProps> = (props) => {
  const { score, multiplier, best, isTracking, isPaused, showOverlay } = props;
  const [scorePulse, setScorePulse] = React.useState(false);
  const [theme, setTheme] = React.useState<'default'|'sakura'>('default');

  React.useEffect(()=>{
    setScorePulse(true);
    const t = setTimeout(()=> setScorePulse(false), 300);
    return ()=> clearTimeout(t);
  }, [score]);

  React.useEffect(()=>{
    const root = document.documentElement;
    if (theme === 'sakura') root.classList.add('theme-sakura'); else root.classList.remove('theme-sakura');
  }, [theme]);

  return (
    <div className="hud">
      <div className="hud-row top-left">
        <div className="ui-card panel">
          <h3>Controls</h3>
          <div className="row"><button className="button" onClick={props.onReset}>Restart</button><button className="button ghost" onClick={props.onPause}>{isPaused? 'Resume':'Pause'}</button></div>
          <div className="row"><button className="button" onClick={props.onToggleTracking}>{isTracking? 'Stop Camera':'Start Camera'}</button><button className="button ghost" onClick={props.onToggleOverlay}>{showOverlay? 'Hide 2D':'Show 2D'}</button></div>
          <div className="row"><button className="button secondary" onClick={props.onOpenSettings}>Settings</button><button className="button" onClick={props.onOpenLeaderboard}>Leaderboard</button></div>
          <div className="row"><button className="button" onClick={props.onShare}>Share</button><label className="toggle"><input type="checkbox" checked={theme==='sakura'} onChange={e=> setTheme(e.target.checked?'sakura':'default')} /><span>Sakura Theme</span></label></div>
        </div>
      </div>

      <div className="center-top">
        <div className={`score-badge ui-card ${scorePulse?'pulse':''}`}>
          Score: {score}
          <span className="multiplier">x{multiplier.toFixed(1)}</span>
          {/* <span className="combo">+Combo!</span> */}
        </div>
      </div>

      <div className="hud-row top-right">
        <div className="ui-card panel leaderboard">
          <h3>Best</h3>
          <div className="entry"><span>Personal</span><strong>{best}</strong></div>
        </div>
      </div>

      <div className="hud-row bottom-right">
        <div className="ui-card panel">
          <h3>Status</h3>
          <div className="row"><span>Tracking</span><strong style={{color: isTracking ? '#06d6a0':'#ef476f'}}>{isTracking? 'ON':'OFF'}</strong></div>
          <div className="row"><span>Game</span><strong>{isPaused? 'PAUSED':'LIVE'}</strong></div>
        </div>
      </div>
    </div>
  );
};
