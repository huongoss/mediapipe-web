import RAPIER from '@dimforge/rapier3d';

export interface PhysicsObject {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh?: any; // Three.js mesh reference
}

export class PhysicsSystem {
  private world: RAPIER.World | null = null;
  private gravity = { x: 0.0, y: -9.81, z: 0.0 };
  private objects: Map<string, PhysicsObject> = new Map();
  private isInitialized = false;

  // Base simulation timestep (seconds) and default time scale (10x slower)
  private readonly baseTimestep = 1.0 / 60.0;
  private timeScale = 0.1; // 10x slower than current

  async initialize(): Promise<void> {
    console.log('🔧 PhysicsSystem: Initializing...');
    
    try {
      // For Rapier3D v0.13+, no RAPIER.init() is needed
      console.log('✅ Rapier module ready (no init required for v0.13+)');
      
      // Create physics world with gravity
      this.world = new RAPIER.World(this.gravity);
      console.log('✅ Physics world created with gravity:', this.gravity);

      // Apply default time scale (slower physics)
      this.applyTimeScale();
      
      this.isInitialized = true;
      console.log('✅ PhysicsSystem initialization complete');
    } catch (error) {
      console.error('❌ PhysicsSystem initialization failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PhysicsSystem initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Apply the current timeScale to the world's timestep/integration parameters.
   */  
  private applyTimeScale(): void {
    if (!this.world) return;

    const targetDt = this.baseTimestep * this.timeScale; // smaller dt => slower per real-time frame
    const w: any = this.world as any;

    try {
      if (typeof w.timestep === 'number') {
        w.timestep = targetDt;
        console.log('🕒 Physics timestep set via world.timestep:', w.timestep);
        return;
      }
      // Some versions expose integrationParameters with a dt field
      if (w.integrationParameters) {
        if (typeof w.integrationParameters.dt === 'number') {
          const old = w.integrationParameters.dt;
          w.integrationParameters.dt = targetDt;
          console.log('🕒 Physics timestep set via integrationParameters.dt:', targetDt, '(was', old, ')');
          return;
        }
        if (typeof w.integrationParameters.set_dt === 'function') {
          w.integrationParameters.set_dt(targetDt);
          console.log('🕒 Physics timestep set via integrationParameters.set_dt:', targetDt);
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to set timestep explicitly:', e);
    }

    // Fallback: scale gravity as a coarse slowing mechanism if timestep cannot be changed
    const scaled = { x: this.gravity.x * this.timeScale, y: this.gravity.y * this.timeScale, z: this.gravity.z * this.timeScale };
    this.setGravity(scaled);
    console.warn('⚠️ Falling back to gravity scaling for slower physics:', scaled);
  }

  /**
   * Change time scale (1.0 = normal, 0.1 = 10x slower, 2.0 = 2x faster)
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.001, scale);
    this.applyTimeScale();
  }

  /**
   * Step the physics simulation forward by one frame
   */
  step(_deltaTime: number = 1.0 / 60.0): void {
    if (!this.world || !this.isInitialized) {
      console.warn('⚠️ PhysicsSystem not initialized, skipping step');
      return;
    }

    try {
      this.world.step();
    } catch (error) {
      console.error('❌ Physics step failed:', error);
    }
  }

  /**
   * Create a dynamic sphere (ball) at the specified position
   */
  createBall(
    id: string, 
    position: { x: number; y: number; z: number }, 
    radius: number = 0.1,
    mass: number = 1.0
  ): PhysicsObject | null {
    if (!this.world || !this.isInitialized) {
      console.error('❌ Cannot create ball: PhysicsSystem not initialized');
      return null;
    }

    try {
      console.log(`🎾 Creating ball "${id}" at position:`, position);
      
      // Create rigid body descriptor for dynamic object
      const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z);
      
      // Create the rigid body
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      // Create sphere collider
      const colliderDesc = RAPIER.ColliderDesc.ball(radius)
        .setMass(mass)
        .setRestitution(0.7) // Bouncy
        .setFriction(0.3);
      
      // Attach collider to rigid body
      const collider = this.world.createCollider(colliderDesc, rigidBody);
      
      const physicsObject: PhysicsObject = {
        rigidBody,
        collider
      };
      
      this.objects.set(id, physicsObject);
      console.log(`✅ Ball "${id}" created successfully`);
      
      return physicsObject;
    } catch (error) {
      console.error(`❌ Failed to create ball "${id}":`, error);
      return null;
    }
  }

  /**
   * Create a static ground plane
   */
  createGround(
    id: string = 'ground',
    position: { x: number; y: number; z: number } = { x: 0, y: -1, z: 0 },
    size: { x: number; y: number; z: number } = { x: 10, y: 0.1, z: 10 }
  ): PhysicsObject | null {
    if (!this.world || !this.isInitialized) {
      console.error('❌ Cannot create ground: PhysicsSystem not initialized');
      return null;
    }

    try {
      console.log(`🌍 Creating ground "${id}" at position:`, position);
      
      // Create static rigid body for ground
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z);
      
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      // Create box collider for ground
      const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setRestitution(0.5)
        .setFriction(0.8);
      
      const collider = this.world.createCollider(colliderDesc, rigidBody);
      
      const physicsObject: PhysicsObject = {
        rigidBody,
        collider
      };
      
      this.objects.set(id, physicsObject);
      console.log(`✅ Ground "${id}" created successfully`);
      
      return physicsObject;
    } catch (error) {
      console.error(`❌ Failed to create ground "${id}":`, error);
      return null;
    }
  }

  /**
   * Create invisible walls around the play area
   */
  createBoundaryWalls(size: number = 5): void {
    const wallHeight = 3;
    const wallThickness = 0.1;
    
    // Left wall
    this.createWall('wall_left', { x: -size, y: wallHeight / 2, z: 0 }, 
                   { x: wallThickness, y: wallHeight, z: size * 2 });
    
    // Right wall  
    this.createWall('wall_right', { x: size, y: wallHeight / 2, z: 0 },
                   { x: wallThickness, y: wallHeight, z: size * 2 });
    
    // Back wall
    this.createWall('wall_back', { x: 0, y: wallHeight / 2, z: -size },
                   { x: size * 2, y: wallHeight, z: wallThickness });
    
    // Front wall (optional, for containment)
    this.createWall('wall_front', { x: 0, y: wallHeight / 2, z: size },
                   { x: size * 2, y: wallHeight, z: wallThickness });
                   
    console.log('✅ Boundary walls created');
  }

  /**
   * Create a static wall
   */
  private createWall(
    id: string,
    position: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number }
  ): PhysicsObject | null {
    if (!this.world || !this.isInitialized) return null;

    try {
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z);
      
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setRestitution(0.8)
        .setFriction(0.3);
      
      const collider = this.world.createCollider(colliderDesc, rigidBody);
      
      const physicsObject: PhysicsObject = {
        rigidBody,
        collider
      };
      
      this.objects.set(id, physicsObject);
      return physicsObject;
    } catch (error) {
      console.error(`❌ Failed to create wall "${id}":`, error);
      return null;
    }
  }

  /**
   * Apply force to a physics object
   */
  applyForce(id: string, force: { x: number; y: number; z: number }): void {
    const object = this.objects.get(id);
    if (!object) {
      //console.warn(`⚠️ Physics object "${id}" not found`);
      return;
    }

    try {
      object.rigidBody.addForce(force, true);
    } catch (error) {
      console.error(`❌ Failed to apply force to "${id}":`, error);
    }
  }

  /**
   * Apply impulse to a physics object
   */
  applyImpulse(id: string, impulse: { x: number; y: number; z: number }): void {
    const object = this.objects.get(id);
    if (!object) {
      //console.warn(`⚠️ Physics object "${id}" not found`);
      return;
    }

    try {
      object.rigidBody.applyImpulse(impulse, true);
    } catch (error) {
      console.error(`❌ Failed to apply impulse to "${id}":`, error);
    }
  }

  /**
   * Set position of a physics object
   */
  setPosition(id: string, position: { x: number; y: number; z: number }): void {
    const object = this.objects.get(id);
    if (!object) {
      //console.warn(`⚠️ Physics object "${id}" not found`);
      return;
    }

    try {
      object.rigidBody.setTranslation(position, true);
    } catch (error) {
      console.error(`❌ Failed to set position for "${id}":`, error);
    }
  }

  /**
   * Set velocity of a physics object
   */
  setVelocity(id: string, velocity: { x: number; y: number; z: number }): void {
    const object = this.objects.get(id);
    if (!object) {
      //console.warn(`⚠️ Physics object "${id}" not found`);
      return;
    }

    try {
      object.rigidBody.setLinvel(velocity, true);
    } catch (error) {
      console.error(`❌ Failed to set velocity for "${id}":`, error);
    }
  }

  /**
   * Get physics object by ID
   */
  getObject(id: string): PhysicsObject | undefined {
    return this.objects.get(id);
  }

  /**
   * Get all physics objects
   */
  getAllObjects(): Map<string, PhysicsObject> {
    return new Map(this.objects);
  }

  /**
   * Remove a physics object
   */
  removeObject(id: string): void {
    const object = this.objects.get(id);
    if (!object || !this.world) return;

    try {
      this.world.removeRigidBody(object.rigidBody);
      this.objects.delete(id);
      console.log(`🗑️ Removed physics object "${id}"`);
    } catch (error) {
      console.error(`❌ Failed to remove object "${id}":`, error);
    }
  }

  /**
   * Clear all physics objects
   */
  clear(): void {
    console.log('🧹 Clearing all physics objects...');
    
    if (this.world) {
      // Remove all objects
      for (const [id, object] of this.objects) {
        try {
          this.world.removeRigidBody(object.rigidBody);
        } catch (error) {
          console.error(`❌ Failed to remove object "${id}":`, error);
        }
      }
    }
    
    this.objects.clear();
    console.log('✅ All physics objects cleared');
  }

  /**
   * Get physics world (for advanced usage)
   */
  getWorld(): RAPIER.World | null {
    return this.world;
  }

  /**
   * Check if physics system is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.world !== null;
  }

  /**
   * Get current gravity
   */
  getGravity(): { x: number; y: number; z: number } {
    return { ...this.gravity };
  }

  /**
   * Set gravity
   */
  setGravity(gravity: { x: number; y: number; z: number }): void {
    this.gravity = { ...gravity };
    if (this.world) {
      this.world.gravity = this.gravity;
      console.log('🌍 Gravity updated:', this.gravity);
    }
  }

  /**
   * Dispose of the physics system
   */
  dispose(): void {
    console.log('🗑️ Disposing PhysicsSystem...');
    
    this.clear();
    
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    
    this.isInitialized = false;
    console.log('✅ PhysicsSystem disposed');
  }
}