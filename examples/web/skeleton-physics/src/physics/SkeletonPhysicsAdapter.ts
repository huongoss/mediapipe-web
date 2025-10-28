import * as THREE from 'three';
import { PhysicsSystem, PhysicsObject } from './PhysicsSystem';
import { SkeletonData } from '../providers/SkeletonProvider';

export interface SkeletonPhysicsOptions {
  jointMass?: number;
  jointRadius?: number;
  boneStiffness?: number;
  damping?: number;
  enableCollisions?: boolean;
  gravityScale?: number;
}

/**
 * Adapter that adds skeleton-specific functionality to the generic PhysicsSystem
 * Maintains separation between general physics and skeleton-specific logic
 */
export class SkeletonPhysicsAdapter {
  private physicsSystem: PhysicsSystem;
  private skeletonJoints: Map<number, PhysicsObject> = new Map();
  private rendererRef: any = null; // Reference to renderer for getting VRM bone segments
  // private lastSkeletonData: SkeletonData | null = null;
  // private options: Required<SkeletonPhysicsOptions>;

  constructor(physicsSystem: PhysicsSystem, _options: SkeletonPhysicsOptions = {}) {
    this.physicsSystem = physicsSystem;
    // Options could be used to adjust physics parameters in future
  }

  /**
   * Set renderer reference to get VRM bone segments
   */
  setRenderer(renderer: any): void {
    this.rendererRef = renderer;
  }

  /**
   * Update skeleton physics based on pose data
   * Creates/updates kinematic bodies for skeleton joints
   */
  updateSkeleton(skeletonData: SkeletonData | null): void {
    if (!this.physicsSystem.isReady() || !skeletonData) {
      //console.warn('⚠️ Physics system not ready, skipping skeleton update');
      return;
    }

    this.updateJointPositions(skeletonData);

  // this.lastSkeletonData = skeletonData;
  }

  /**
   * Get physics joint positions for rendering
   */
  getPhysicsJointPositions(): Map<number, THREE.Vector3> {
    const positions = new Map<number, THREE.Vector3>();

    this.skeletonJoints.forEach((physicsObject, jointId) => {
      try {
        const pos = physicsObject.rigidBody.translation();
        positions.set(jointId, new THREE.Vector3(pos.x, pos.y, pos.z));
      } catch (error) {
        console.error(`❌ Failed to get position for joint ${jointId}:`, error);
      }
    });

    return positions;
  }

  /**
   * Add a physics object that can interact with the skeleton
   * Compatible with the original SkeletonPhysicsSystem interface
   */
  addPhysicsObject(
    position: THREE.Vector3,
    geometry: 'box' | 'sphere' | 'capsule',
    size: THREE.Vector3,
    mass: number = 0.01
  ): { rigidBody: any; collider: any } {
    if (geometry === 'sphere') {
      // Use the PhysicsSystem's createBall method
      const id = `ball_${Date.now()}_${Math.random()}`;
      const physicsObject = this.physicsSystem.createBall(
        id,
        { x: position.x, y: position.y, z: position.z },
        size.x, // radius
        mass
      );

      if (!physicsObject) {
        throw new Error('Failed to create physics ball');
      }

      return {
        rigidBody: physicsObject.rigidBody,
        collider: physicsObject.collider
      };
    }

    // For other geometries, would need to extend PhysicsSystem or create directly
    throw new Error(`Geometry "${geometry}" not yet supported by PhysicsSystem`);
  }

  /**
   * Step the physics simulation (delegates to PhysicsSystem)
   */
  step(): void {
    this.physicsSystem.step();
  }

  /**
   * Apply force to skeleton joint
   */
  applyForceToJoint(jointId: number, force: THREE.Vector3): void {
    const physicsObject = this.skeletonJoints.get(jointId);
    if (physicsObject) {
      try {
        physicsObject.rigidBody.addForce({ x: force.x, y: force.y, z: force.z }, true);
      } catch (error) {
        console.error(`❌ Failed to apply force to joint ${jointId}:`, error);
      }
    }
  }

  /**
   * Get the underlying physics system
   */
  getPhysicsSystem(): PhysicsSystem {
    return this.physicsSystem;
  }

  private updateJointPositions(_skeletonData: SkeletonData): void {
    // Use VRM bone segments from renderer instead of MediaPipe joints for consistency
    if (!this.rendererRef?.getBoneWorldSegments) {
      console.warn('⚠️ Renderer not set or missing getBoneWorldSegments method');
      return;
    }

    const boneSegments = this.rendererRef.getBoneWorldSegments();
    const boneRadius = this.rendererRef.getBoneRadius?.() ?? 0.05;

    // Clear existing joints
    this.clearSkeleton();

    // Create physics bodies for bone segments (as spheres at segment centers)
    boneSegments.forEach((segment: any) => {
      const center = new THREE.Vector3().addVectors(segment.start, segment.end).multiplyScalar(0.5);
      
      // Ensure skeleton collision is near Z=0 to match ball spawns
      center.z = 0;
      
      const id = `skeleton_bone_${segment.fromId}_${segment.toId}`;
      
      // Create kinematic sphere at bone center (mass = 0 makes it kinematic-like)
      const physicsObject = this.physicsSystem.createBall(
        id,
        { x: center.x, y: center.y, z: center.z },
        boneRadius,
        0 // kinematic (mass = 0)
      );

      if (physicsObject) {
        // Use as-is - mass 0 should make it behave kinematically
        this.skeletonJoints.set(segment.fromId * 1000 + segment.toId, physicsObject);
      }
    });
  }

  private clearSkeleton(): void {
    // Remove all skeleton joints from physics system
    this.skeletonJoints.forEach((_, jointKey) => {
      const fromId = Math.floor(jointKey / 1000);
      const toId = jointKey % 1000;
      const id = `skeleton_bone_${fromId}_${toId}`;
      this.physicsSystem.removeObject(id);
    });
    this.skeletonJoints.clear();
  }

  dispose(): void {
    this.clearSkeleton();
    // Don't dispose the physics system here - let the owner handle that
  }
}