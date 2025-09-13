import * as THREE from 'three';

export interface CollisionEffect {
  update(deltaSeconds: number): void;
  done: boolean;
  dispose(): void;
}

export interface CollisionEffectOptions {
  color?: THREE.Color | string | number;
  duration?: number; // seconds
  ringStartRadius?: number;
  ringEndRadius?: number;
  sparks?: number;
}

/**
 * Create a short-lived collision visual at a point.
 * - Expanding fading ring
 * - A few tiny sparks shooting outward and fading
 */
export function createCollisionEffect(
  scene: THREE.Scene,
  position: THREE.Vector3,
  opts: CollisionEffectOptions = {}
): CollisionEffect {
  const {
    color = 0xffffff,
    duration = 0.4,
    ringStartRadius = 0.03,
    ringEndRadius = 0.25,
    sparks = 8,
  } = opts;

  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);

  // Ring (flat facing camera-ish): use a torus tilted to face camera from most angles
  const ringGeom = new THREE.TorusGeometry(ringStartRadius, 0.006, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0, depthWrite: false });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  // Tilt ring so it's visible regardless of camera y-up
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Sparks: tiny spheres with random directions
  const sparksGeom = new THREE.SphereGeometry(0.01, 6, 6);
  const sparkMats: THREE.MeshBasicMaterial[] = [];
  const sparkVel: THREE.Vector3[] = [];
  const sparkMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < sparks; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0, depthWrite: false });
    const m = new THREE.Mesh(sparksGeom, mat);
    // Random direction in XY with small Z variance
    const dir = new THREE.Vector3(
      (Math.random() * 2 - 1),
      (Math.random() * 2 - 1),
      (Math.random() * 0.2 - 0.1)
    ).normalize();
    const speed = 0.6 + Math.random() * 0.8; // m/s
    sparkVel.push(dir.multiplyScalar(speed));
    // Slight random initial offset
    m.position.set((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, 0);
    group.add(m);
    sparkMeshes.push(m);
    sparkMats.push(mat);
  }

  let elapsed = 0;
  let done = false;

  function update(deltaSeconds: number) {
    if (done) return;
    elapsed += deltaSeconds;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 2); // ease-out

    // Ring expansion and fade
    const radius = THREE.MathUtils.lerp(ringStartRadius, ringEndRadius, ease);
    const thickness = THREE.MathUtils.lerp(0.006, 0.002, ease);
    // Update torus scale to represent radius change
    const scale = radius / ringStartRadius;
    ring.scale.setScalar(scale);
    (ring.material as THREE.MeshBasicMaterial).opacity = 1.0 - ease;
    // Fake thickness change by scaling Y
    ring.scale.y = Math.max(0.2, 1.0 - ease * 0.8);

    // Sparks movement and fade
    for (let i = 0; i < sparkMeshes.length; i++) {
      const m = sparkMeshes[i];
      const v = sparkVel[i];
      m.position.addScaledVector(v, deltaSeconds);
      const mat = sparkMats[i];
      mat.opacity = 1.0 - ease;
    }

    if (elapsed >= duration) {
      done = true;
    }
  }

  function dispose() {
    scene.remove(group);
    ringGeom.dispose();
    (ring.material as THREE.Material).dispose();
    sparksGeom.dispose();
    sparkMats.forEach((m) => m.dispose());
  }

  return { update, dispose, get done() { return done; } };
}
