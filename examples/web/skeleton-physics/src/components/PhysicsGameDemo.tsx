import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SkeletonProvider } from '../providers/SkeletonProvider';
import { ThreeSkeletonRenderer } from '../renderers/ThreeSkeletonRenderer';
import { SkeletonPhysicsSystem } from '../utils/SkeletonPhysicsSystem';

interface PhysicsGameDemoProps {
  modelPath: string;
}

/**
 * Demo component showing a simple physics game using skeleton tracking
 * Demonstrates the separation of concerns between skeleton provider, renderer, and physics
 */
export const PhysicsGameDemo: React.FC<PhysicsGameDemoProps> = ({ modelPath }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const skeletonProviderRef = useRef<SkeletonProvider | null>(null);
  const rendererRef = useRef<ThreeSkeletonRenderer | null>(null);
  const physicsSystemRef = useRef<SkeletonPhysicsSystem | null>(null);
  const gameObjectsRef = useRef<Array<{ rigidBody: any; mesh: THREE.Mesh }>>([]);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [gameMode, setGameMode] = useState<'visualization' | 'physics'>('visualization');
  const [score, setScore] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    initializeDemo();
    return () => cleanup();
  }, []);

  const initializeDemo = async () => {
    console.log('🚀 PhysicsGameDemo: Starting initialization...');
    
    // Prevent double initialization in React development mode
    if (rendererRef.current) {
      console.log('⚠️ Already initialized, skipping...');
      return;
    }
    
    try {
      console.log('🔧 Initializing skeleton provider...');
      // Initialize skeleton provider
      const skeletonProvider = new SkeletonProvider();
      await skeletonProvider.initialize(modelPath);
      skeletonProviderRef.current = skeletonProvider;
      console.log('✅ Skeleton provider initialized');

      // Initialize renderer
      if (canvasContainerRef.current) {
        console.log('🎨 Creating Three.js renderer...');
        
        // Clear any existing canvas elements first
        canvasContainerRef.current.innerHTML = '';
        
        const renderer = new ThreeSkeletonRenderer(canvasContainerRef.current, {
          jointSize: 0.03,
          boneThickness: 0.015,
          jointColor: '#ff6b6b',
          boneColor: '#4ecdc4',
          showJointLabels: false
        });
        rendererRef.current = renderer;
        console.log('✅ Three.js renderer created');

        console.log('⚙️ Initializing physics system...');
        // Initialize physics system
        const physicsSystem = new SkeletonPhysicsSystem({
          jointMass: 0.1,
          jointRadius: 0.03,
          boneStiffness: 500.0,
          damping: 25.0,
          enableCollisions: true,
          gravityScale: 0.5
        });
        physicsSystemRef.current = physicsSystem;
        console.log('✅ Physics system initialized');

        console.log('🔗 Setting up skeleton update subscription...');
        // Subscribe to skeleton updates
        skeletonProvider.subscribe((skeletonData) => {
          console.log('📨 Received skeleton update:', skeletonData ? 'Data available' : 'No data');
          
          if (gameMode === 'visualization') {
            console.log('👀 Updating visualization mode');
            renderer.updateSkeleton(skeletonData);
          } else {
            console.log('🎯 Updating physics mode');
            // In physics mode, update physics system and render physics positions
            physicsSystem.updateSkeleton(skeletonData);
            physicsSystem.step();
            
            // Get physics positions and create visualization
            const physicsPositions = physicsSystem.getPhysicsJointPositions();
            if (skeletonData && physicsPositions.size > 0) {
              console.log('🔄 Applying physics positions to skeleton');
              // Create a modified skeleton data with physics positions
              const physicsSkeletonData = {
                ...skeletonData,
                joints: skeletonData.joints.map(joint => ({
                  ...joint,
                  worldPosition: physicsPositions.get(joint.id) ? {
                    x: physicsPositions.get(joint.id)!.x,
                    y: physicsPositions.get(joint.id)!.y,
                    z: physicsPositions.get(joint.id)!.z
                  } : joint.worldPosition
                }))
              };
              renderer.updateSkeleton(physicsSkeletonData);
            }
          }
        });
        console.log('✅ Skeleton subscription set up');

        console.log('📹 Setting up camera...');
        // Setup camera for video feed
        await setupCamera();
        
        console.log('🎮 Creating game objects...');
        // Add some interactive game objects
        createGameObjects();
        
        setIsInitialized(true);
        console.log('🎉 Demo initialization complete!');
      } else {
        console.error('❌ Canvas container not found');
      }
    } catch (error) {
      console.error('❌ Failed to initialize demo:', error);
    }
  };

  const setupCamera = async () => {
    if (!videoRef.current) return;
    
    try {
      // Stop any existing stream first
      const video = videoRef.current;
      if (video.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }

      // Get available video devices to choose the best one
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('📷 Available video devices:', videoDevices.map(d => ({ label: d.label, deviceId: d.deviceId })));

      // Try to get the maximum resolution and field of view
      // Start with high-end constraints and fall back if needed
      const constraints = [
        // Ultra-wide 4K (if available)
        {
          video: {
            width: { ideal: 3840, min: 1920 },
            height: { ideal: 2160, min: 1080 },
            frameRate: { ideal: 30, min: 15 },
            facingMode: 'user',
            aspectRatio: { ideal: 16/9 }
          }
        },
        // High resolution 1080p
        {
          video: {
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 60, min: 30 },
            facingMode: 'user',
            aspectRatio: { ideal: 16/9 }
          }
        },
        // Standard HD with wider field of view preference
        {
          video: {
            width: { ideal: 1280, min: 960 },
            height: { ideal: 720, min: 540 },
            frameRate: { ideal: 30, min: 24 },
            facingMode: 'user'
          }
        },
        // Fallback to any available camera
        {
          video: {
            facingMode: 'user'
          }
        }
      ];

      let stream: MediaStream | null = null;
      
      // Try constraints in order of preference
      for (let i = 0; i < constraints.length; i++) {
        try {
          console.log(`📷 Trying camera constraint set ${i + 1}:`, constraints[i]);
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          console.log('✅ Camera constraint successful!');
          break;
        } catch (error) {
          console.log(`⚠️ Camera constraint ${i + 1} failed:`, error);
          if (i === constraints.length - 1) {
            throw error; // Re-throw if all constraints failed
          }
        }
      }

      if (!stream) {
        throw new Error('Failed to get camera stream with any constraints');
      }
      
      // Log the actual stream capabilities we got
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities?.();
      const settings = videoTrack.getSettings();
      
      console.log('📊 Camera stream info:', {
        settings: settings,
        capabilities: capabilities || 'Not available',
        label: videoTrack.label
      });

      console.log('🎥 Actual resolution:', `${settings.width}x${settings.height}@${settings.frameRate}fps`);
      
      video.srcObject = stream;
      
      // Wait for video to be ready before playing
      await new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('error', handleError);
          
          // Log final video element dimensions
          console.log('📺 Video element info:', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
          });
          
          resolve();
        };
        
        const handleError = (error: Event) => {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('error', handleError);
          reject(error);
        };
        
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('error', handleError);
        
        // Trigger load if not already loading
        if (video.readyState < 2) {
          video.load();
        } else {
          handleCanPlay();
        }
      });
      
      // Now play the video
      await video.play();
      
      console.log('✅ Camera setup successful with optimal resolution');
    } catch (error) {
      console.error('❌ Camera access failed:', error);
      // Show user-friendly error message
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          alert('Camera access was denied. Please allow camera access and refresh the page.');
        } else if (error.name === 'NotFoundError') {
          alert('No camera found. Please connect a camera and refresh the page.');
        } else if (error.name === 'OverconstrainedError') {
          alert('Camera constraints not supported. Trying with lower resolution...');
          // Retry with minimal constraints
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            await video.play();
            console.log('✅ Camera setup successful with fallback settings');
          } catch (fallbackError) {
            console.error('❌ Fallback camera setup also failed:', fallbackError);
          }
        }
      }
    }
  };

  const createGameObjects = () => {
    if (!rendererRef.current || !physicsSystemRef.current) return;

    const scene = rendererRef.current.getScene();
    const physicsSystem = physicsSystemRef.current;

    console.log('🎮 Creating more reachable game objects...');

    // Create balls that are more reachable - closer to the user and at various heights
    for (let i = 0; i < 8; i++) {
      // Create balls in a more reachable area around the user
      const angle = (i / 8) * Math.PI * 2; // Distribute in a circle
      const radius = 0.3 + Math.random() * 0.4; // Distance from center: 0.3-0.7m
      const height = 0.2 + Math.random() * 1.2; // Height: 0.2-1.4m
      
      const position = new THREE.Vector3(
        Math.cos(angle) * radius, // X: circular distribution
        height,                   // Y: random height within reach
        Math.sin(angle) * radius * 0.5 // Z: closer to camera (shallower depth)
      );

      console.log(`🎯 Ball ${i} position:`, position);

      // Create visual representation - make balls slightly larger and more colorful
      const geometry = new THREE.SphereGeometry(0.08, 16, 12);
      const hue = i / 8; // Different color for each ball
      const material = new THREE.MeshLambertMaterial({ 
        color: new THREE.Color().setHSL(hue, 0.8, 0.6),
        emissive: new THREE.Color().setHSL(hue, 0.3, 0.1) // Slight glow
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Create physics body with appropriate size
      const { rigidBody } = physicsSystem.addPhysicsObject(
        position,
        'sphere',
        new THREE.Vector3(0.08, 0, 0), // Slightly larger radius
        0.2 // Heavier for better physics interaction
      );

      gameObjectsRef.current.push({ rigidBody, mesh });
    }

    // Add a few floating balls at different heights for variety
    for (let i = 0; i < 3; i++) {
      const position = new THREE.Vector3(
        (Math.random() - 0.5) * 1.0,  // X: -0.5 to 0.5m
        0.8 + Math.random() * 0.6,   // Y: 0.8 to 1.4m (head/shoulder height)
        -0.2 + Math.random() * 0.4   // Z: -0.2 to 0.2m (very close)
      );

      console.log(`🎈 Floating ball ${i} position:`, position);

      const geometry = new THREE.SphereGeometry(0.06, 12, 8);
      const material = new THREE.MeshLambertMaterial({ 
        color: new THREE.Color().setHSL(0.1 + i * 0.3, 0.9, 0.7),
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      scene.add(mesh);

      const { rigidBody } = physicsSystem.addPhysicsObject(
        position,
        'sphere',
        new THREE.Vector3(0.06, 0, 0),
        0.1 // Lighter for easy hitting
      );

      gameObjectsRef.current.push({ rigidBody, mesh });
    }

    console.log(`✅ Created ${gameObjectsRef.current.length} game objects total`);

    // Start game object sync loop
    syncGameObjects();
  };

  const syncGameObjects = () => {
    if (!physicsSystemRef.current) return;

    // Sync visual objects with physics
    gameObjectsRef.current.forEach(({ rigidBody, mesh }) => {
      const pos = rigidBody.translation();
      const rot = rigidBody.rotation();
      
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

      // Check if ball fell off the screen (simple scoring)
      if (pos.y < -2) {
        setScore(prev => prev + 1);
        // Reset ball position
        rigidBody.setTranslation({ x: (Math.random() - 0.5) * 2, y: 2, z: 0 }, true);
        rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    });

    requestAnimationFrame(syncGameObjects);
  };

  const startTracking = () => {
    if (skeletonProviderRef.current && videoRef.current) {
      skeletonProviderRef.current.startLiveDetection(videoRef.current);
      setIsTracking(true);
    }
  };

  const stopTracking = () => {
    if (skeletonProviderRef.current) {
      skeletonProviderRef.current.stopLiveDetection();
      setIsTracking(false);
    }
  };

  const toggleGameMode = () => {
    setGameMode(prev => prev === 'visualization' ? 'physics' : 'visualization');
  };

  const applyRandomForce = () => {
    if (!physicsSystemRef.current) return;

    // Apply random forces to hand joints for fun
    const leftWristId = 15; // Left wrist
    const rightWristId = 16; // Right wrist

    const force = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 5,
      (Math.random() - 0.5) * 10
    );

    physicsSystemRef.current.applyForceToJoint(leftWristId, force);
    physicsSystemRef.current.applyForceToJoint(rightWristId, force.clone().negate());
  };

  const resetGame = () => {
    setScore(0);
    
    // Reset all game objects
    gameObjectsRef.current.forEach(({ rigidBody }) => {
      rigidBody.setTranslation({ 
        x: (Math.random() - 0.5) * 2, 
        y: Math.random() * 2 + 1, 
        z: 0 
      }, true);
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    });
  };

  const cleanup = () => {
    if (skeletonProviderRef.current) {
      skeletonProviderRef.current.dispose();
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    if (physicsSystemRef.current) {
      physicsSystemRef.current.dispose();
    }
  };

  return (
    <div className="physics-game-demo">
      {/* Full-window 3D canvas */}
      <div 
        ref={canvasContainerRef}
        className="canvas-container"
      />

      {/* Camera video overlay - top right */}
      <div className="video-overlay">
        <video
          ref={videoRef}
          width="200"
          height="150"
          muted
          playsInline
        />
      </div>

      {/* Control panel - top left */}
      <div className="controls">
        <h2>Live Human Skeleton Physics Demo</h2>
        
        <div className="status">
          <span>Status: {isInitialized ? 'Ready' : 'Initializing...'}</span>
          <span>Tracking: {isTracking ? 'ON' : 'OFF'}</span>
          <span>Mode: {gameMode}</span>
          <span>Score: {score}</span>
        </div>

        <div className="buttons">
          {isInitialized && (
            <>
              <button onClick={isTracking ? stopTracking : startTracking}>
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
              </button>
              
              <button onClick={toggleGameMode}>
                Switch to {gameMode === 'visualization' ? 'Physics' : 'Visualization'} Mode
              </button>
              
              {gameMode === 'physics' && (
                <>
                  <button onClick={applyRandomForce}>
                    Apply Random Force
                  </button>
                  <button onClick={resetGame}>
                    Reset Game
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Instructions panel - bottom left */}
      <div className={`instructions ${showInstructions ? '' : 'hidden'}`}>
        <h3>Instructions:</h3>
        <ul>
          <li><strong>Visualization Mode:</strong> See your skeleton tracked in real-time</li>
          <li><strong>Physics Mode:</strong> Your skeleton becomes a physics object that can interact with balls</li>
          <li>Move your hands to hit the colored balls and score points!</li>
          <li>The physics system uses Rapier3D for realistic interactions</li>
        </ul>
        
        <h3>Architecture:</h3>
        <ul>
          <li><strong>SkeletonProvider:</strong> MediaPipe pose detection (separated from rendering)</li>
          <li><strong>ThreeSkeletonRenderer:</strong> Pure Three.js visualization</li>
          <li><strong>SkeletonPhysicsSystem:</strong> Rapier3D physics integration</li>
          <li>This modular design allows easy extension for complex games!</li>
        </ul>
      </div>

      {/* Instructions toggle button - bottom right */}
      <button 
        className="instructions-toggle"
        onClick={() => setShowInstructions(!showInstructions)}
        title={showInstructions ? 'Hide Instructions' : 'Show Instructions'}
      >
        {showInstructions ? '×' : '?'}
      </button>
    </div>
  );
};