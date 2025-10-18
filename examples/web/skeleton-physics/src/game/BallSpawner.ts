import * as THREE from 'three';

export interface BallSpawnOptions {
  // Which horizontal side to spawn from
  side?: 'left' | 'right' | 'random';
  // Absolute horizontal distance from center in meters [min, max]
  xRange?: [number, number];
  // zRange was removed; gameplay stays near z=0
  // Vertical height in meters [min, max]
  yRange?: [number, number];
  // Target Y to aim toward (center height)
  targetY?: number;
  // Initial speed magnitude in m/s [min, max]
  speedRange?: [number, number];
}

export interface BallSpawnData {
  position: THREE.Vector3;
  velocity: { x: number; y: number; z: number };
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}


/**
 * Generate spawn data for a ball: a start position (z=0) and initial velocity
 * pointing roughly toward the scene center at a target Y height.
 */
export function generateBallSpawn(options: BallSpawnOptions = {}): BallSpawnData {
  const {
    xRange = [-1.0, 1.],
    yRange = [2, 3],
    targetY = 1.0,
    speedRange = [0.8, 1.6],

  } = options;

  const spawnX = randBetween(xRange[0], xRange[1]);
  const spawnY = randBetween(yRange[0], yRange[1]);

  const position = new THREE.Vector3(spawnX, spawnY, 0);

  const target = new THREE.Vector3(0, targetY, 0);
  const dir = new THREE.Vector3().subVectors(target, position).normalize();
  const speed = randBetween(speedRange[0], speedRange[1]);
  // Keep gameplay near the camera plane: avoid Z drift for better visibility
  const velocity = { x: dir.x * speed, y: dir.y * speed, z: 0 };

  return { position, velocity };
}
