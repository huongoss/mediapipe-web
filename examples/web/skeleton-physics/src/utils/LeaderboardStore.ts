export type ScoreEntry = { name: string; score: number; date: number };

const KEY = 'skeleton_physics_leaderboard_v1';

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    return arr.sort((a,b)=> b.score - a.score).slice(0, 20);
  } catch { return []; }
}

export function saveScore(entry: ScoreEntry) {
  const arr = loadScores();
  arr.push(entry);
  localStorage.setItem(KEY, JSON.stringify(arr));
}
