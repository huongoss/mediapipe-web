import { SkeletonData } from '../providers/SkeletonProvider';

export type GestureType =
  | 'RaiseHands'
  | 'Crouch'
  | 'TurnLeft'
  | 'TurnRight'
  | 'TPose'
  | 'WideStance';

export interface DetectedGesture {
  type: GestureType;
  confidence: number; // 0..1
  heldMs: number; // how long the gesture has been continuously active
}

export class GestureRecognizer {
  // thresholds tuned for approximate normalized world coords
  private readonly minVisibility = 0.5;
  private lastActive: Map<GestureType, number> = new Map(); // timestamp when activated
  private activeNow: Set<GestureType> = new Set();

  detect(skel: SkeletonData | null, now = performance.now()): DetectedGesture[] {
    this.activeNow.clear();
    const out: DetectedGesture[] = [];
    if (!skel) return out;
    const j = (id: number) => skel.joints[id];

    const has = (...ids: number[]) => ids.every(id => j(id) && j(id).visibility >= this.minVisibility);

    // Basic vectors
    const ls = j(11), rs = j(12);
    const lh = j(23), rh = j(24);
  // const le = j(13), re = j(14);
    const lw = j(15), rw = j(16);
  // const lk = j(25), rk = j(26);
    const la = j(27), ra = j(28);
    const nose = j(0);

    // Center refs
  // const shoulderCenter = has(11,12) ? v3(ls.worldPosition).add(v3(rs.worldPosition)).multiplyScalar(0.5) : null;
  // const hipCenter = has(23,24) ? v3(lh.worldPosition).add(v3(rh.worldPosition)).multiplyScalar(0.5) : null;

    // RaiseHands: both wrists above head/shoulders
    if (has(15,16,11,12)) {
      const aboveL = lw.worldPosition.y < ls.worldPosition.y - 0.15; // note: world Y might be inverted in renderer; provider keeps raw
      const aboveR = rw.worldPosition.y < rs.worldPosition.y - 0.15;
      if (aboveL && aboveR) this.flag('RaiseHands');
    }

    // Crouch: hip-knee distance reduced and hip lower than usual (relative to shoulders)
    if (has(23,24,25,26,11,12)) {
      const hipY = (lh.worldPosition.y + rh.worldPosition.y) * 0.5;
      const shoulderY = (ls.worldPosition.y + rs.worldPosition.y) * 0.5;
      const crouch = hipY > shoulderY + 0.25; // lower (larger y) due to coordinate system from provider
      if (crouch) this.flag('Crouch');
    }

    // T-Pose: arms extended sideways (wrists wide relative to shoulders) and near shoulder height
    if (has(11,12,15,16)) {
      const shoulderWidth = Math.abs(ls.worldPosition.x - rs.worldPosition.x);
      const wristsWidth = Math.abs(lw.worldPosition.x - rw.worldPosition.x);
      const nearHeight = Math.abs(lw.worldPosition.y - ls.worldPosition.y) < 0.15 && Math.abs(rw.worldPosition.y - rs.worldPosition.y) < 0.15;
      if (wristsWidth > shoulderWidth * 1.6 && nearHeight) this.flag('TPose');
    }

    // WideStance: ankles wider than hips by factor
    if (has(27,28,23,24)) {
      const hipWidth = Math.abs(lh.worldPosition.x - rh.worldPosition.x);
      const ankleWidth = Math.abs(la.worldPosition.x - ra.worldPosition.x);
      if (ankleWidth > hipWidth * 1.5) this.flag('WideStance');
    }

    // Turn: compare shoulder line orientation; if head/nose offsets to left/right of hip center significantly
    if (has(0,11,12,23,24)) {
      const centerX = (lh.worldPosition.x + rh.worldPosition.x) * 0.5;
      const noseX = nose.worldPosition.x;
      const dx = noseX - centerX;
      if (dx < -0.12) this.flag('TurnLeft');
      else if (dx > 0.12) this.flag('TurnRight');
    }

    // Convert active set into outputs with confidence and held duration
    this.activeNow.forEach(t => {
      const since = this.lastActive.get(t) ?? now;
      this.lastActive.set(t, since);
      const heldMs = now - since;
      const confidence = Math.max(0, Math.min(1, heldMs / 600));
      out.push({ type: t, confidence, heldMs });
    });

    // remove non-active from lastActive so hold resets
    Array.from(this.lastActive.keys()).forEach(k => {
      if (!this.activeNow.has(k)) this.lastActive.delete(k);
    });

    return out;
  }

  private flag(t: GestureType) {
    this.activeNow.add(t);
  }
}
