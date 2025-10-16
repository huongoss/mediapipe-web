import React from 'react';
import './ui.css';

export const SettingsPanel: React.FC<{
  onClose: ()=>void;
  values: { music:boolean; sfx:boolean; overlay:boolean };
  onChange: (v: Partial<{ music:boolean; sfx:boolean; overlay:boolean }>)=>void;
}> = ({ onClose, values, onChange }) => {
  return (
    <div className="hud">
      <div className="hud-row center-top">
        <div className="ui-card panel" style={{minWidth:320}}>
          <h3>Settings</h3>
          <div className="row"><span>Music</span><label className="toggle"><input type="checkbox" checked={values.music} onChange={e=>onChange({music:e.target.checked})}/><span>On</span></label></div>
          <div className="row"><span>SFX</span><label className="toggle"><input type="checkbox" checked={values.sfx} onChange={e=>onChange({sfx:e.target.checked})}/><span>On</span></label></div>
          <div className="row"><span>2D Overlay</span><label className="toggle"><input type="checkbox" checked={values.overlay} onChange={e=>onChange({overlay:e.target.checked})}/><span>Show</span></label></div>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
            <button className="button ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
