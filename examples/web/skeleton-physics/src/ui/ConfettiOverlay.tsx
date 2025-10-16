import React, { useEffect, useImperativeHandle, useRef } from 'react';

export type ConfettiOverlayHandle = {
  burst: (x?: number, y?: number, count?: number) => void;
};

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; rot: number; vr: number;
};

export const ConfettiOverlay = React.forwardRef<ConfettiOverlayHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number|undefined>(undefined);

  const resize = () => {
    const c = canvasRef.current; if (!c) return;
    c.width = window.innerWidth; c.height = window.innerHeight;
  };

  const loop = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0,0,c.width,c.height);
    const g = 980; // px/s^2
    const dt = 1/60;

    particlesRef.current.forEach(p => {
      p.vy += g*dt*0.3;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.rot += p.vr*dt;
      p.life -= dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    particlesRef.current = particlesRef.current.filter(p=> p.life>0 && p.y < c.height+40);
    if (particlesRef.current.length>0){
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = undefined;
    }
  };

  const startLoopIfNeeded = () => {
    if (rafRef.current === undefined) rafRef.current = requestAnimationFrame(loop);
  };

  const burst = (x?: number, y?: number, count: number = 120) => {
    const c = canvasRef.current; if (!c) return;
    const cx = x ?? c.width/2;
    const cy = y ?? 60;
    const colors = ['#ffd166','#ef476f','#06d6a0','#118ab2','#ffd6ff'];
    for (let i=0;i<count;i++){
      const angle = (Math.random()*Math.PI) + (Math.PI/2 - Math.PI/4); // upward-ish fan
      const speed = 250 + Math.random()*420;
      const vx = Math.cos(angle)*speed;
      const vy = Math.sin(angle)*speed;
      particlesRef.current.push({
        x: cx + (Math.random()*40-20),
        y: cy,
        vx, vy: -Math.abs(vy),
        life: 0.9 + Math.random()*0.6,
        color: colors[i%colors.length],
        size: 6 + Math.random()*6,
        rot: Math.random()*Math.PI,
        vr: (Math.random()-0.5)*6
      });
    }
    startLoopIfNeeded();
  };

  useImperativeHandle(ref, ()=>({ burst }), []);

  useEffect(()=>{
    resize();
    window.addEventListener('resize', resize);
    return ()=> window.removeEventListener('resize', resize);
  },[]);

  return <canvas ref={canvasRef} style={{position:'fixed',inset:0,pointerEvents:'none'}} />;
});

ConfettiOverlay.displayName = 'ConfettiOverlay';
