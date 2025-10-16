import { GestureRecognizer, DetectedGesture, GestureType } from './GestureRecognizer';

export type ChapterId = 'Temple' | 'Forest' | 'Mountain' | 'Awakening';

export interface Objective {
  id: string;
  description: string;
  required: Array<{ type: GestureType; holdMs?: number }>; // sequence simplified: any order for now
  progress: Record<GestureType, number>; // ms held per gesture
  done: boolean;
}

export interface Chapter {
  id: ChapterId;
  title: string;
  narrative: string;
  objectives: Objective[];
  done: boolean;
}

export interface StoryStateSnapshot {
  chapterIndex: number;
  chapters: Chapter[];
  currentObjectives: Objective[];
  hint?: string;
}

export class StoryMode {
  private recognizer = new GestureRecognizer();
  private chapters: Chapter[];
  private chapterIndex = 0;

  constructor() {
    this.chapters = [
      {
        id: 'Temple',
        title: 'Chapter 1 — The Forgotten Temple',
        narrative: 'Learn the ancient motions to light the torches.',
        objectives: [
          this.obj('torch_left', 'Raise your hands to summon fire', [{ type: 'RaiseHands', holdMs: 800 }]),
          this.obj('balance', 'Hold a wide stance to steady your flame', [{ type: 'WideStance', holdMs: 800 }])
        ],
        done: false
      },
      {
        id: 'Forest',
        title: 'Chapter 2 — Forest of Echoes',
        narrative: 'Use balance poses to awaken the tree spirits.',
        objectives: [
          this.obj('tpose', 'Stretch into a T-pose to resonate with the forest', [{ type: 'TPose', holdMs: 1000 }])
        ],
        done: false
      },
      {
        id: 'Mountain',
        title: 'Chapter 3 — Mountain of Trials',
        narrative: 'Adopt warrior stances and face the stone guardians.',
        objectives: [
          this.obj('stance', 'Take a wide stance', [{ type: 'WideStance', holdMs: 1000 }]),
          this.obj('turn', 'Turn left then right to dodge', [{ type: 'TurnLeft', holdMs: 500 }, { type: 'TurnRight', holdMs: 500 }])
        ],
        done: false
      },
      {
        id: 'Awakening',
        title: 'Final — The Awakening',
        narrative: 'Combine all motions in a closing ritual to restore balance.',
        objectives: [
          this.obj('ritual', 'Raise hands, T-pose, then crouch', [
            { type: 'RaiseHands', holdMs: 700 },
            { type: 'TPose', holdMs: 800 },
            { type: 'Crouch', holdMs: 700 }
          ])
        ],
        done: false
      }
    ];
  }

  private obj(id: string, description: string, required: Array<{ type: GestureType; holdMs?: number }>): Objective {
    const zero: Record<GestureType, number> = {
      RaiseHands: 0,
      Crouch: 0,
      TurnLeft: 0,
      TurnRight: 0,
      TPose: 0,
      WideStance: 0
    };
    return { id, description, required, progress: zero, done: false };
  }

  updateSkeleton(skeleton: any) {
    const detections = this.recognizer.detect(skeleton);
    this.advance(detections);
  }

  getSnapshot(): StoryStateSnapshot {
    const chapter = this.chapters[this.chapterIndex];
    return {
      chapterIndex: this.chapterIndex,
      chapters: this.chapters,
      currentObjectives: chapter.objectives,
      hint: this.suggestHint(chapter)
    };
  }

  private advance(detections: DetectedGesture[]) {
    const chapter = this.chapters[this.chapterIndex];
    if (!chapter) return;

    // update objective progress
    for (const obj of chapter.objectives) {
      if (obj.done) continue;
      // initialize required gestures progress
      obj.required.forEach(r => { if (obj.progress[r.type] === undefined) obj.progress[r.type] = 0; });
      // apply detections
      for (const d of detections) {
        if (obj.progress[d.type] !== undefined) {
          obj.progress[d.type] = Math.max(obj.progress[d.type], d.heldMs);
        }
      }
      // check completion
      const allMet = obj.required.every(r => (obj.progress[r.type] || 0) >= (r.holdMs || 500));
      obj.done = allMet;
    }

    // advance chapter if all objectives done
    if (chapter.objectives.every(o => o.done)) {
      chapter.done = true;
      this.chapterIndex = Math.min(this.chapterIndex + 1, this.chapters.length - 1);
    }
  }

  private suggestHint(chapter: Chapter): string | undefined {
    const next = chapter.objectives.find(o => !o.done);
    if (!next) return 'Chapter complete!';
    return next.description;
  }
}
