type Stat = {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const sections: Record<string, Stat> = {};
const inFlight: Map<string, number> = new Map();
const fpsGroups: Record<string, { lastTime: number; frames: number; fpsEma: number }>= {};

let enabled = false;
let summaryTimer: number | null = null;

function shouldEnable(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('perf') === '1' || params.get('perf') === 'true') return true;
    const ls = localStorage.getItem('perf');
    if (ls === '1' || ls === 'true') return true;
  } catch {}
  return true; // Default to enabled to diagnose slowness
}

function ensureStarted(): void {
  if (!enabled && typeof window !== 'undefined') {
    enabled = shouldEnable();
  }
  if (enabled && summaryTimer === null && typeof window !== 'undefined') {
    summaryTimer = window.setInterval(logSummary, 2000);
  }
}

export const Perf = {
  enable(force = true) {
    enabled = force;
    if (enabled && summaryTimer === null && typeof window !== 'undefined') {
      summaryTimer = window.setInterval(logSummary, 2000);
    }
  },
  disable() {
    enabled = false;
    if (summaryTimer !== null) {
      clearInterval(summaryTimer);
      summaryTimer = null;
    }
  },
  start(label: string): number {
    ensureStarted();
    const t = performance.now();
    if (enabled) inFlight.set(label, t);
    return t;
  },
  end(label: string, startTime?: number): number {
    if (!enabled) return 0;
    const start = startTime ?? inFlight.get(label);
    if (start === undefined) return 0;
    const dt = performance.now() - start;
    inFlight.delete(label);
    let s = sections[label];
    if (!s) {
      s = sections[label] = { count: 0, totalMs: 0, minMs: Number.POSITIVE_INFINITY, maxMs: 0, lastMs: 0 };
    }
    s.count += 1;
    s.totalMs += dt;
    s.lastMs = dt;
    if (dt < s.minMs) s.minMs = dt;
    if (dt > s.maxMs) s.maxMs = dt;
    return dt;
  },
  frameTick(group: string): void {
    ensureStarted();
    if (!enabled) return;
    const now = performance.now();
    let g = fpsGroups[group];
    if (!g) {
      fpsGroups[group] = g = { lastTime: now, frames: 0, fpsEma: 0 };
    }
    const dt = Math.max(1, now - g.lastTime);
    const fps = 1000 / dt;
    g.fpsEma = g.frames === 0 ? fps : (0.9 * g.fpsEma + 0.1 * fps);
    g.lastTime = now;
    g.frames += 1;
  },
  getSections(): Array<{ label: string; avg: number; last: number; min: number; max: number; count: number }>{
    return Object.entries(sections).map(([label, s]) => ({
      label,
      avg: s.totalMs / Math.max(1, s.count),
      last: s.lastMs,
      min: isFinite(s.minMs) ? s.minMs : 0,
      max: s.maxMs,
      count: s.count,
    })).sort((a,b)=> b.avg - a.avg);
  },
  getFps(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(fpsGroups)) out[k] = Number(v.fpsEma.toFixed(1));
    return out;
  }
};

function logSummary(): void {
  if (!enabled) return;
  const top = Perf.getSections().slice(0, 10);
  const fps = Perf.getFps();
  const fpsStr = Object.entries(fps).map(([k,v])=>`${k}:${v}fps`).join('  ');
  // eslint-disable-next-line no-console
  console.log('%c⏱ Perf', 'color:#34d399;font-weight:700', fpsStr, top);
}

export default Perf;
