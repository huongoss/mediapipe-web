// Example: Using SkeletonProvider independently
import { SkeletonProvider } from '../providers/SkeletonProvider';
import * as THREE from 'three';

export async function basicSkeletonExample() {
  // Initialize skeleton provider
  const skeletonProvider = new SkeletonProvider();
  await skeletonProvider.initialize(
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
  );

  // Subscribe to skeleton updates
  const unsubscribe = skeletonProvider.subscribe((skeletonData) => {
    if (skeletonData) {
      console.log(`Detected ${skeletonData.joints.length} joints with confidence: ${skeletonData.confidence}`);
      
      // Access specific joints
      const leftWrist = skeletonData.joints[15];
      const rightWrist = skeletonData.joints[16];
      
      console.log('Left wrist position:', leftWrist.worldPosition);
      console.log('Right wrist position:', rightWrist.worldPosition);
    }
  });

  // Start with video element
  const video = document.createElement('video');
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await video.play();
  
  skeletonProvider.startLiveDetection(video);

  // Clean up later
  return () => {
    unsubscribe();
    skeletonProvider.dispose();
  };
}

// Example: Using ThreeSkeletonRenderer independently  
import { ThreeSkeletonRenderer } from '../renderers/ThreeSkeletonRenderer';

export function renderingExample(container: HTMLElement) {
  const renderer = new ThreeSkeletonRenderer(container, {
    jointSize: 0.05,
    boneThickness: 0.02,
    jointColor: '#ff0000',
    boneColor: '#00ff00',
    showJointLabels: true
  });

  // You can access Three.js components directly
  const scene = renderer.getScene();
  
  // Add custom objects to the scene
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  return renderer;
}

// Example: Using SkeletonPhysicsSystem independently
import { SkeletonPhysicsSystem } from '../utils/SkeletonPhysicsSystem';

export async function physicsExample() {
  const physicsSystem = new SkeletonPhysicsSystem({
    jointMass: 1.0,
    jointRadius: 0.05,
    boneStiffness: 1000.0,
    damping: 50.0,
    enableCollisions: true
  });

  // Add some physics objects
  const ball = physicsSystem.addPhysicsObject(
    new THREE.Vector3(0, 2, 0),
    'sphere',
    new THREE.Vector3(0.1, 0, 0),
    0.5
  );

  const box = physicsSystem.addPhysicsObject(
    new THREE.Vector3(1, 1, 0),
    'box',
    new THREE.Vector3(0.2, 0.2, 0.2),
    1.0
  );

  // Physics update loop
  function animate() {
    physicsSystem.step();
    
    // Get positions for rendering
    const ballPos = ball.rigidBody.translation();
    const boxPos = box.rigidBody.translation();
    
    console.log('Ball position:', ballPos);
    console.log('Box position:', boxPos);
    
    requestAnimationFrame(animate);
  }
  
  animate();

  return physicsSystem;
}