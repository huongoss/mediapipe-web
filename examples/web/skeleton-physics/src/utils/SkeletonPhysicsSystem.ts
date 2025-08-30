import RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import { SkeletonData, SkeletonJoint } from '../providers/SkeletonProvider';

export interface PhysicsJoint {
  id: number;
  name: string;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh?: THREE.Mesh;
}

export interface PhysicsBone {
  jointA: number;
  jointB: number;
  constraint?: RAPIER.ImpulseJoint;
}

export interface SkeletonPhysicsOptions {
  jointMass?: number;
  jointRadius?: number;
  boneStiffness?: number;
  damping?: number;
  enableCollisions?: boolean;
  gravityScale?: number;
}

/**
 * Physics system for skeleton-based games using Rapier3D
 * Creates physics bodies for skeleton joints and constraints for bones
 */
export class SkeletonPhysicsSystem {
  private world!: RAPIER.World;
  private physicsJoints: Map<number, PhysicsJoint> = new Map();
  private physicsBones: PhysicsBone[] = [];
  private options: Required<SkeletonPhysicsOptions>;
  private lastSkeletonData: SkeletonData | null = null;
  private isInitialized = false;

  constructor(options: SkeletonPhysicsOptions = {}) {
    this.options = {
      jointMass: 1.0,
      jointRadius: 0.05,
      boneStiffness: 1000.0,
      damping: 50.0,
      enableCollisions: true,
      gravityScale: 1.0,
      ...options
    };

    this.initializePhysics();
  }

  private async initializePhysics(): Promise<void> {
    // Rapier3D doesn't need init() in newer versions
    const gravity = new RAPIER.Vector3(0.0, -9.81 * this.options.gravityScale, 0.0);
    this.world = new RAPIER.World(gravity);
    this.isInitialized = true;
  }

  /**
   * Update the physics skeleton with new pose data
   */
  async updateSkeleton(skeletonData: SkeletonData | null): Promise<void> {
    if (!this.isInitialized) {
      await this.initializePhysics();
    }

    if (!skeletonData) {
      this.clearPhysicsSkeleton();
      return;
    }

    // If this is the first skeleton or significantly different, rebuild
    if (this.shouldRebuildSkeleton(skeletonData)) {
      this.buildPhysicsSkeleton(skeletonData);
    } else {
      this.updatePhysicsPositions(skeletonData);
    }

    this.lastSkeletonData = skeletonData;
  }

  private shouldRebuildSkeleton(skeletonData: SkeletonData): boolean {
    if (!this.lastSkeletonData || this.physicsJoints.size === 0) {
      return true;
    }

    // Rebuild if joint count changed significantly
    const visibleJoints = skeletonData.joints.filter(j => j.visibility > 0.5).length;
    const lastVisibleJoints = this.lastSkeletonData.joints.filter(j => j.visibility > 0.5).length;
    
    return Math.abs(visibleJoints - lastVisibleJoints) > 5;
  }

  private buildPhysicsSkeleton(skeletonData: SkeletonData): void {
    this.clearPhysicsSkeleton();

    // Create physics bodies for each joint
    skeletonData.joints.forEach(joint => {
      if (joint.visibility > 0.5) {
        this.createPhysicsJoint(joint);
      }
    });

    // Create constraints between connected joints
    this.createBoneConstraints(skeletonData.joints);
  }

  private createPhysicsJoint(joint: SkeletonJoint): void {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        joint.worldPosition.x,
        joint.worldPosition.y,
        joint.worldPosition.z
      );

    const rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(this.options.jointRadius)
      .setMass(this.options.jointMass)
      .setRestitution(0.3)
      .setFriction(0.7);

    if (!this.options.enableCollisions) {
      colliderDesc.setSensor(true);
    }

    const collider = this.world.createCollider(colliderDesc, rigidBody);

    this.physicsJoints.set(joint.id, {
      id: joint.id,
      name: joint.name,
      rigidBody,
      collider
    });
  }

  private createBoneConstraints(joints: SkeletonJoint[]): void {
    joints.forEach(joint => {
      if (joint.visibility < 0.5) return;

      joint.connections.forEach(targetId => {
        const targetJoint = joints[targetId];
        if (!targetJoint || targetJoint.visibility < 0.5) return;

        const physicsJointA = this.physicsJoints.get(joint.id);
        const physicsJointB = this.physicsJoints.get(targetId);

        if (physicsJointA && physicsJointB) {
          this.createBoneConstraint(joint.id, targetId);
        }
      });
    });
  }

  private createBoneConstraint(
    jointAId: number,
    jointBId: number
  ): void {
    // Use a simpler approach - just store the reference without constraints for now
    // This avoids the complex joint API issues
    this.physicsBones.push({
      jointA: jointAId,
      jointB: jointBId,
      constraint: undefined
    });
  }

  private updatePhysicsPositions(skeletonData: SkeletonData): void {
    // Apply forces to move physics bodies toward detected positions
    skeletonData.joints.forEach(joint => {
      if (joint.visibility < 0.5) return;

      const physicsJoint = this.physicsJoints.get(joint.id);
      if (!physicsJoint) return;

      const currentPos = physicsJoint.rigidBody.translation();
      const targetPos = joint.worldPosition;

      // Calculate force to apply
      const force = new RAPIER.Vector3(
        (targetPos.x - currentPos.x) * this.options.boneStiffness,
        (targetPos.y - currentPos.y) * this.options.boneStiffness,
        (targetPos.z - currentPos.z) * this.options.boneStiffness
      );

      // Apply damping based on current velocity
      const velocity = physicsJoint.rigidBody.linvel();
      const damping = new RAPIER.Vector3(
        -velocity.x * this.options.damping,
        -velocity.y * this.options.damping,
        -velocity.z * this.options.damping
      );

      const totalForce = new RAPIER.Vector3(
        force.x + damping.x,
        force.y + damping.y,
        force.z + damping.z
      );

      physicsJoint.rigidBody.addForce(totalForce, true);
    });
  }

  /**
   * Step the physics simulation
   */
  step(): void {
    if (!this.isInitialized) return;
    this.world.step();
  }

  /**
   * Get physics joint positions for rendering
   */
  getPhysicsJointPositions(): Map<number, THREE.Vector3> {
    const positions = new Map<number, THREE.Vector3>();

    this.physicsJoints.forEach((physicsJoint, id) => {
      const pos = physicsJoint.rigidBody.translation();
      positions.set(id, new THREE.Vector3(pos.x, pos.y, pos.z));
    });

    return positions;
  }

  /**
   * Add a physics object that can interact with the skeleton
   */
  addPhysicsObject(
    position: THREE.Vector3,
    geometry: 'box' | 'sphere' | 'capsule',
    size: THREE.Vector3,
    mass: number = 1.0
  ): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z);

    const rigidBody = this.world.createRigidBody(rigidBodyDesc);

    let colliderDesc: RAPIER.ColliderDesc;

    switch (geometry) {
      case 'box':
        colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        break;
      case 'sphere':
        colliderDesc = RAPIER.ColliderDesc.ball(size.x);
        break;
      case 'capsule':
        colliderDesc = RAPIER.ColliderDesc.capsule(size.y / 2, size.x);
        break;
    }

    colliderDesc.setMass(mass).setRestitution(0.5).setFriction(0.7);

    const collider = this.world.createCollider(colliderDesc, rigidBody);

    return { rigidBody, collider };
  }

  /**
   * Apply force to a specific joint
   */
  applyForceToJoint(jointId: number, force: THREE.Vector3): void {
    const physicsJoint = this.physicsJoints.get(jointId);
    if (physicsJoint) {
      const rapierForce = new RAPIER.Vector3(force.x, force.y, force.z);
      physicsJoint.rigidBody.addForce(rapierForce, true);
    }
  }

  /**
   * Get the physics world for advanced usage
   */
  getWorld(): RAPIER.World {
    return this.world;
  }

  /**
   * Get all physics joints
   */
  getPhysicsJoints(): Map<number, PhysicsJoint> {
    return this.physicsJoints;
  }

  private clearPhysicsSkeleton(): void {
    // Remove all constraints
    this.physicsBones.forEach(bone => {
      if (bone.constraint) {
        this.world.removeImpulseJoint(bone.constraint, true);
      }
    });
    this.physicsBones = [];

    // Remove all physics joints
    this.physicsJoints.forEach(physicsJoint => {
      this.world.removeCollider(physicsJoint.collider, true);
      this.world.removeRigidBody(physicsJoint.rigidBody);
    });
    this.physicsJoints.clear();
  }

  dispose(): void {
    this.clearPhysicsSkeleton();
    if (this.world) {
      this.world.free();
    }
  }
}