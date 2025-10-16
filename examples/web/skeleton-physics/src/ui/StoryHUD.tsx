import React from 'react';
import { StoryStateSnapshot } from '../story/StoryMode';
import './ui.css';

export const StoryHUD: React.FC<{ state: StoryStateSnapshot }>=({ state })=>{
  const chapter = state.chapters[state.chapterIndex];
  return (
    <div className="story-hud">
      <div className="story-chip ui-card">
        <div className="title">{chapter.title}</div>
        <div className="narrative">{chapter.narrative}</div>
        <ul className="obj-list">
          {chapter.objectives.map(o=>{
            const total = o.required.reduce((s,r)=> s + (r.holdMs || 500), 0);
            const prog = o.required.reduce((s,r)=> s + Math.min(o.progress[r.type]||0, (r.holdMs||500)), 0);
            const pct = Math.round((prog/total)*100);
            return (
              <li key={o.id} className={o.done? 'done':''}>
                <span className="desc">{o.description}</span>
                <span className="bar"><i style={{width: pct+'%'}}/></span>
              </li>
            );
          })}
        </ul>
        {state.hint && <div className="hint">Hint: {state.hint}</div>}
      </div>
    </div>
  );
};
