import * as THREE from 'three';

export class TrailParticles {
  private scene: THREE.Scene;
  private max: number;
  private positions: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private colors: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private gravity = new THREE.Vector3(0, -3.5, 0);

  constructor(scene: THREE.Scene, maxParticles = 1000) {
    this.scene = scene;
    this.max = maxParticles;
    this.positions = new Float32Array(this.max * 3);
    this.velocities = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.colors = new Float32Array(this.max * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, this.max);

    this.material = new THREE.PointsMaterial({
      size: 0.05,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(dt: number) {
    const g = this.gravity;
    const pos = this.positions;
    const vel = this.velocities;
    const life = this.life;

    let anyAlive = false;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      anyAlive = true;
      // integrate
      const i3 = i * 3;
      vel[i3] += g.x * dt;
      vel[i3 + 1] += g.y * dt;
      vel[i3 + 2] += g.z * dt;

      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      // decay
      life[i] -= dt;
      // simple floor bounce
      if (pos[i3 + 1] < -2) {
        pos[i3 + 1] = -2;
        vel[i3 + 1] *= -0.4;
      }
    }

    if (anyAlive) {
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  burst(position: THREE.Vector3, color: THREE.Color, count = 30) {
    // spawn up to count particles
    for (let n = 0; n < count; n++) {
      const i = this.findSlot();
      const i3 = i * 3;
      this.positions[i3] = position.x;
      this.positions[i3 + 1] = position.y;
      this.positions[i3 + 2] = position.z;

      // velocity in a hemispherical cone
      const dir = new THREE.Vector3(
        (Math.random() * 2 - 1),
        Math.random(),
        (Math.random() * 2 - 1)
      ).normalize();
      const speed = 2 + Math.random() * 3;
      this.velocities[i3] = dir.x * speed;
      this.velocities[i3 + 1] = dir.y * speed;
      this.velocities[i3 + 2] = dir.z * speed;

      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      this.life[i] = 0.8 + Math.random() * 0.6;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }

  private findSlot(): number {
    // naive linear search; fine for 1k particles
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) return i;
    }
    // overwrite the oldest by picking a random index
    return Math.floor(Math.random() * this.max);
  }
}
