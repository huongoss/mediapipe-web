import * as THREE from 'three';
import { StoryStateSnapshot } from './StoryMode';

export class StoryEnvironment {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private torches: Array<{ mesh: THREE.Mesh; light: THREE.PointLight }>; 

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.torches = [];
    this.scene.add(this.group);
    this.createTempleTorches();
  }

  private createTempleTorches() {
    const makeTorch = (x: number, y: number) => {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a2f1b, roughness: 0.9, metalness: 0.0 })
      );
      base.position.set(x, y - 0.3, 0);

      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      flame.position.set(x, y, 0);

      const light = new THREE.PointLight(0xffaa55, 0, 2.5); // start off
      light.position.set(x, y, 0.2);

      this.group.add(base);
      this.group.add(flame);
      this.group.add(light);
      this.torches.push({ mesh: flame, light });
    };

    makeTorch(-1.2, 0.4);
    makeTorch(1.2, 0.4);
  }

  updateByStory(state: StoryStateSnapshot) {
    const chapter = state.chapters[state.chapterIndex];
    if (!chapter) return;

    // For Temple chapter, light torches progressively based on objective progress
    if (chapter.id === 'Temple') {
      const progressRatios = chapter.objectives.map(o => {
        const total = o.required.reduce((s, r) => s + (r.holdMs || 500), 0);
        const prog = o.required.reduce((s, r) => s + Math.min(o.progress[r.type] || 0, (r.holdMs || 500)), 0);
        return total > 0 ? (prog / total) : 0;
      });
      for (let i = 0; i < this.torches.length; i++) {
        const t = this.torches[i];
        const ratio = Math.min(1, progressRatios[i] ?? 0);
        (t.mesh.material as THREE.MeshBasicMaterial).color.setHSL(0.1 + 0.07 * ratio, 1.0, 0.5 + 0.2 * ratio);
        t.light.intensity = 0.0 + 2.2 * ratio;
        t.light.distance = 1.5 + 1.5 * ratio;
      }
    } else {
      // dim lights in other chapters but keep some ambiance
      this.torches.forEach(t => { t.light.intensity = 0.3; t.light.distance = 1.0; });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj)=>{
      const m = (obj as any).material as THREE.Material | undefined;
      if (m) m.dispose?.();
      const g = (obj as any).geometry as THREE.BufferGeometry | undefined;
      if (g) g.dispose?.();
    });
    this.torches = [];
  }
}
