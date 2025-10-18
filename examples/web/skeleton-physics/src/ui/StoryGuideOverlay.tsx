import React, { useEffect, useRef } from 'react';
import { GestureType } from '../story/GestureRecognizer';

export const StoryGuideOverlay: React.FC<{ gesture: GestureType | null }>=({ gesture })=>{
  const canvasRef = useRef<HTMLCanvasElement|null>(null);

  useEffect(()=>{
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let raf = 0;

    const drawStickFigure = (ctx:CanvasRenderingContext2D, cx:number, cy:number, U:number, config:{
      arms:'up'|'t'|'neutral'; legs:'wide'|'neutral'|'crouch'; headTurn:-1|0|1;
    })=>{
      // Joints based on simple rig
      const head = { x: cx, y: cy - U*2.6 };
      const neck = { x: cx, y: cy - U*2.0 };
      const ls = { x: cx - U*0.8, y: cy - U*1.8 };
      const rs = { x: cx + U*0.8, y: cy - U*1.8 };
      const hipL = { x: cx - U*0.6, y: cy - U*0.2 };
      const hipR = { x: cx + U*0.6, y: cy - U*0.2 };
      let elL = { x: ls.x - U*0.5, y: ls.y + U*0.5 };
      let elR = { x: rs.x + U*0.5, y: rs.y + U*0.5 };
      let wrL = { x: elL.x - U*0.5, y: elL.y + U*0.5 };
      let wrR = { x: elR.x + U*0.5, y: elR.y + U*0.5 };
      let knL = { x: hipL.x - U*0.2, y: hipL.y + U*1.2 };
      let knR = { x: hipR.x + U*0.2, y: hipR.y + U*1.2 };
      let anL = { x: knL.x - U*0.1, y: knL.y + U*1.0 };
      let anR = { x: knR.x + U*0.1, y: knR.y + U*1.0 };

      // Arms config
      if (config.arms === 'up') {
        elL = { x: ls.x - U*0.2, y: ls.y - U*0.6 };
        elR = { x: rs.x + U*0.2, y: rs.y - U*0.6 };
        wrL = { x: elL.x - U*0.2, y: elL.y - U*0.6 };
        wrR = { x: elR.x + U*0.2, y: elR.y - U*0.6 };
      } else if (config.arms === 't') {
        elL = { x: ls.x - U*0.8, y: ls.y };
        elR = { x: rs.x + U*0.8, y: rs.y };
        wrL = { x: elL.x - U*0.8, y: elL.y };
        wrR = { x: elR.x + U*0.8, y: elR.y };
      }

      // Legs config
      if (config.legs === 'wide') {
        knL = { x: hipL.x - U*0.6, y: hipL.y + U*1.1 };
        knR = { x: hipR.x + U*0.6, y: hipR.y + U*1.1 };
        anL = { x: knL.x - U*0.2, y: knL.y + U*1.0 };
        anR = { x: knR.x + U*0.2, y: knR.y + U*1.0 };
      } else if (config.legs === 'crouch') {
        // drop hips and bend knees
        hipL.y += U*0.8; hipR.y += U*0.8;
        knL = { x: hipL.x - U*0.3, y: hipL.y + U*0.7 };
        knR = { x: hipR.x + U*0.3, y: hipR.y + U*0.7 };
        anL = { x: knL.x - U*0.2, y: knL.y + U*0.8 };
        anR = { x: knR.x + U*0.2, y: knR.y + U*0.8 };
      }

      const bones = [
        [head, neck], [neck, ls], [neck, rs], [ls, hipL], [rs, hipR], [hipL, hipR],
        [ls, elL], [elL, wrL], [rs, elR], [elR, wrR], [hipL, knL], [knL, anL], [hipR, knR], [knR, anR]
      ];

      // Draw
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,209,102,0.85)';
      for (const [a,b] of bones){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
      const joints = [head, neck, ls, rs, hipL, hipR, elL, elR, wrL, wrR, knL, knR, anL, anR];
      ctx.fillStyle = 'rgba(255,209,102,0.85)';
      joints.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); });

      // head turn indicator
      if (config.headTurn !== 0){
        const dir = config.headTurn;
        const y = head.y - U*0.1;
        ctx.beginPath(); ctx.moveTo(head.x, y); ctx.lineTo(head.x + dir*U*0.8, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(head.x + dir*U*0.8, y); ctx.lineTo(head.x + dir*U*0.6, y - U*0.2); ctx.lineTo(head.x + dir*U*0.6, y + U*0.2); ctx.closePath(); ctx.fill();
      }
    };

    const render = ()=>{
      const ctx = c.getContext('2d'); if (!ctx) return;
      const w = window.innerWidth, h = window.innerHeight;
      const U = Math.min(w, h) * 0.09; // unit scale
      const cx = w * 0.5, cy = h * 0.65;
      c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0,0,w,h);

      if (!gesture) return;

      // caption
      ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const label = (
        gesture === 'RaiseHands' ? 'Raise both hands overhead' :
        gesture === 'TPose' ? 'Extend both arms horizontally (T-pose)' :
        gesture === 'WideStance' ? 'Step feet wide apart' :
        gesture === 'Crouch' ? 'Lower hips into a crouch' :
        gesture === 'TurnLeft' ? 'Turn head/torso left' :
        'Turn head/torso right'
      );
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy - U*3.2);

      // pick config per gesture
      const config = (
        gesture === 'RaiseHands' ? { arms:'up', legs:'neutral', headTurn:0 } :
        gesture === 'TPose' ? { arms:'t', legs:'neutral', headTurn:0 } :
        gesture === 'WideStance' ? { arms:'neutral', legs:'wide', headTurn:0 } :
        gesture === 'Crouch' ? { arms:'neutral', legs:'crouch', headTurn:0 } :
        gesture === 'TurnLeft' ? { arms:'neutral', legs:'neutral', headTurn:-1 } :
        { arms:'neutral', legs:'neutral', headTurn:1 }
      ) as { arms:'up'|'t'|'neutral'; legs:'wide'|'neutral'|'crouch'; headTurn:-1|0|1 };

      drawStickFigure(ctx, cx, cy, U, config);
    };

    const onResize = ()=> render();
    window.addEventListener('resize', onResize);
    render();
    return ()=> { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [gesture]);

  return <canvas ref={canvasRef} style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:1200}}/>;
};
