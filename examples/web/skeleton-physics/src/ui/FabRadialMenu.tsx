import React from 'react';
import './ui.css';

type FabAction = {
  id: string;
  label: string;
  onClick: () => void;
  emoji?: string;
};

export const FabRadialMenu: React.FC<{
  actions: FabAction[];
  open?: boolean;
  onToggle?: (open: boolean)=>void;
}> = ({ actions, open: openProp, onToggle }) => {
  const [open, setOpen] = React.useState(!!openProp);
  React.useEffect(()=>{ if (openProp !== undefined) setOpen(openProp); }, [openProp]);
  const toggle = () => {
    const next = !open; setOpen(next); onToggle?.(next);
  };

  return (
    <div className={`fab ${open? 'open':''}`}>
      <button aria-label="menu" className="fab-main" onClick={toggle}>⚡</button>
      <div className="fab-ring">
        {actions.map((a, i)=> (
          <button key={a.id} className={`fab-item i${i}`} onClick={a.onClick} aria-label={a.label} title={a.label}>
            <span className="fab-emoji">{a.emoji ?? '•'}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
