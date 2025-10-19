import React from 'react';
import './ui.css';

export const SettingsPanel: React.FC<{
  onClose: ()=>void;
  values: { music:boolean; musicVolume:number; sfx:boolean; overlay:boolean };
  onChange: (v: Partial<{ music:boolean; musicVolume:number; sfx:boolean; overlay:boolean }>)=>void;
}> = ({ onClose, values, onChange }) => {
  return (
    <div className="settings-modal" role="dialog" aria-modal="true">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-card ui-card">
        <button className="settings-close" aria-label="Close settings" onClick={onClose}>✕</button>
        <h3 className="settings-title">Settings</h3>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-label">Music</div>
            <label className="toggle"><input type="checkbox" checked={values.music} onChange={e=>onChange({music:e.target.checked})}/><span>On</span></label>
          </div>
          <div className="settings-row">
            <div className="settings-label">Music Volume</div>
            <input className="settings-range" type="range" min={0} max={1} step={0.01} value={values.musicVolume} onChange={e=>onChange({musicVolume: parseFloat(e.target.value)})}/>
            <div className="settings-value">{Math.round(values.musicVolume*100)}%</div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-label">SFX</div>
            <label className="toggle"><input type="checkbox" checked={values.sfx} onChange={e=>onChange({sfx:e.target.checked})}/><span>On</span></label>
          </div>
          <div className="settings-row">
            <div className="settings-label">2D Overlay</div>
            <label className="toggle"><input type="checkbox" checked={values.overlay} onChange={e=>onChange({overlay:e.target.checked})}/><span>Show</span></label>
          </div>
        </div>

        <div className="settings-actions">
          <button className="button ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
