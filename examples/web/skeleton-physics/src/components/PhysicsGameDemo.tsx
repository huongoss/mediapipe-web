import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SkeletonProvider } from '../providers/SkeletonProvider';
import { ThreeSkeletonRenderer } from '../renderers/ThreeSkeletonRenderer';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { SkeletonPhysicsAdapter } from '../physics/SkeletonPhysicsAdapter';
import { FocusManager, type PausableComponent } from '../utils/FocusManager';
import { generateBallSpawn } from '../game/BallSpawner';
import { createCollisionEffect, type CollisionEffect } from '../game/CollisionEffects';
import { AudioManager } from '../audio/AudioManager';
import { Leaderboard } from '../ui/Leaderboard';
import { SettingsPanel } from '../ui/SettingsPanel';
import { loadScores, saveScore } from '../utils/LeaderboardStore';
import { captureCanvasWithHUD, shareImage } from '../utils/Screenshot';
import { ConfettiOverlay, type ConfettiOverlayHandle } from '../ui/ConfettiOverlay';
import { FabRadialMenu } from '../ui/FabRadialMenu';
import { HomeOverlay, PauseOverlay, ResultOverlay } from '../ui/Overlays';
import { TopHUD } from '../ui/TopHUD';
import { TrailParticles } from '../game/TrailParticles.ts';
import { StoryMode } from '../story/StoryMode';
import { StoryHUD } from '../ui/StoryHUD';
import { StoryEnvironment } from '../story/StoryEnvironment';
import { StoryGuideOverlay } from '../ui/StoryGuideOverlay';

// Pool and ball constants
const MAX_BALLS = 20;
const BALL_RADIUS = 0.08;
const OFFSCREEN_POS = new THREE.Vector3(0, -3, 0);
const TARGET_ACTIVE_BALLS = 12; // desired number of active balls in normal mode
const SPAWN_INTERVAL_MS = 1000; // how often to try spawning a new ball

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
  const trailParticlesRef = useRef<TrailParticles | null>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const confettiRef = useRef<ConfettiOverlayHandle|null>(null);
  
  const [score, setScore] = useState(0);
  const [systemsReady, setSystemsReady] = useState(false);
  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [showSkeletonOverlay, setShowSkeletonOverlay] = useState(false);
  const skeletonOverlayRef = useRef<any>(null);
  const focusManagerRef = useRef<FocusManager | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [uiOpenLeaderboard, setUiOpenLeaderboard] = useState(false);
  const [uiOpenSettings, setUiOpenSettings] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [settings, setSettings] = useState({ music:false, sfx:true, overlay:false });
  const settingsRef = useRef(settings);
  const [scores, setScores] = useState(loadScores());
  const [toast, setToast] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [splashMsg, setSplashMsg] = useState<string | null>(null);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const storyModeRef = useRef<StoryMode | null>(null);
  const [storySnapshot, setStorySnapshot] = useState<any | null>(null);
  const prevStoryChapterRef = useRef<number>(0);
  const storyEnvRef = useRef<StoryEnvironment | null>(null);
  const isStoryModeRef = useRef<boolean>(false);
  const spawnerTimerRef = useRef<number | null>(null);
  const lastSafetyCheckRef = useRef<number>(0);
  const isRoundActiveRef = useRef<boolean>(false);
  const musicElRef = useRef<HTMLAudioElement | null>(null);

  // Helper to spawn one inactive ball from the pool
  const spawnOneFromPool = () => {
    const idx = ballPoolRef.current.findIndex(b => !b.active);
    if (idx >= 0) {
      const ball = ballPoolRef.current[idx];
      const { position, velocity } = generateBallSpawn();
      ball.active = true;
      ball.mesh.visible = true;
      ball.mesh.position.copy(position);
      ball.rigidBody.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
      ball.rigidBody.setLinvel(velocity, true);
    }
  };

  // Create pausable wrappers for all components
  const pausableComponents = useRef<PausableComponent[]>([]);
  // Track previous bone centers to compute velocities (m/s)
  const prevBoneCentersRef = useRef<Map<string, THREE.Vector3>>(new Map());
  // Track previous root X to compute body lateral velocity
  const prevRootXRef = useRef<number | null>(null);

  // Light-weight combo mechanic: bump on each hit and decay slowly
  useEffect(()=>{
    if (multiplier <= 1) return;
    const id = setInterval(()=> setMultiplier(m=> Math.max(1, +(m - 0.02).toFixed(2))), 200);
    return ()=> clearInterval(id);
  }, [multiplier]);

  // Utility: classify bone segment by joint ids
  const classifySegment = (fromId: number, toId: number): 'good' | 'bad' | 'neutral' => {
    // MediaPipe Pose joint ids
    const HEAD_IDS = new Set([0,1,2,3,4,5,6,7,8,9,10]); // head/face region
    const SHOULDERS = new Set([11,12]);
  // const ELBOWS = new Set([13,14]);
    const WRISTS = new Set([15,16]);
  // const HIPS = new Set([23,24]);
    const UPPER_ARMS: Array<[number, number]> = [[11,13],[12,14]];
    const FOREARMS: Array<[number, number]> = [[13,15],[14,16]];
    const TORSO: Array<[number, number]> = [[11,12],[11,23],[12,24],[23,24]];

    const a = Math.min(fromId, toId), b = Math.max(fromId, toId);
    const match = (pairs: Array<[number, number]>) => pairs.some(([x,y]) => x===a && y===b);

    // Good: hands/forearms (wrist-elbow)
    if (WRISTS.has(a) || WRISTS.has(b) || match(FOREARMS)) return 'good';
    // Bad: head, shoulders, upper arms, torso
    if (HEAD_IDS.has(a) || HEAD_IDS.has(b)) return 'bad';
    if (SHOULDERS.has(a) || SHOULDERS.has(b)) return 'bad';
    if (match(UPPER_ARMS)) return 'bad';
    if (match(TORSO)) return 'bad';
    return 'neutral';
  };

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

  // Keep ref in sync so the animation loop can read the latest story mode flag
  useEffect(()=>{ isStoryModeRef.current = isStoryMode; }, [isStoryMode]);
  useEffect(()=>{ isRoundActiveRef.current = isRoundActive; }, [isRoundActive]);
  useEffect(()=>{ settingsRef.current = settings; }, [settings]);

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
        pause: () => {
          setIsPaused(true)
          skeletonProvider.pause()
        },
        resume: () => {
          setIsPaused(false)
          skeletonProvider.resume()
        }
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
          physicsMode: true, // Enable physics mode visualization
          physicsJointColor: '#ffaa00', // Orange color for physics joints
          physicsJointSize: 0.08 // Large collision spheres
        });
        rendererRef.current = renderer;
        console.log('✅ Three.js renderer created');

        // Init audio manager (will resume on first user gesture)
        audioRef.current = new AudioManager();
        audioRef.current.init();
        const resumeAudioOnce = () => audioRef.current?.resume();
        window.addEventListener('pointerdown', resumeAudioOnce, { once: true });

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
          // Feed story recognizer if active
          if (storyModeRef.current) {
            storyModeRef.current.updateSkeleton(skeletonData);
            setStorySnapshot(storyModeRef.current.getSnapshot());
          }
        });
        console.log('✅ Skeleton subscription set up');

        console.log('📹 Setting up camera...');
        // Setup camera for video feed
        await setupCamera();
        
        console.log('🎮 Creating game objects...');
        // Add some interactive game objects
        createGameObjects();

        // Create particle trail system
        if (renderer.getScene) {
          const scene = renderer.getScene();
          trailParticlesRef.current = new TrailParticles(scene, 1000);
        }
        
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

    // Utility: activate one inactive ball (if available)
    const spawnOne = () => {
      const idx = ballPoolRef.current.findIndex(b => !b.active);
      if (idx >= 0) activateBall(idx);
    };

    // Defer initial spawning until round starts (music-based)
    console.log('⏸️ Deferring ball spawn until round starts...');

    // Keep compatibility with existing refs by mirroring pool into gameObjectsRef
    gameObjectsRef.current = ballPoolRef.current;

    console.log('✅ Ball pool initialized and initial balls activated');

    // Periodically spawn new balls to keep action lively (normal mode + round active only)
    if (spawnerTimerRef.current) window.clearInterval(spawnerTimerRef.current);
    spawnerTimerRef.current = window.setInterval(() => {
      if (isStoryModeRef.current || !isRoundActiveRef.current) return;
      const activeCount = ballPoolRef.current.reduce((acc, b) => acc + (b.active ? 1 : 0), 0);
      if (activeCount < TARGET_ACTIVE_BALLS) {
        spawnOne();
      }
    }, SPAWN_INTERVAL_MS);
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

  // Music-driven round control
  const startMusicRound = () => {
    // choose a random mp3 in public/media
    const tracks = [
      '/media/30eac4c8-7878-4185-87d4-c8b3721c9204.mp3',
      '/media/371a2531-7ff1-42b7-9e29-0b5cb8cc037f.mp3'
    ];
    const pick = tracks[Math.floor(Math.random()*tracks.length)];
    // show start splash
    setSplashMsg('Get Ready! 🎵');
    setTimeout(()=> setSplashMsg(null), 1200);

    // prepare audio element lazily
    if (!musicElRef.current) {
      musicElRef.current = new Audio();
      musicElRef.current.preload = 'auto';
    }
    const el = musicElRef.current;
    el!.src = pick;
    el!.currentTime = 0;
    el!.volume = settingsRef.current.music ? 0.8 : 0.8; // volume independent of sfx setting
    el!.onended = () => {
      endMusicRound();
    };
    el!.play().catch(()=>{
      // If autoplay blocked, user interaction will unlock later.
    });

    // Mark round active and spawn initial volley
    setIsRoundActive(true);
    // spawn up to target active balls immediately
    for (let i = 0; i < Math.min(TARGET_ACTIVE_BALLS, MAX_BALLS); i++) {
      const idx = ballPoolRef.current.findIndex(b => !b.active);
      if (idx >= 0) {
        const { position, velocity } = generateBallSpawn();
        const ball = ballPoolRef.current[idx];
        ball.active = true;
        ball.mesh.visible = true;
        ball.mesh.position.copy(position);
        ball.rigidBody.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
        ball.rigidBody.setLinvel(velocity, true);
      }
    }
  };

  const endMusicRound = () => {
    // show end splash and stop spawns
    setIsRoundActive(false);
    setSplashMsg('Song finished 🎮 Game Over');
    setTimeout(()=> setSplashMsg(null), 1500);
    // Stop and clear audio
    try { musicElRef.current?.pause(); } catch {}
    if (musicElRef.current) {
      musicElRef.current.onended = null;
    }
    // Show result overlay
    setShowResult(true);
  };

  const stopTracking = () => {
    if (skeletonProviderRef.current) {
      skeletonProviderRef.current.stopLiveDetection();
      setIsDetectionActive(false);
    }
  };

  // Save score on reset if it beats best
  const resetGame = () => {
    setScore(0);

    // Arcade-only: respawn balls; in Story Mode, hide and deactivate balls
    if (!isStoryModeRef.current) {
      ballPoolRef.current.forEach((ball) => {
        const { position, velocity } = generateBallSpawn();
        ball.active = true;
        ball.mesh.visible = true;
        ball.mesh.position.copy(position);
        ball.rigidBody.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
        ball.rigidBody.setLinvel(velocity, true);
      });
    } else {
      ballPoolRef.current.forEach((ball) => {
        ball.active = false;
        ball.mesh.visible = false;
        ball.mesh.position.copy(OFFSCREEN_POS);
        ball.rigidBody.setTranslation({ x: OFFSCREEN_POS.x, y: OFFSCREEN_POS.y, z: OFFSCREEN_POS.z }, true);
        ball.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      });
    }

    const name = localStorage.getItem('player_name') || 'Player';
    if (score > 0) {
      saveScore({ name, score, date: Date.now() });
      setScores(loadScores());
    }
    setScore(0);
    setMultiplier(1);
  };

  const cleanup = () => {
    // Dispose pending collision effects
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
    audioRef.current?.dispose();
    audioRef.current = null;
    // story environment
    storyEnvRef.current?.dispose();
    storyEnvRef.current = null;
    // stop spawner interval
    if (spawnerTimerRef.current) {
      window.clearInterval(spawnerTimerRef.current);
      spawnerTimerRef.current = null;
    }
  };

  // Single unified animation loop that handles everything
  useEffect(() => {
    if (!systemsReady) return; // Start as soon as systems are ready, not just when tracking

    let animationId: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      if(isPaused) {
        animationId = requestAnimationFrame(animate);
        return;
      }
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

        // Update particle trails
        trailParticlesRef.current?.update(deltaSeconds);

        // Compute root (skeleton group) lateral velocity so bone speeds are relative to body motion
        const rootGroup = rendererRef.current?.getSkeletonGroup?.();
        const rootX = rootGroup ? rootGroup.position.x : 0;
        let rootVelX = 0;
        if (prevRootXRef.current !== null && deltaSeconds > 0) {
          rootVelX = (rootX - prevRootXRef.current) / deltaSeconds;
        }
        prevRootXRef.current = rootX;

        // Build bone segments and instantaneous relative speeds for audio intensity
        const boneSegments = rendererRef.current?.getBoneWorldSegments?.() || [];
        const boneRadius = rendererRef.current?.getBoneRadius?.() ?? 0.03; // fallback
        const boneSpeeds = new Map<string, number>();
        if (boneSegments.length > 0) {
          for (const seg of boneSegments) {
            const key = `${seg.fromId}-${seg.toId}`;
            const center = new THREE.Vector3().addVectors(seg.start, seg.end).multiplyScalar(0.5);
            const prev = prevBoneCentersRef.current.get(key);
            let speed = 0;
            if (prev && deltaSeconds > 0) {
              // Relative velocity = bone center velocity - root velocity (x only for now)
              const v = new THREE.Vector3().copy(center).sub(prev).divideScalar(deltaSeconds);
              v.x -= rootVelX;
              speed = v.length();
            }
            boneSpeeds.set(key, speed);
            prevBoneCentersRef.current.set(key, center);
          }
        }

        // Use pool for updates
        const activeBalls = ballPoolRef.current;
  if (!isStoryModeRef.current && isRoundActiveRef.current && activeBalls.length > 0) {
          activeBalls.forEach(({ rigidBody, mesh, active }, ballIndex) => {
            if (!active) return;
            try {
              const pos = rigidBody.translation();
              const rot = rigidBody.rotation();
              const velocity = rigidBody.linvel();
              
              // Update mesh position and rotation
              mesh.position.set(pos.x, pos.y, pos.z);
              mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

              // Check for collisions with skeleton bones (segments) when tracking is active
              if (isDetectionActive && boneSegments.length > 0) {
                const ballPosition = new THREE.Vector3(pos.x, pos.y, pos.z);
                const ballRadius = BALL_RADIUS;
                const combinedCheck = (segStart: THREE.Vector3, segEnd: THREE.Vector3, segR: number) => {
                  const ab = new THREE.Vector3().subVectors(segEnd, segStart);
                  const ap = new THREE.Vector3().subVectors(ballPosition, segStart);
                  const abLenSq = Math.max(1e-6, ab.lengthSq());
                  const t = THREE.MathUtils.clamp(ap.dot(ab) / abLenSq, 0, 1);
                  const closest = new THREE.Vector3().copy(segStart).addScaledVector(ab, t);
                  const dist = closest.distanceTo(ballPosition);
                  const overlap = (ballRadius + segR) - dist;
                  return overlap > 0 ? { closest, dist, overlap } : null;
                };

                // Iterate segments; react to first collision found
                for (const seg of boneSegments) {
                  const hit = combinedCheck(seg.start, seg.end, Math.max(boneRadius, 0.06)); // slightly enlarged bone for gameplay
                  if (!hit) continue;

                  const key = `${seg.fromId}-${seg.toId}`;
                  const boneSpeed = boneSpeeds.get(key) ?? 0;
                  const intensity = THREE.MathUtils.clamp(boneSpeed / 2.5, 0.2, 1); // scale speed -> [0,1]
                  const classification = classifySegment(seg.fromId, seg.toId);

                  // Compute impulse away from contact towards ball
                  const hitDirection = new THREE.Vector3()
                    .subVectors(ballPosition, hit.closest)
                    .normalize()
                    .multiplyScalar(2.5 + Math.min(3.0, boneSpeed * 0.6));
                  rigidBody.applyImpulse({
                    x: hitDirection.x,
                    y: hitDirection.y + 0.8,
                    z: hitDirection.z
                  }, true);

                  // Scoring and audio by classification (normal mode only)
                  const pan = THREE.MathUtils.clamp(ballPosition.x / 2.0, -1, 1);
                  if (!isStoryModeRef.current) {
                    if (classification === 'good') {
                      setScore(prev => {
                        const next = prev + 1;
                        if (next % 25 === 0) {
                          confettiRef.current?.burst?.();
                          setToast('Milestone! 🎉');
                        }
                        if (next > bestScore) {
                          confettiRef.current?.burst?.(undefined, 80, 80);
                        }
                        return next;
                      });
                      setMultiplier(m=> +(Math.min(3, m + 0.05).toFixed(2)));
                      setToast('Nice hit! ⚡');
                      if (settingsRef.current.sfx) audioRef.current?.playCollision(pan, intensity);
                      const ballSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
                      if (ballSpeed > 0.1) {
                        if (settingsRef.current.sfx) audioRef.current?.playBounceFast(pan, Math.min(1, intensity * 1.2));
                      }
                    } else if (classification === 'bad') {
                      setScore(prev => Math.max(0, prev - 1));
                      setMultiplier(m=> +(Math.max(1, m - 0.05).toFixed(2)));
                      setToast('Ouch! -1');
                      if (settingsRef.current.sfx) audioRef.current?.playBadHit(pan, Math.max(0.4, 1 - intensity * 0.5));
                    } else {
                      // neutral: no score change, softer collision
                      if (settingsRef.current.sfx) audioRef.current?.playCollision(pan, intensity * 0.5);
                    }
                  } else {
                    // Story mode retains previous positive feedback behavior if ever active (but balls are off in story mode)
                    if (settingsRef.current.sfx) audioRef.current?.playCollision(pan, intensity);
                  }

                  // Visual collision effect at contact point on ball surface
                  const dir = new THREE.Vector3().subVectors(ballPosition, hit.closest).normalize();
                  const contactPoint = ballPosition.clone().addScaledVector(dir, -ballRadius);
                  const scene = rendererRef.current?.getScene();
                  if (scene) {
                    const fx = createCollisionEffect(scene, contactPoint, {
                      color: (mesh.material as THREE.MeshBasicMaterial).color.getHex(),
                    });
                    collisionEffectsRef.current.push(fx);
                  }

                  // Trails: burst small particles from contact point
                  trailParticlesRef.current?.burst(contactPoint, new THREE.Color((mesh.material as THREE.MeshBasicMaterial).color.getHex()), 40);

                  // Temporary color flash for the ball
                  const originalColor = (mesh.material as THREE.MeshBasicMaterial).color.clone();
                  (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
                  setTimeout(() => {
                    (mesh.material as THREE.MeshBasicMaterial).color.copy(originalColor);
                  }, 120);

                  // UX: bump multiplier slightly and toast
                  setMultiplier(m=> +(Math.min(3, m + 0.05).toFixed(2)));
                  setToast('Nice hit! ⚡');

                  // Only handle first segment collision per frame for this ball
                  break;
                }
              }

              // Reuse ball by respawning when out of bounds
              if (pos.y < -2) {
                const { position: newPosition, velocity: newVelocity } = generateBallSpawn();
                rigidBody.setTranslation({ x: newPosition.x, y: newPosition.y, z: 0 }, true);
                rigidBody.setLinvel(newVelocity, true);
                // Reinforce visibility/active flags in case they drifted
                mesh.visible = true;
                (gameObjectsRef.current[ballIndex] as any).active = true;
              }
            } catch (error) {
              console.error(`❌ Error updating ball ${ballIndex}:`, error);
            }
          });

          // Safety: if no active balls visible for a bit, force-spawn one
          const nowMs = performance.now();
          if (nowMs - lastSafetyCheckRef.current > 2000) {
            lastSafetyCheckRef.current = nowMs;
            const activeVisible = ballPoolRef.current.some(b => b.active && b.mesh.visible);
            if (!activeVisible && !isStoryModeRef.current) {
              spawnOneFromPool();
            }
          }
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

  useEffect(()=>{
    const top = scores[0]?.score ?? 0;
    setBestScore(Math.max(bestScore, top));
  }, [scores]);

  const handleShare = async () => {
    if (!canvasRef.current) return;
    const blob = await captureCanvasWithHUD(canvasRef.current);
    await shareImage(blob, `I scored ${score} in Skeleton Physics!`);
  };

  const handleOpenLeaderboard = () => setUiOpenLeaderboard(true);
  const handleCloseLeaderboard = () => setUiOpenLeaderboard(false);
  // open settings currently triggered via UI elsewhere; keep close handler only
  const handleCloseSettings = () => setUiOpenSettings(false);

  // Toggle skeleton overlay on video -> also sync with settings
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
      setSettings(s => ({...s, overlay:false}));
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
        setSettings(s => ({...s, overlay:true}));
        console.log('✅ Skeleton overlay enabled');
      } catch (error) {
        console.error('❌ Failed to enable skeleton overlay:', error);
      }
    }
  };

  // Pause/resume handler toggling all registered pausable components
  const togglePause = () => {
    if (isPaused) {
      pausableComponents.current.forEach(c => c.resume?.());
      setIsPaused(false);
    } else {
      pausableComponents.current.forEach(c => c.pause?.());
      setIsPaused(true);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'v' || e.key === 'V') {
        toggleSkeletonOverlay();
      } else if (e.key === 'c' || e.key === 'C') {
        isDetectionActive ? stopTracking() : startTracking();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDetectionActive, isPaused]);

  // Toast auto-hide
  useEffect(()=>{
    if (!toast) return;
    const t = setTimeout(()=> setToast(null), 800);
    return ()=> clearTimeout(t);
  }, [toast]);

  // Story chapter advance feedback
  useEffect(()=>{
    if (!isStoryMode || !storySnapshot) return;
    const idx = storySnapshot.chapterIndex ?? 0;
    if (idx > prevStoryChapterRef.current) {
      confettiRef.current?.burst?.(undefined, 120, 100);
      setToast('Chapter advanced ✨');
      prevStoryChapterRef.current = idx;
    }
    // Update environment visuals per snapshot
    storyEnvRef.current?.updateByStory(storySnapshot);
  }, [isStoryMode, storySnapshot]);

  // Start from home screen
  useEffect(()=>{
    if (showHome) {
      // ensure paused state
      if (!isPaused) {
        pausableComponents.current.forEach(c => c.pause?.());
        setIsPaused(true);
      }
    }
  }, [showHome]);

  const onStartGame = async () => {
    setShowHome(false);
    if (!isDetectionActive) await startTracking();
    togglePause(); // resume
    startMusicRound();
  };

  // When resetting after a result, show home again
  const onPlayAgain = () => {
    setShowResult(false);
    resetGame();
    if (!isDetectionActive) startTracking();
  };

  // Show result overlay on big milestone (optional hook for future end-state)
  useEffect(()=>{
    if (score>0 && score % 100 === 0) {
      setShowResult(true);
    }
  }, [score]);

  const fabActions = [
    { id:'pause', label: isPaused? 'Resume':'Pause', onClick: ()=> togglePause(), emoji: isPaused? '▶️':'⏸️' },
    { id:'camera', label: isDetectionActive? 'Stop Camera':'Start Camera', onClick: ()=> isDetectionActive? stopTracking(): startTracking(), emoji:'📷' },
    { id:'overlay', label: showSkeletonOverlay? 'Hide 2D':'Show 2D', onClick: ()=> toggleSkeletonOverlay(), emoji:'🧩' },
    { id:'restart', label:'Restart', onClick: ()=> resetGame(), emoji:'🔁' },
    { id:'share', label:'Share', onClick: ()=> handleShare(), emoji:'📣' },
  ];

  // Render
  return (
    <div className="physics-game-demo">
      {/* Fullscreen overlays */}
      {showHome && <HomeOverlay onStart={onStartGame} onLeaderboard={handleOpenLeaderboard} onStory={()=>{
        setIsStoryMode(true);
        // init story immediately
        storyModeRef.current = new StoryMode();
        setStorySnapshot(storyModeRef.current.getSnapshot());
        prevStoryChapterRef.current = 0;
        if (rendererRef.current && !storyEnvRef.current) {
          storyEnvRef.current = new StoryEnvironment(rendererRef.current.getScene());
        }
        // hide and deactivate balls for story mode
        ballPoolRef.current.forEach((ball) => {
          ball.active = false;
          ball.mesh.visible = false;
          ball.mesh.position.copy(OFFSCREEN_POS);
          ball.rigidBody.setTranslation({ x: OFFSCREEN_POS.x, y: OFFSCREEN_POS.y, z: OFFSCREEN_POS.z }, true);
          ball.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        });
        onStartGame();
      }} />}
      {isPaused && !showHome && !showResult && <PauseOverlay onResume={togglePause} onRestart={resetGame} />}
      {showResult && <ResultOverlay score={score} best={bestScore} onShare={handleShare} onPlayAgain={onPlayAgain} />}
      {splashMsg && (
        <div style={{position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:1300}}>
          <div style={{background:'rgba(0,0,0,0.6)', color:'#ffd166', padding:'16px 24px', borderRadius:12, fontSize:22, fontWeight:700, boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
            {splashMsg}
          </div>
        </div>
      )}

      {/* Confetti overlay */}
      <ConfettiOverlay ref={confettiRef as any} />

      {/* Full-window 3D canvas */}
      <div ref={canvasContainerRef} className="canvas-container">
        <canvas ref={canvasRef}/>
      </div>

      {/* Mini camera video (top-right – CSS positions via HUD) */}
      <div className="video-overlay">
        <video ref={videoRef} width="200" height="150" muted playsInline />
      </div>

      {/* Floating radial menu instead of control box */}
  <FabRadialMenu actions={fabActions} placement="bottom-left" />

  {/* Top HUD */}
  <TopHUD score={score} multiplier={multiplier} best={bestScore} />

  {/* Story HUD */}
  {isStoryMode && storySnapshot && <StoryHUD state={storySnapshot} />}

  {/* Story expected pose guide */}
  {isStoryMode && storySnapshot && (()=>{
    const chapter = storySnapshot.chapters[storySnapshot.chapterIndex];
    const next = chapter?.objectives?.find((o:any)=> !o.done);
    const nextGesture = next?.required?.find((r:any)=> (next.progress?.[r.type]||0) < (r.holdMs||500))?.type ?? null;
    return <StoryGuideOverlay gesture={nextGesture} />;
  })()}

      {/* Toast message */}
      {toast && <div className={`toast show`}>{toast}</div>}

      {/* Panels */}
      {uiOpenLeaderboard && (
        <Leaderboard entries={scores} onClose={handleCloseLeaderboard} />
      )}
      {uiOpenSettings && (
        <SettingsPanel
          values={{ music: settings.music, sfx: settings.sfx, overlay: showSkeletonOverlay }}
          onChange={(v)=>{
            const next = {...settings, ...v};
            setSettings(next);
            if (v.overlay !== undefined) toggleSkeletonOverlay();
          }}
          onClose={handleCloseSettings}
        />
      )}
    </div>
  );
};