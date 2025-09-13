import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SkeletonProvider } from '../providers/SkeletonProvider';
import { ThreeSkeletonRenderer } from '../renderers/ThreeSkeletonRenderer';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { SkeletonPhysicsAdapter } from '../physics/SkeletonPhysicsAdapter';
import { FocusManager, type PausableComponent } from '../utils/FocusManager';
import { generateBallSpawn } from '../game/BallSpawner';
import { createCollisionEffect, type CollisionEffect } from '../game/CollisionEffects';

// Pool and ball constants
const MAX_BALLS = 10;
const BALL_RADIUS = 0.08;
const OFFSCREEN_POS = new THREE.Vector3(0, -10, 0);

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skeletonProviderRef = useRef<SkeletonProvider | null>(null);
  const rendererRef = useRef<ThreeSkeletonRenderer | null>(null);
  const physicsSystemRef = useRef<PhysicsSystem | null>(null);
  const skeletonPhysicsRef = useRef<SkeletonPhysicsAdapter | null>(null);
  const gameObjectsRef = useRef<Array<{ rigidBody: any; mesh: THREE.Mesh; active?: boolean }>>([]);
  const ballPoolRef = useRef<Array<{ rigidBody: any; mesh: THREE.Mesh; active: boolean }>>([]);
  const ballGeometryRef = useRef<THREE.SphereGeometry | null>(null);
  const collisionEffectsRef = useRef<CollisionEffect[]>([]);
  
  const [gameMode, setGameMode] = useState<'visualization' | 'physics'>('visualization');
  const [score, setScore] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [systemsReady, setSystemsReady] = useState(false);
  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [showSkeletonOverlay, setShowSkeletonOverlay] = useState(false);
  const skeletonOverlayRef = useRef<any>(null);
  const focusManagerRef = useRef<FocusManager | null>(null);

  // Create pausable wrappers for all components
  const pausableComponents = useRef<PausableComponent[]>([]);

  useEffect(() => {
    if(!canvasRef.current) return;
    initializeDemo();
    
    // Initialize focus manager
    focusManagerRef.current = FocusManager.getInstance();
    
    return () => {
      cleanup();
      // Unregister all pausable components
      pausableComponents.current.forEach(component => {
        focusManagerRef.current?.unregister(component);
      });
    };
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

      // Create pausable wrapper for skeleton provider
      const pausableProvider: PausableComponent = {
        pause: () => skeletonProvider.pause(),
        resume: () => skeletonProvider.resume()
      };
      pausableComponents.current.push(pausableProvider);
      focusManagerRef.current?.register(pausableProvider);

      // Initialize renderer
      if (canvasRef.current) {
        console.log('🎨 Setting up Three.js renderer...');
        // Set up renderer with physics mode enabled
        const renderer = new ThreeSkeletonRenderer(
          canvasRef.current, {
          showJointLabels: false,
          physicsMode: gameMode === 'physics', // Enable physics mode visualization
          physicsJointColor: '#ffaa00', // Orange color for physics joints
          physicsJointSize: 0.08 // Large collision spheres
        });
        rendererRef.current = renderer;
        console.log('✅ Three.js renderer created');

        // Create pausable wrapper for renderer
        const pausableRenderer: PausableComponent = {
          pause: () => renderer.pause(),
          resume: () => renderer.resume()
        };
        pausableComponents.current.push(pausableRenderer);
        focusManagerRef.current?.register(pausableRenderer);

        console.log('⚙️ Initializing physics system...');
        // Initialize new modular physics system
        const physicsSystem = new PhysicsSystem();
        await physicsSystem.initialize();
        physicsSystemRef.current = physicsSystem;
        
        // Create skeleton physics adapter
        const skeletonPhysics = new SkeletonPhysicsAdapter(physicsSystem, {
          jointMass: 0.1,
          jointRadius: 0.03,
          boneStiffness: 500.0,
          damping: 25.0,
          enableCollisions: true,
          gravityScale: 0.5
        });
        skeletonPhysicsRef.current = skeletonPhysics;
        console.log('✅ Physics system and skeleton adapter initialized');

        console.log('🔗 Setting up skeleton update subscription...');
        // Subscribe to skeleton updates
        skeletonProvider.subscribe((skeletonData) => {
          // Always update renderer with latest skeleton. Physics system doesn't own skeleton.
          renderer.updateSkeleton(skeletonData);
        });
        console.log('✅ Skeleton subscription set up');

        console.log('📹 Setting up camera...');
        // Setup camera for video feed
        await setupCamera();
        
        console.log('🎮 Creating game objects...');
        // Add some interactive game objects
        createGameObjects();
        
        setSystemsReady(true);
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
            const video = videoRef.current;
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
    if (!rendererRef.current || !skeletonPhysicsRef.current) return;

    const scene = rendererRef.current.getScene();
    const skeletonPhysics = skeletonPhysicsRef.current;

    console.log('🎮 Initializing ball pool...');

    // Shared geometry (created once)
    if (!ballGeometryRef.current) {
      ballGeometryRef.current = new THREE.SphereGeometry(BALL_RADIUS, 16, 12);
    }

    // Helper to create a pooled ball (inactive by default)
    const createPooledBall = (index: number) => {
      const hue = index / MAX_BALLS;
      const material = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color().setHSL(hue, 0.8, 0.6),
      });
      const mesh = new THREE.Mesh(ballGeometryRef.current!, material);
      mesh.visible = false;
      mesh.position.copy(OFFSCREEN_POS);
      scene.add(mesh);

      // Create physics body offscreen
      const { rigidBody } = skeletonPhysics.addPhysicsObject(
        OFFSCREEN_POS.clone(),
        'sphere',
        new THREE.Vector3(BALL_RADIUS, 0, 0),
        0.05
      );

      return { rigidBody, mesh, active: false };
    };

    // Build pool if empty
    if (ballPoolRef.current.length === 0) {
      for (let i = 0; i < MAX_BALLS; i++) {
        const ball = createPooledBall(i);
        ballPoolRef.current.push(ball);
      }
      console.log(`✅ Created ball pool with ${ballPoolRef.current.length} balls`);
    }

    // Helper to spawn/activate a ball from the pool with initial velocity toward center
    const activateBall = (ballIndex: number) => {
      const ball = ballPoolRef.current[ballIndex];
      if (!ball) return;
      const { position, velocity } = generateBallSpawn();
      ball.active = true;
      ball.mesh.visible = true;
      ball.mesh.position.copy(position);
      ball.rigidBody.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
      ball.rigidBody.setLinvel(velocity, true);
    };

    // Spawn initial set of balls (reuse from pool) coming from random directions
    console.log('🎯 Spawning initial balls from pool...');
    for (let i = 0; i < Math.min(8, MAX_BALLS); i++) {
      activateBall(i);
    }

    // Keep compatibility with existing refs by mirroring pool into gameObjectsRef
    gameObjectsRef.current = ballPoolRef.current;

    console.log('✅ Ball pool initialized and initial balls activated');
  };

  const startTracking = async () => {
    if (!videoRef.current || !skeletonProviderRef.current) return;

    try {
      // Setup camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Start skeleton detection
      skeletonProviderRef.current.startLiveDetection(videoRef.current);
      setIsDetectionActive(true);
      setSystemsReady(true);
      
      console.log('✅ Tracking started');
    } catch (error) {
      console.error('❌ Failed to start tracking:', error);
    }
  };

  const stopTracking = () => {
    if (skeletonProviderRef.current) {
      skeletonProviderRef.current.stopLiveDetection();
      setIsDetectionActive(false);
    }
  };

  const toggleGameMode = () => {
    setGameMode(prev => prev === 'visualization' ? 'physics' : 'visualization');
  };

  const resetGame = () => {
    setScore(0);

    // Reset all balls by respawning from random directions
    ballPoolRef.current.forEach((ball) => {
      const { position, velocity } = generateBallSpawn();
      ball.active = true;
      ball.mesh.visible = true;
      ball.mesh.position.copy(position);
      ball.rigidBody.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
      ball.rigidBody.setLinvel(velocity, true);
    });
  };

  const cleanup = () => {
    // Dispose pending collision effects
    const scene = rendererRef.current?.getScene();
    collisionEffectsRef.current.forEach((fx) => {
      try { fx.dispose(); } catch {}
    });
    collisionEffectsRef.current = [];

    if (skeletonProviderRef.current) {
      skeletonProviderRef.current.dispose();
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    if (skeletonPhysicsRef.current) {
      skeletonPhysicsRef.current.dispose();
    }
    if (physicsSystemRef.current) {
      physicsSystemRef.current.dispose();
    }
  };

  // Single unified animation loop that handles everything
  useEffect(() => {
    if (!systemsReady) return; // Start as soon as systems are ready, not just when tracking

    let animationId: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;

      try {
        // Step physics simulation once per frame
        if (skeletonPhysicsRef.current) {
          skeletonPhysicsRef.current.step();
        }

        // Update active collision effects
        if (rendererRef.current) {
          const fxList = collisionEffectsRef.current;
          for (let i = fxList.length - 1; i >= 0; i--) {
            const fx = fxList[i];
            fx.update(deltaSeconds);
            if (fx.done) {
              try { fx.dispose(); } catch {}
              fxList.splice(i, 1);
            }
          }
        }

        // Use pool for updates
        const activeBalls = ballPoolRef.current;
        if (activeBalls.length > 0) {
          // Get skeleton joint positions from renderer for collision detection
          const skeletonJointPositions = rendererRef.current?.getJointWorldPositions() || new Map();
          
          activeBalls.forEach(({ rigidBody, mesh, active }, ballIndex) => {
            if (!active) return;
            try {
              const pos = rigidBody.translation();
              const rot = rigidBody.rotation();
              const velocity = rigidBody.linvel();
              
              // Update mesh position and rotation
              mesh.position.set(pos.x, pos.y, pos.z);
              mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

              // Check for collisions with skeleton joints (only when tracking is active)
              if (isDetectionActive && skeletonJointPositions.size > 0) {
                const ballPosition = new THREE.Vector3(pos.x, pos.y, pos.z);
                const ballRadius = BALL_RADIUS;
                const jointRadius = 0.08;
                const collisionDistance = ballRadius + jointRadius;

                skeletonJointPositions.forEach((jointPos) => {
                  const distance = ballPosition.distanceTo(jointPos);
                  if (distance < collisionDistance) {
                    const currentVelocity = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
                    if (currentVelocity > 0.05) {
                      setScore(prev => prev + 1);

                      // Apply realistic hit impulse
                      const hitDirection = new THREE.Vector3()
                        .subVectors(ballPosition, jointPos)
                        .normalize()
                        .multiplyScalar(3.0);
                      rigidBody.applyImpulse({
                        x: hitDirection.x,
                        y: hitDirection.y + 1.0,
                        z: hitDirection.z
                      }, true);

                      // Visual collision effect at the contact point on the ball surface
                      const dir = new THREE.Vector3().subVectors(ballPosition, jointPos).normalize();
                      const contactPoint = ballPosition.clone().addScaledVector(dir, -ballRadius);
                      const scene = rendererRef.current?.getScene();
                      if (scene) {
                        const fx = createCollisionEffect(scene, contactPoint, {
                          color: (mesh.material as THREE.MeshBasicMaterial).color.getHex(),
                        });
                        collisionEffectsRef.current.push(fx);
                      }

                      // Temporary color flash for the ball
                      const originalColor = (mesh.material as THREE.MeshBasicMaterial).color.clone();
                      (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
                      setTimeout(() => {
                        (mesh.material as THREE.MeshBasicMaterial).color.copy(originalColor);
                      }, 120);
                    }
                  }
                });
              }

              // Reuse ball by respawning when out of bounds
              if (pos.y < -3) {
                const { position: newPosition, velocity: newVelocity } = generateBallSpawn();
                rigidBody.setTranslation({ x: newPosition.x, y: newPosition.y, z: 0 }, true);
                rigidBody.setLinvel(newVelocity, true);
              }
            } catch (error) {
              console.error(`❌ Error updating ball ${ballIndex}:`, error);
            }
          });
        }

        // Continue animation loop
        animationId = requestAnimationFrame(animate);
      } catch (error) {
        console.error('❌ Animation loop error:', error);
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [systemsReady, isDetectionActive]);

  // Toggle skeleton overlay on video
  const toggleSkeletonOverlay = async () => {
    if (!videoRef.current || !skeletonProviderRef.current) return;

    if (showSkeletonOverlay && skeletonOverlayRef.current) {
      // Disable overlay
      console.log('🔴 Disabling skeleton overlay');
      skeletonOverlayRef.current.dispose();
      const canvas = skeletonOverlayRef.current.getCanvas();
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      skeletonOverlayRef.current = null;
      setShowSkeletonOverlay(false);
    } else {
      // Enable overlay
      console.log('🟢 Enabling skeleton overlay');
      try {
        const overlay = await skeletonProviderRef.current.enableDebugOverlay(videoRef.current, {
          jointSize: 8,
          boneThickness: 3,
          jointColor: '#FF0040',
          boneColor: '#00FF40',
          showJointLabels: true,
          showConfidence: true
        });
        skeletonOverlayRef.current = overlay;
        setShowSkeletonOverlay(true);
        console.log('✅ Skeleton overlay enabled');
      } catch (error) {
        console.error('❌ Failed to enable skeleton overlay:', error);
      }
    }
  };

  return (
    <div className="physics-game-demo">
      {/* Full-window 3D canvas */}
      <div 
        ref={canvasContainerRef}
        className="canvas-container">
        <canvas ref={canvasRef}/>
      </div>

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
          <span>Status: {systemsReady ? 'Ready' : 'Initializing...'}</span>
          <span>Tracking: {isDetectionActive ? 'ON' : 'OFF'}</span>
          <span>Mode: {gameMode}</span>
          <span>Score: {score}</span>
        </div>

        <div className="buttons">
          {systemsReady && (
            <>
              <button onClick={isDetectionActive ? stopTracking : startTracking}>
                {isDetectionActive ? 'Stop Tracking' : 'Start Tracking'}
              </button>
              
              <button onClick={toggleGameMode}>
                Switch to {gameMode === 'visualization' ? 'Physics' : 'Visualization'} Mode
              </button>
              
              <button onClick={resetGame}>
                Reset Game
              </button>
              
              <button onClick={toggleSkeletonOverlay}>
                {showSkeletonOverlay ? 'Hide' : 'Show'} Skeleton Overlay
              </button>
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