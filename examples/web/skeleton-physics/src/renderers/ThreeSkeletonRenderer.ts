import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SkeletonData, SkeletonJoint } from '../providers/SkeletonProvider';

export interface SkeletonRenderOptions {
  jointSize?: number;
  boneThickness?: number;
  jointColor?: string;
  boneColor?: string;
  showJointLabels?: boolean;
  physicsMode?: boolean; // Add physics mode flag
  physicsJointColor?: string; // Color for physics joints
  physicsJointSize?: number; // Size for physics joints
}

/**
 * Three.js renderer for human skeleton visualization
 * Separated from skeleton provider for flexible rendering
 */
export class ThreeSkeletonRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls | null = null; // Add OrbitControls
  private jointMeshes: THREE.Mesh[] = [];
  private boneMeshes: THREE.Mesh[] = [];
  private jointLabels: THREE.Sprite[] = [];
  private skeletonGroup: THREE.Group;
  private options: Required<SkeletonRenderOptions>;
  private isRunning: boolean = true;
  private animationId: number | null = null;
  private hasTrackedData: boolean = false; // Track if we have real data
  private isInitialized: boolean = false; // Track if skeleton meshes are created

  // Reusable geometries and materials (created once)
  private jointGeometry: THREE.SphereGeometry | null = null;
  private boneGeometry: THREE.CylinderGeometry | null = null;
  private jointMaterial: THREE.MeshBasicMaterial | null = null;
  private boneMaterial: THREE.MeshBasicMaterial | null = null;
  private defaultJointMaterial: THREE.MeshBasicMaterial | null = null;
  private defaultBoneMaterial: THREE.MeshBasicMaterial | null = null;

  constructor(container: HTMLElement|HTMLCanvasElement, options: SkeletonRenderOptions = {}) {
    this.options = {
      jointSize: 0.02,
      boneThickness: 0.01,
      jointColor: '#ff6b6b',
      boneColor: '#4ecdc4',
      showJointLabels: false,
      physicsMode: false, // Default physics mode to false
      physicsJointColor: '#ffcc00', // Default color for physics joints
      physicsJointSize: 0.03, // Default size for physics joints
      ...options
    };

    this.scene = new THREE.Scene();
    this.skeletonGroup = new THREE.Group();
    this.scene.add(this.skeletonGroup);

    this.camera = new THREE.PerspectiveCamera();
    this.renderer = new THREE.WebGLRenderer();

    this.setupCamera();
    this.setupRenderer(container);
    this.setupControls(); // Add controls setup
    this.setupLights();
    this.setupEnvironment();
    
    // Initialize reusable geometries and materials
    this.initializeGeometriesAndMaterials();
    
    // Initialize skeleton meshes once
    this.initializeSkeletonMeshes();
    
    this.animate();
  }

  private setupCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 2);
  }

  private setupRenderer(container: HTMLElement|HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: container instanceof HTMLCanvasElement ? container : undefined,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x1a1a2e, 1); // Dark blue background
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    if(!(container instanceof HTMLCanvasElement))
      container.appendChild(this.renderer.domElement);

    // Handle resize for full window
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * Setup OrbitControls for mouse camera interaction
   */
  private setupControls(): void {
    console.log('🎮 Setting up OrbitControls for camera interaction');
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    
    // Configure controls for optimal skeleton viewing
    this.controls.enableDamping = true; // Smooth camera movement
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    
    // Set distance limits
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 10;
    
    // Set rotation limits to prevent flipping upside down
    this.controls.maxPolarAngle = Math.PI * 0.8; // Prevent going completely under
    this.controls.minPolarAngle = Math.PI * 0.1; // Prevent going too high
    
    // Set the target to center of skeleton (slightly above ground)
    this.controls.target.set(0, 0, 0);
    
    // Auto-rotate around the skeleton (optional, can be toggled)
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 1.0;
    
    // Enable zoom and pan
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    
    // Mouse/touch settings
    this.controls.rotateSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    
    // Key controls (optional)
    this.controls.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp', 
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown'
    };
    this.controls.listenToKeyEvents(window);
    
    console.log('✅ OrbitControls configured for skeleton viewing');
  }

  private setupLights(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 0.5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private setupEnvironment(): void {
    // Optional: Add a subtle grid or background
    const gridHelper = new THREE.GridHelper(2, 20, 0x888888, 0x444444);
    gridHelper.position.y = -1;
    this.scene.add(gridHelper);
  }

  /**
   * Initialize reusable geometries and materials (created once)
   */
  private initializeGeometriesAndMaterials(): void {
    console.log('🔧 Initializing reusable geometries and materials');

    // Create geometries once
    this.jointGeometry = new THREE.SphereGeometry(this.options.jointSize, 8, 6);
    this.boneGeometry = new THREE.CylinderGeometry(
      this.options.boneThickness,
      this.options.boneThickness,
      1, // Default length, will be scaled per bone
      8
    );

    // Create materials once
    this.jointMaterial = new THREE.MeshBasicMaterial({ 
      color: this.options.jointColor,
      transparent: true
    });
    
    this.boneMaterial = new THREE.MeshBasicMaterial({ 
      color: this.options.boneColor,
      transparent: true
    });

    // Default (muted) materials for when not tracking
    this.defaultJointMaterial = new THREE.MeshBasicMaterial({ 
      color: '#666666',
      transparent: true,
      opacity: 0.7
    });
    
    this.defaultBoneMaterial = new THREE.MeshBasicMaterial({ 
      color: '#444444',
      transparent: true,
      opacity: 0.5
    });

    console.log('✅ Geometries and materials initialized');
  }

  /**
   * Initialize skeleton meshes once (33 joints + bones)
   */
  private initializeSkeletonMeshes(): void {
    console.log('🦴 Initializing skeleton meshes (create once, update positions)');

    // Create 33 joint meshes
    for (let i = 0; i < 33; i++) {
      const jointMesh = new THREE.Mesh(this.jointGeometry!, this.defaultJointMaterial!.clone());
      jointMesh.visible = false; // Hidden until we have data
      jointMesh.userData.jointId = i;
      this.jointMeshes.push(jointMesh);
      this.skeletonGroup.add(jointMesh);
    }

    // Create bone meshes for all possible connections
    const connections = this.getDefaultConnections();
    let boneIndex = 0;
    
    for (let jointId = 0; jointId < 33; jointId++) {
      const jointConnections = connections[jointId] || [];
      
      for (const targetId of jointConnections) {
        // Only create bone once per connection (avoid duplicates)
        if (jointId < targetId) {
          const boneMesh = new THREE.Mesh(this.boneGeometry!, this.defaultBoneMaterial!.clone());
          boneMesh.visible = false;
          boneMesh.userData.fromJoint = jointId;
          boneMesh.userData.toJoint = targetId;
          boneMesh.userData.boneIndex = boneIndex++;
          this.boneMeshes.push(boneMesh);
          this.skeletonGroup.add(boneMesh);
        }
      }
    }

    const tPose = this.createDefaultTPose();
    this.updateBonePositions(tPose);
    this.updateJointPositions(tPose);
    this.isInitialized = true;

    console.log(`✅ Initialized ${this.jointMeshes.length} joint meshes and ${this.boneMeshes.length} bone meshes`);
  }

  /**
   * Update skeleton visualization with new data (only update positions)
   */
  updateSkeleton(skeletonData: SkeletonData | null): void {
    if (!this.isInitialized) return;

    if (!skeletonData) {
      // When no tracking data, show default skeleton
      if (this.hasTrackedData) {
        this.hasTrackedData = false;
      }
      return;
    }

    this.hasTrackedData = true;
    this.updateJointPositions(skeletonData.joints);
    this.updateBonePositions(skeletonData.joints);

    //console.log('✅ Skeleton visualization updated');
  }

  /**
   * Update joint positions and visibility (no mesh creation)
   */
  private updateJointPositions(joints: SkeletonJoint[]): void {
    let count = 0;
    joints.forEach((joint, index) => {
      if (index >= this.jointMeshes.length) return;
      
      const jointMesh = this.jointMeshes[index];
      if (joint.visibility > 0.5) {
        count++;
        // Show and position the joint
        jointMesh.visible = true;
        jointMesh.position.set(
          joint.worldPosition.x,
          -joint.worldPosition.y, // Flip Y for correct orientation
          joint.worldPosition.z
        );

        
        // Update material to tracking colors
        (jointMesh.material as THREE.MeshBasicMaterial).color.setStyle(this.options.jointColor);
        (jointMesh.material as THREE.MeshBasicMaterial).opacity = joint.visibility;
      } else {
        // Hide low-confidence joints
        jointMesh.visible = false;
      }
    });

    //console.log("Updated ", count+1, "joints");
  }

  /**
   * Update bone positions and visibility (no mesh creation)
   */
  private updateBonePositions(joints: SkeletonJoint[]): void {
    this.boneMeshes.forEach(boneMesh => {
      const fromJointId = boneMesh.userData.fromJoint;
      const toJointId = boneMesh.userData.toJoint;
      
      const fromJoint = joints[fromJointId];
      const toJoint = joints[toJointId];
      
      if (!fromJoint || !toJoint || 
          fromJoint.visibility < 0.5 || toJoint.visibility < 0.5) {
        boneMesh.visible = false;
        return;
      }

      // Show and position the bone
      boneMesh.visible = true;
      
      const startPos = new THREE.Vector3(
        fromJoint.worldPosition.x,
        -fromJoint.worldPosition.y,
        fromJoint.worldPosition.z
      );

      const endPos = new THREE.Vector3(
        toJoint.worldPosition.x,
        -toJoint.worldPosition.y,
        toJoint.worldPosition.z
      );

      const distance = startPos.distanceTo(endPos);
      if (distance < 0.01) {
        boneMesh.visible = false;
        return;
      }

      // Position and orient the bone
      const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
      boneMesh.position.copy(midPoint);
      
      // Scale the bone to the correct length
      boneMesh.scale.set(1, distance, 1);
      
      // Orient the bone
      boneMesh.lookAt(endPos);
      boneMesh.rotateX(Math.PI / 2);

      // Update material
      const avgVisibility = (fromJoint.visibility + toJoint.visibility) / 2;
      (boneMesh.material as THREE.MeshBasicMaterial).color.setStyle(this.options.boneColor);
      (boneMesh.material as THREE.MeshBasicMaterial).opacity = avgVisibility;
    });
  }


  private clearSkeleton(): void {
    //console.log('🧹 Clearing existing skeleton meshes');
    // Remove all existing meshes
    this.jointMeshes.forEach(mesh => {
      mesh.visible = false;
    });
    
    this.boneMeshes.forEach(mesh => {
      mesh.visible = false;
    });

    this.jointLabels.forEach(sprite => {
      this.skeletonGroup.remove(sprite);
      (sprite.material as THREE.Material).dispose();
    });

    this.jointLabels = [];
    //console.log('✅ Skeleton meshes cleared');
  }

  /**
   * Create default T-pose skeleton data
   */
  private createDefaultTPose(): SkeletonJoint[] {
    // MediaPipe pose landmark positions for a T-pose
    const tPosePositions = [
      // Head and face
      { x: 0, y: 0.7, z: 0 },      // 0: nose
      { x: -0.02, y: 0.72, z: 0 }, // 1: left_eye_inner
      { x: -0.03, y: 0.72, z: 0 }, // 2: left_eye
      { x: -0.04, y: 0.72, z: 0 }, // 3: left_eye_outer
      { x: 0.02, y: 0.72, z: 0 },  // 4: right_eye_inner
      { x: 0.03, y: 0.72, z: 0 },  // 5: right_eye
      { x: 0.04, y: 0.72, z: 0 },  // 6: right_eye_outer
      { x: -0.06, y: 0.7, z: 0 },  // 7: left_ear
      { x: 0.06, y: 0.7, z: 0 },   // 8: right_ear
      { x: -0.02, y: 0.65, z: 0 }, // 9: mouth_left
      { x: 0.02, y: 0.65, z: 0 },  // 10: mouth_right
      
      // Upper body
      { x: -0.2, y: 0.4, z: 0 },   // 11: left_shoulder
      { x: 0.2, y: 0.4, z: 0 },    // 12: right_shoulder
      { x: -0.4, y: 0.4, z: 0 },   // 13: left_elbow
      { x: 0.4, y: 0.4, z: 0 },    // 14: right_elbow
      { x: -0.6, y: 0.4, z: 0 },   // 15: left_wrist
      { x: 0.6, y: 0.4, z: 0 },    // 16: right_wrist
      
      // Hand landmarks (simplified)
      { x: -0.65, y: 0.38, z: 0 }, // 17: left_pinky
      { x: 0.65, y: 0.38, z: 0 },  // 18: right_pinky
      { x: -0.65, y: 0.42, z: 0 }, // 19: left_index
      { x: 0.65, y: 0.42, z: 0 },  // 20: right_index
      { x: -0.62, y: 0.45, z: 0 }, // 21: left_thumb
      { x: 0.62, y: 0.45, z: 0 },  // 22: right_thumb
      
      // Lower body
      { x: -0.1, y: 0, z: 0 },     // 23: left_hip
      { x: 0.1, y: 0, z: 0 },      // 24: right_hip
      { x: -0.1, y: -0.4, z: 0 },  // 25: left_knee
      { x: 0.1, y: -0.4, z: 0 },   // 26: right_knee
      { x: -0.1, y: -0.8, z: 0 },  // 27: left_ankle
      { x: 0.1, y: -0.8, z: 0 },   // 28: right_ankle
      
      // Feet
      { x: -0.12, y: -0.85, z: 0 }, // 29: left_heel
      { x: 0.12, y: -0.85, z: 0 },  // 30: right_heel
      { x: -0.08, y: -0.9, z: 0 },  // 31: left_foot_index
      { x: 0.08, y: -0.9, z: 0 },   // 32: right_foot_index
    ];

    // Get pose connections from SkeletonProvider
    const connections = this.getDefaultConnections();

    // Create skeleton joints with default data
    return tPosePositions.map((pos, index) => ({
      id: index,
      name: this.getJointName(index),
      position: pos, // For default pose, position and worldPosition are the same
      worldPosition: { x: pos.x, y: -pos.y, z: pos.z },
      visibility: 1.0, // Full visibility for default pose
      connections: connections[index] || []
    }));
  }

  /**
   * Get default pose connections for each joint
   */
  private getDefaultConnections(): number[][] {
    const poseConnections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
      [24, 26], [26, 28], [0, 1], [1, 2], [2, 3],
      [0, 4], [4, 5], [5, 6], [0, 7], [0, 8], [9, 10],
      [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
      [27, 29], [27, 31], [28, 30], [28, 32]
    ];

    // Convert connections to per-joint format
    const jointConnections: number[][] = Array(33).fill(null).map(() => []);
    
    poseConnections.forEach(([a, b]) => {
      if (jointConnections[a]) jointConnections[a].push(b);
      if (jointConnections[b]) jointConnections[b].push(a);
    });

    return jointConnections;
  }

  /**
   * Get joint name by index
   */
  private getJointName(index: number): string {
    const jointNames = [
      'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
      'right_eye_inner', 'right_eye', 'right_eye_outer',
      'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
      'left_index', 'right_index', 'left_thumb', 'right_thumb',
      'left_hip', 'right_hip', 'left_knee', 'right_knee',
      'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
      'left_foot_index', 'right_foot_index'
    ];
    
    return jointNames[index] || `joint_${index}`;
  }

  /**
   * Render physics joints with special visualization for collision areas
   */
  renderPhysicsJoints(physicsPositions: Map<number, THREE.Vector3>): void {
    if (!this.options.physicsMode) return;

    //console.log('⚡ Rendering physics joints for collision visualization');
    
    // Clear existing physics joint visualizations
    this.clearPhysicsJoints();

    const physicsGeometry = new THREE.SphereGeometry(this.options.physicsJointSize, 12, 8);
    const physicsMaterial = new THREE.MeshBasicMaterial({ 
      color: this.options.physicsJointColor,
      transparent: true,
      opacity: 0.8,
    });

    let renderedPhysicsJoints = 0;
    physicsPositions.forEach((position) => {
      const physicsMesh = new THREE.Mesh(physicsGeometry, physicsMaterial.clone());
      physicsMesh.position.copy(position);
      
      // Add wireframe outline for better visibility
      const wireframeGeometry = new THREE.SphereGeometry(this.options.physicsJointSize * 1.1, 12, 8);
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: this.options.physicsJointColor,
        wireframe: true,
        transparent: true,
        opacity: 0.5
      });
      const wireframeMesh = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
      wireframeMesh.position.copy(position);

      // Mark these as physics joints for cleanup
      physicsMesh.userData.isPhysicsJoint = true;
      wireframeMesh.userData.isPhysicsJoint = true;

      this.skeletonGroup.add(physicsMesh);
      this.skeletonGroup.add(wireframeMesh);
      renderedPhysicsJoints++;
    });

    //console.log(`✅ Rendered ${renderedPhysicsJoints} physics collision spheres`);
  }

  private clearPhysicsJoints(): void {
    const objectsToRemove: THREE.Object3D[] = [];
    this.skeletonGroup.traverse((object) => {
      if (object.userData.isPhysicsJoint) {
        objectsToRemove.push(object);
      }
    });

    objectsToRemove.forEach(obj => {
      this.skeletonGroup.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  /**
   * Return current visible joint world positions mapped by joint id
   */
  getJointWorldPositions(): Map<number, THREE.Vector3> {
    const map = new Map<number, THREE.Vector3>();
    // If meshes not initialized yet, return empty map
    if (!this.jointMeshes || this.jointMeshes.length === 0) return map;

    this.jointMeshes.forEach((mesh, index) => {
      // We only expose positions for currently visible joints
      if (!mesh.visible) return;
      const jointId = typeof mesh.userData.jointId === 'number' ? mesh.userData.jointId : index;
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      map.set(jointId, worldPos);
    });

    return map;
  }

  /**
   * Get the Three.js scene for external manipulation
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the camera for external control
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the renderer for external control
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Get the skeleton group for physics integration
   */
  getSkeletonGroup(): THREE.Group {
    return this.skeletonGroup;
  }

  /**
   * Update render options
   */
  updateOptions(newOptions: Partial<SkeletonRenderOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  private animate(): void {
    if (!this.isRunning) return;
    this.animationId = requestAnimationFrame(() => this.animate());
    //console.log('🎬 Animation frame rendered');
    this.renderer.render(this.scene, this.camera);
    if(this.controls)
      this.controls.update(); // Update controls for smooth interaction
  }

  /**
   * Pause the rendering loop
   */
  pause(): void {
    if (this.isRunning) {
      this.isRunning = false;
      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }
  }

  /**
   * Resume the rendering loop
   */
  resume(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  dispose(): void {
    this.clearSkeleton();
    
    // Dispose of reusable geometries and materials
    if (this.jointGeometry) {
      this.jointGeometry.dispose();
      this.jointGeometry = null;
    }
    
    if (this.boneGeometry) {
      this.boneGeometry.dispose();
      this.boneGeometry = null;
    }
    
    if (this.jointMaterial) {
      this.jointMaterial.dispose();
      this.jointMaterial = null;
    }
    
    if (this.boneMaterial) {
      this.boneMaterial.dispose();
      this.boneMaterial = null;
    }
    
    if (this.defaultJointMaterial) {
      this.defaultJointMaterial.dispose();
      this.defaultJointMaterial = null;
    }
    
    if (this.defaultBoneMaterial) {
      this.defaultBoneMaterial.dispose();
      this.defaultBoneMaterial = null;
    }

    // Dispose of meshes
    this.jointMeshes.forEach(mesh => {
      this.skeletonGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    });
    
    this.boneMeshes.forEach(mesh => {
      this.skeletonGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    });

    this.jointMeshes = [];
    this.boneMeshes = [];
    
    this.renderer.dispose();
    this.scene.clear();
  }
}