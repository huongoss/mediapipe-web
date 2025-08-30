import * as THREE from 'three';
import { SkeletonData, SkeletonJoint } from '../providers/SkeletonProvider';

export interface SkeletonRenderOptions {
  jointSize?: number;
  boneThickness?: number;
  jointColor?: string;
  boneColor?: string;
  showJointLabels?: boolean;
}

/**
 * Three.js renderer for human skeleton visualization
 * Separated from skeleton provider for flexible rendering
 */
export class ThreeSkeletonRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private jointMeshes: THREE.Mesh[] = [];
  private boneMeshes: THREE.Mesh[] = [];
  private jointLabels: THREE.Sprite[] = [];
  private skeletonGroup: THREE.Group;
  private options: Required<SkeletonRenderOptions>;

  constructor(container: HTMLElement, options: SkeletonRenderOptions = {}) {
    this.options = {
      jointSize: 0.02,
      boneThickness: 0.01,
      jointColor: '#ff6b6b',
      boneColor: '#4ecdc4',
      showJointLabels: false,
      ...options
    };

    this.scene = new THREE.Scene();
    this.skeletonGroup = new THREE.Group();
    this.scene.add(this.skeletonGroup);

    this.camera = new THREE.PerspectiveCamera();
    this.renderer = new THREE.WebGLRenderer();

    this.setupCamera();
    this.setupRenderer(container);
    this.setupLights();
    this.setupEnvironment();
    
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

  private setupRenderer(container: HTMLElement): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x1a1a2e, 1); // Dark blue background
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    container.appendChild(this.renderer.domElement);

    // Handle resize for full window
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
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
   * Update skeleton visualization with new data
   */
  updateSkeleton(skeletonData: SkeletonData | null): void {
    console.log('🎨 ThreeSkeletonRenderer: Updating skeleton visualization');
    console.log('📊 Skeleton data:', skeletonData ? {
      jointCount: skeletonData.joints.length,
      confidence: skeletonData.confidence,
      visibleJoints: skeletonData.joints.filter(j => j.visibility > 0.5).length
    } : 'No data');

    this.clearSkeleton();

    if (!skeletonData) {
      console.log('⚠️ No skeleton data provided, clearing visualization');
      return;
    }

    console.log('🔗 Rendering joints and bones...');
    this.renderJoints(skeletonData.joints);
    this.renderBones(skeletonData.joints);

    if (this.options.showJointLabels) {
      console.log('🏷️ Rendering joint labels...');
      this.renderJointLabels(skeletonData.joints);
    }

    console.log('✅ Skeleton visualization updated');
  }

  private clearSkeleton(): void {
    console.log('🧹 Clearing existing skeleton meshes');
    // Remove all existing meshes
    this.jointMeshes.forEach(mesh => {
      this.skeletonGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    
    this.boneMeshes.forEach(mesh => {
      this.skeletonGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });

    this.jointLabels.forEach(sprite => {
      this.skeletonGroup.remove(sprite);
      (sprite.material as THREE.Material).dispose();
    });

    this.jointMeshes = [];
    this.boneMeshes = [];
    this.jointLabels = [];
    console.log('✅ Skeleton meshes cleared');
  }

  private renderJoints(joints: SkeletonJoint[]): void {
    console.log('🔴 Rendering joints...');
    const jointGeometry = new THREE.SphereGeometry(this.options.jointSize, 8, 6);
    const jointMaterial = new THREE.MeshLambertMaterial({ 
      color: this.options.jointColor 
    });

    let renderedJoints = 0;
    joints.forEach(joint => {
      if (joint.visibility < 0.5) {
        console.log(`⚠️ Skipping joint ${joint.name} (visibility: ${joint.visibility.toFixed(3)})`);
        return; // Skip low-confidence joints
      }

      const jointMesh = new THREE.Mesh(jointGeometry, jointMaterial.clone());
      
      // Convert from normalized coordinates to 3D space
      const worldPos = joint.worldPosition;
      jointMesh.position.set(
        worldPos.x,
        -worldPos.y, // Flip Y for correct orientation
        worldPos.z
      );

      console.log(`🔴 Joint ${joint.name} at position:`, {
        world: worldPos,
        threejs: { x: worldPos.x, y: -worldPos.y, z: worldPos.z },
        visibility: joint.visibility
      });

      // Scale opacity based on visibility
      (jointMesh.material as THREE.MeshLambertMaterial).opacity = joint.visibility;
      (jointMesh.material as THREE.MeshLambertMaterial).transparent = true;

      this.jointMeshes.push(jointMesh);
      this.skeletonGroup.add(jointMesh);
      renderedJoints++;
    });

    console.log(`✅ Rendered ${renderedJoints} joints out of ${joints.length} total joints`);
  }

  private renderBones(joints: SkeletonJoint[]): void {
    console.log('🦴 Rendering bones...');
    const boneMaterial = new THREE.MeshLambertMaterial({ 
      color: this.options.boneColor 
    });

    let renderedBones = 0;
    joints.forEach(joint => {
      if (joint.visibility < 0.5) return;

      joint.connections.forEach(targetId => {
        const targetJoint = joints[targetId];
        if (!targetJoint || targetJoint.visibility < 0.5) return;

        const startPos = new THREE.Vector3(
          joint.worldPosition.x,
          -joint.worldPosition.y,
          joint.worldPosition.z
        );

        const endPos = new THREE.Vector3(
          targetJoint.worldPosition.x,
          -targetJoint.worldPosition.y,
          targetJoint.worldPosition.z
        );

        const distance = startPos.distanceTo(endPos);
        if (distance < 0.01) return; // Skip very short bones

        console.log(`🦴 Bone ${joint.name} -> ${targetJoint.name}, distance: ${distance.toFixed(3)}`);

        // Create cylinder for bone
        const boneGeometry = new THREE.CylinderGeometry(
          this.options.boneThickness,
          this.options.boneThickness,
          distance,
          8
        );

        const boneMesh = new THREE.Mesh(boneGeometry, boneMaterial.clone());

        // Position and orient the bone
        const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        boneMesh.position.copy(midPoint);

        boneMesh.lookAt(endPos);
        boneMesh.rotateX(Math.PI / 2);

        // Adjust opacity based on joint visibility
        const avgVisibility = (joint.visibility + targetJoint.visibility) / 2;
        (boneMesh.material as THREE.MeshLambertMaterial).opacity = avgVisibility;
        (boneMesh.material as THREE.MeshLambertMaterial).transparent = true;

        this.boneMeshes.push(boneMesh);
        this.skeletonGroup.add(boneMesh);
        renderedBones++;
      });
    });

    console.log(`✅ Rendered ${renderedBones} bones`);
  }

  private renderJointLabels(joints: SkeletonJoint[]): void {
    joints.forEach(joint => {
      if (joint.visibility < 0.5) return;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = 128;
      canvas.height = 32;
      
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      context.fillStyle = 'white';
      context.font = '12px Arial';
      context.textAlign = 'center';
      context.fillText(joint.name, canvas.width / 2, canvas.height / 2 + 4);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      
      sprite.position.set(
        joint.worldPosition.x,
        -joint.worldPosition.y + 0.05,
        joint.worldPosition.z
      );
      
      sprite.scale.set(0.1, 0.025, 1);

      this.jointLabels.push(sprite);
      this.skeletonGroup.add(sprite);
    });
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
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearSkeleton();
    this.renderer.dispose();
    this.scene.clear();
  }
}