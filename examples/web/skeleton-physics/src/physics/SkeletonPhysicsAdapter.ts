import * as THREE from 'three';
import { PhysicsSystem, PhysicsObject } from './PhysicsSystem';
import { SkeletonData, SkeletonJoint } from '../providers/SkeletonProvider';

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
  private lastSkeletonData: SkeletonData | null = null;
  private options: Required<SkeletonPhysicsOptions>;

  constructor(physicsSystem: PhysicsSystem, options: SkeletonPhysicsOptions = {}) {
    this.physicsSystem = physicsSystem;
    this.options = {
      jointMass: 2.0,
      jointRadius: 0.08,
      boneStiffness: 1000.0,
      damping: 25.0,
      enableCollisions: true,
      gravityScale: 1.0,
      ...options
    };
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

    this.lastSkeletonData = skeletonData;
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

  private updateJointPositions(skeletonData: SkeletonData): void {
    skeletonData.joints.forEach(joint => {
      if (joint.visibility < 0.5) return;

      const id = `skeleton_joint_${joint.id}`;
      const pos = joint.worldPosition;
      
      this.physicsSystem.setPosition(id, {
        x: -pos.x, // Mirror camera
        y: -pos.y, // Flip Y coordinate
        z: pos.z
      });
    });
  }

  private clearSkeleton(): void {
    // Remove all skeleton joints from physics system
    this.skeletonJoints.forEach((_, jointId) => {
      const id = `skeleton_joint_${jointId}`;
      this.physicsSystem.removeObject(id);
    });
    this.skeletonJoints.clear();
  }

  dispose(): void {
    this.clearSkeleton();
    // Don't dispose the physics system here - let the owner handle that
  }
}