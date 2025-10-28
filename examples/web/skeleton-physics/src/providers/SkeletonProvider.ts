export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface SkeletonJoint {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  worldPosition: { x: number; y: number; z: number };
  visibility: number;
  connections: number[];
}

export interface MovementRange {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

export interface SkeletonData {
  joints: SkeletonJoint[];
  timestamp: number;
  confidence: number;
  movementRange?: MovementRange;
  poseLandmarks2D?: NormalizedLandmark[];
  poseLandmarks3D?: NormalizedLandmark[];
  faceLandmarks?: NormalizedLandmark[];
  leftHandLandmarks?: NormalizedLandmark[];
  rightHandLandmarks?: NormalizedLandmark[];
  poseBlendshapes?: unknown;
  faceBlendshapes?: unknown;
}

export type SkeletonUpdateCallback = (skeleton: SkeletonData | null) => void;

/**
 * Human skeleton provider using MediaPipe Pose Landmarker
 * Provides live skeleton data that can be consumed by any renderer
 */
export class SkeletonProvider {
  private holisticLandmarker: any = null;
  private callbacks: Set<SkeletonUpdateCallback> = new Set();
  private isProcessing = false;
  private isPaused = false;
  private lastFrameTime = 0;
  private perf = null as any;
  // Downscale surface for faster detection regardless of camera resolution
  private procCanvas: HTMLCanvasElement | null = null;
  private procCtx: CanvasRenderingContext2D | null = null;
  private procW = 640; // target processing width (kept <= camera width)
  private procH = 360;

  // Pose landmark connections (based on MediaPipe pose topology)
  private static readonly POSE_CONNECTIONS = [
    [11, 12], // left_shoulder - right_shoulder
    [11, 13], // left_shoulder - left_elbow
    [13, 15], // left_elbow - left_wrist
    [12, 14], // right_shoulder - right_elbow
    [14, 16], // right_elbow - right_wrist
    [11, 23], // left_shoulder - left_hip
    [12, 24], // right_shoulder - right_hip
    [23, 24], // left_hip - right_hip
    [23, 25], // left_hip - left_knee
    [25, 27], // left_knee - left_ankle
    [24, 26], // right_hip - right_knee
    [26, 28], // right_knee - right_ankle
    [0, 1],   // nose - left_eye_inner
    [1, 2],   // left_eye_inner - left_eye
    [2, 3],   // left_eye - left_eye_outer
    [0, 4],   // nose - right_eye_inner
    [4, 5],   // right_eye_inner - right_eye
    [5, 6],   // right_eye - right_eye_outer
    [0, 7],   // nose - left_ear
    [0, 8],   // nose - right_ear
    [9, 10],  // mouth_left - mouth_right
    // Additional connections for better skeleton representation
    [15, 17], // left_wrist - left_pinky
    [15, 19], // left_wrist - left_index
    [15, 21], // left_wrist - left_thumb
    [16, 18], // right_wrist - right_pinky
    [16, 20], // right_wrist - right_index
    [16, 22], // right_wrist - right_thumb
    [27, 29], // left_ankle - left_heel
    [27, 31], // left_ankle - left_foot_index
    [28, 30], // right_ankle - right_heel
    [28, 32], // right_ankle - right_foot_index
  ];

  private static readonly JOINT_NAMES = [
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

  // Movement range tracking
  private movementBounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity }
  };
  private boundsSampleCount = 0;
  private readonly maxSamples = 300; // Track last 10 seconds at 30fps

  async initialize(modelPath: string): Promise<void> {
    console.log('🔧 SkeletonProvider: Starting holistic initialization...');
    console.log('📁 Model path:', modelPath);
    
    try {
      if (typeof window === 'undefined') {
        throw new Error('SkeletonProvider requires a browser environment');
      }

      // Lazy import Perf to avoid any circular deps during SSR
      try {
        const { Perf } = await import('../utils/Perf');
        this.perf = Perf;
      } catch {}

      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) {
        throw new Error('WebGL2 is not supported. Please use a modern browser.');
      }
      console.log('✅ WebGL2 support confirmed');

      let vision, HolisticLandmarker;
      try {
        const mediapipeModule = await import('@mediapipe/tasks-vision');
        HolisticLandmarker = mediapipeModule.HolisticLandmarker;
        const FilesetResolver = mediapipeModule.FilesetResolver;
        
        if (!HolisticLandmarker) {
          throw new Error('HolisticLandmarker not available in tasks-vision build');
        }

        console.log('✅ MediaPipe holistic modules imported successfully');
        
        vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        console.log('✅ Vision fileset resolver created');
      } catch (importError) {
        console.error('❌ Failed to import MediaPipe modules:', importError);
        throw new Error(`MediaPipe import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
      }

      if (!modelPath || typeof modelPath !== 'string') {
        throw new Error('Invalid model path provided');
      }

      const createHolistic = async (delegate: 'GPU' | 'CPU') => {
        const baseOptions = {
          modelAssetPath: modelPath,
          delegate
        };

        const options = {
          baseOptions,
          runningMode: 'VIDEO' as const,
          // Only need body pose → disable face/hands and their blendshapes for lower compute
          numFaces: 0,
          numHands: 0,
          outputFaceBlendshapes: false,
          outputPoseBlendshapes: false,
          minTrackingConfidence: 0.3
        };

        try {
          return await HolisticLandmarker.createFromOptions(vision, options);
        } catch (err) {
          // Retry with minimal options if advanced config not supported
          console.warn('⚠️ Holistic creation with extended options failed, retrying with minimal config...', err);
          return await HolisticLandmarker.createFromOptions(vision, {
            baseOptions,
            runningMode: 'VIDEO'
          });
        }
      };

      try {
        // Prefer GPU for better performance
        this.holisticLandmarker = await createHolistic('GPU');
        console.log('✅ HolisticLandmarker created with GPU delegate');
      } catch (gpuError) {
        console.warn('⚠️ Failed to create HolisticLandmarker with GPU, falling back to CPU:', gpuError);
        try {
          this.holisticLandmarker = await createHolistic('CPU');
          console.log('✅ HolisticLandmarker created with CPU delegate');
        } catch (cpuError) {
          console.error('❌ CPU fallback also failed:', cpuError);
          throw new Error(`HolisticLandmarker creation failed: ${cpuError instanceof Error ? cpuError.message : String(cpuError)}`);
        }
      }

    } catch (error) {
      console.error('❌ SkeletonProvider initialization failed:', error);
      throw new Error(`SkeletonProvider initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Subscribe to skeleton updates
   */
  subscribe(callback: SkeletonUpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Start processing video for live skeleton detection
   */
  startLiveDetection(video: HTMLVideoElement): void {
    console.log('🎬 SkeletonProvider: Starting live detection');
    console.log('📹 Video element:', {
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime
    });
    
    if (!this.holisticLandmarker) {
      console.error('❌ HolisticLandmarker not initialized');
      return;
    }
    
    if (this.isProcessing) {
      console.warn('⚠️ Already processing video frames');
      return;
    }
    
    console.log('✅ Starting video frame processing...');
    // Prepare processing canvas sized from current video resolution
    const vw = Math.max(1, video.videoWidth || 640);
    const vh = Math.max(1, video.videoHeight || 480);
    const maxW = (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const w = parseInt(params.get('procW') || '640', 10);
        return isFinite(w) && w > 0 ? Math.min(w, vw) : Math.min(640, vw);
      } catch {
        return Math.min(640, vw);
      }
    })();
    const scale = Math.min(1, maxW / vw);
    this.procW = Math.max(1, Math.round(vw * scale));
    this.procH = Math.max(1, Math.round(vh * scale));
    if (!this.procCanvas) this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = this.procW;
    this.procCanvas.height = this.procH;
    this.procCtx = this.procCanvas.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D | null;
    if (this.procCtx) {
      // Disable smoothing for speed; model doesn't need pretty pixels
      (this.procCtx as any).imageSmoothingEnabled = false;
    }
    console.log(`🖼️ Detector input downscale set to ${this.procW}x${this.procH} (camera ${vw}x${vh})`);
    this.isProcessing = true;
    this.processVideoFrame(video);
  }

  /**
   * Stop live skeleton detection
   */
  stopLiveDetection(): void {
    this.isProcessing = false;
  }

  /**
   * Reset movement range tracking
   */
  resetMovementRange(): void {
    console.log('🔄 Resetting movement range tracking');
    this.movementBounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };
    this.boundsSampleCount = 0;
  }

  /**
   * Get current movement range
   */
  getMovementRange(): MovementRange | null {
    if (this.boundsSampleCount < 10) return null; // Need some samples first
    
    const size = {
      x: this.movementBounds.max.x - this.movementBounds.min.x,
      y: this.movementBounds.max.y - this.movementBounds.min.y,
      z: this.movementBounds.max.z - this.movementBounds.min.z
    };

    const center = {
      x: (this.movementBounds.min.x + this.movementBounds.max.x) / 2,
      y: (this.movementBounds.min.y + this.movementBounds.max.y) / 2,
      z: (this.movementBounds.min.z + this.movementBounds.max.z) / 2
    };

    return {
      min: { ...this.movementBounds.min },
      max: { ...this.movementBounds.max },
      center,
      size
    };
  }

  /**
   * Pause skeleton detection processing
   */
  pause(): void {
    console.log('⏸️ Pausing skeleton detection');
    this.isPaused = true;
  }

  /**
   * Resume skeleton detection processing
   */
  resume(): void {
    console.log('▶️ Resuming skeleton detection');
    this.isPaused = false;
    // If we were processing, restart the frame processing loop
    if (this.isProcessing) {
      // Find the video element to restart processing (this is a simplified approach)
      // In a real implementation, you might want to store the video reference
      const videoElements = document.querySelectorAll('video');
      if (videoElements.length > 0) {
        this.processVideoFrame(videoElements[0] as HTMLVideoElement);
      }
    }
  }

  private async processVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.isProcessing || !this.holisticLandmarker || this.isPaused) return;

    const currentTime = video.currentTime;
    if (currentTime !== this.lastFrameTime) {
      this.lastFrameTime = currentTime;

      try {
        const frameStart = this.perf?.start?.('detector:frame');
        const timestamp = performance.now();
        //console.log('🔍 Processing video frame at timestamp:', timestamp);
        
        // Draw into a smaller canvas to cut GPU/CPU upload and resize costs
        let sourceForDetect: HTMLCanvasElement | HTMLVideoElement = video;
        if (this.procCanvas && this.procCtx) {
          const tDown = this.perf?.start?.('detector:downscale');
          try {
            this.procCtx.drawImage(video, 0, 0, this.procW, this.procH);
            sourceForDetect = this.procCanvas;
          } finally {
            this.perf?.end?.('detector:downscale', tDown);
          }
        }

        const tDetect = this.perf?.start?.('detector:detect');
        const result = this.holisticLandmarker.detectForVideo(sourceForDetect, timestamp);
        this.perf?.end?.('detector:detect', tDetect);
        // console.log('📊 Detection result:', {
        //   hasLandmarks: !!result.landmarks,
        //   landmarkCount: result.landmarks?.length || 0,
        //   hasWorldLandmarks: !!result.worldLandmarks,
        //   worldLandmarkCount: result.worldLandmarks?.length || 0
        // });
        
        const tConvert = this.perf?.start?.('detector:convert');
        const skeleton = this.convertResultToSkeleton(result);
        this.perf?.end?.('detector:convert', tConvert);
        
        // if (skeleton) {
        //   console.log('💀 Skeleton created:', {
        //     jointCount: skeleton.joints.length,
        //     confidence: skeleton.confidence,
        //     timestamp: skeleton.timestamp
        //   });
          
          // Log some key joints for debugging (less verbose)
          // if (Math.random() < 0.1) { // Only log 10% of the time
          //   const nose = skeleton.joints[0];
          //   const leftWrist = skeleton.joints[15];
          //   const rightWrist = skeleton.joints[16];
          //   console.log('🔍 Key joints:', {
          //     nose: { visibility: nose.visibility, position: nose.worldPosition },
          //     leftWrist: { visibility: leftWrist.visibility, position: leftWrist.worldPosition },
          //     rightWrist: { visibility: rightWrist.visibility, position: rightWrist.worldPosition }
          //   });
          // }
        // } else {
        //   console.log('⚠️ No skeleton detected in this frame');
        // }
        
        // Notify all subscribers
        if (Math.random() < 0.1) { // Reduce log spam
          //console.log(`📢 Notifying ${this.callbacks.size} subscribers`);
        }
        const tNotify = this.perf?.start?.('detector:notify');
        this.callbacks.forEach(callback => {
          try {
            callback(skeleton);
          } catch (callbackError) {
            console.error('❌ Subscriber callback failed:', callbackError);
          }
        });
        this.perf?.end?.('detector:notify', tNotify);
        this.perf?.end?.('detector:frame', frameStart);
        this.perf?.frameTick?.('detector');
      } catch (error) {
        console.error('❌ Video frame processing failed:', error);
        this.callbacks.forEach(callback => {
          try {
            callback(null);
          } catch (callbackError) {
            console.error('❌ Error callback failed:', callbackError);
          }
        });
      }
    }

    // Continue processing with error handling
    if (this.isProcessing && !this.isPaused) {
      try {
        requestAnimationFrame(() => this.processVideoFrame(video));
      } catch (error) {
        console.error('❌ Failed to schedule next frame:', error);
        this.isProcessing = false;
      }
    }
  }

  private updateMovementBounds(joints: SkeletonJoint[]): void {
    // Only track key body joints for movement bounds (avoid noise from fingers/face)
    const keyJointIds = [
      11, 12, // shoulders
      13, 14, // elbows  
      15, 16, // wrists
      23, 24, // hips
      25, 26, // knees
      27, 28  // ankles
    ];

    joints.forEach(joint => {
      if (keyJointIds.includes(joint.id) && joint.visibility > 0.7) {
        const pos = joint.worldPosition;
        
        // Update bounds
        this.movementBounds.min.x = Math.min(this.movementBounds.min.x, pos.x);
        this.movementBounds.min.y = Math.min(this.movementBounds.min.y, pos.y);
        this.movementBounds.min.z = Math.min(this.movementBounds.min.z, pos.z);
        
        this.movementBounds.max.x = Math.max(this.movementBounds.max.x, pos.x);
        this.movementBounds.max.y = Math.max(this.movementBounds.max.y, pos.y);
        this.movementBounds.max.z = Math.max(this.movementBounds.max.z, pos.z);
      }
    });

    this.boundsSampleCount++;
    
    // Prevent bounds from growing indefinitely - reset after max samples
    if (this.boundsSampleCount > this.maxSamples) {
      console.log('📊 Movement range tracking reset (max samples reached)');
      this.resetMovementRange();
    }
  }

  private normalizeLandmarks(landmarks?: any[]): NormalizedLandmark[] | undefined {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) {
      return undefined;
    }

    return landmarks.map((landmark: any) => ({
      x: landmark.x ?? 0,
      y: landmark.y ?? 0,
      z: landmark.z ?? 0,
      visibility: landmark.visibility ?? landmark.presence ?? landmark.score ?? 1,
      presence: landmark.presence ?? landmark.visibility ?? landmark.score ?? 1
    }));
  }

  private convertResultToSkeleton(result: any): SkeletonData | null {
    if (!result) {
      console.log('❌ No holistic result available');
      return null;
    }

    const poseLandmarks2D = this.normalizeLandmarks(result.poseLandmarks?.[0]);
    if (!poseLandmarks2D || poseLandmarks2D.length < 33) {
      console.log('❌ Insufficient pose landmarks detected');
      return null;
    }

    const poseLandmarks3D = this.normalizeLandmarks(result.poseWorldLandmarks?.[0]);
    const faceLandmarks = this.normalizeLandmarks(result.faceLandmarks?.[0]);
    const leftHandLandmarks = this.normalizeLandmarks(result.leftHandLandmarks?.[0]);
    const rightHandLandmarks = this.normalizeLandmarks(result.rightHandLandmarks?.[0]);

    const joints: SkeletonJoint[] = poseLandmarks2D.map((landmark: NormalizedLandmark, index: number) => {
      const worldLandmark = poseLandmarks3D?.[index];
      const connections = this.getConnectionsForJoint(index);

      return {
        id: index,
        name: SkeletonProvider.JOINT_NAMES[index] || `joint_${index}`,
        position: {
          x: landmark.x ?? 0,
          y: landmark.y ?? 0,
          z: landmark.z ?? 0
        },
        worldPosition: worldLandmark ? {
          x: worldLandmark.x,
          y: worldLandmark.y,
          z: worldLandmark.z ?? 0
        } : {
          x: landmark.x ?? 0,
          y: landmark.y ?? 0,
          z: landmark.z ?? 0
        },
        visibility: landmark.visibility ?? 1.0,
        connections
      };
    });

    // Update movement bounds tracking
    this.updateMovementBounds(joints);

    // Calculate overall confidence based on visibility
    const avgVisibility = joints.reduce((sum, joint) => sum + joint.visibility, 0) / joints.length;

    const movementRange = this.getMovementRange();

    return {
      joints,
      timestamp: performance.now(),
      confidence: avgVisibility,
      movementRange: movementRange || undefined,
      poseLandmarks2D,
      poseLandmarks3D,
      faceLandmarks,
      leftHandLandmarks,
      rightHandLandmarks,
      poseBlendshapes: Array.isArray(result.poseBlendshapes) ? result.poseBlendshapes[0] : undefined,
      faceBlendshapes: Array.isArray(result.faceBlendshapes) ? result.faceBlendshapes[0] : undefined
    };
  }

  private getConnectionsForJoint(jointIndex: number): number[] {
    return SkeletonProvider.POSE_CONNECTIONS
      .filter(([a, b]) => a === jointIndex || b === jointIndex)
      .map(([a, b]) => a === jointIndex ? b : a);
  }

  /**
   * Get static pose connections for rendering
   */
  static getPoseConnections(): number[][] {
    return [...SkeletonProvider.POSE_CONNECTIONS];
  }

  /**
   * Get joint names mapping
   */
  static getJointNames(): string[] {
    return [...SkeletonProvider.JOINT_NAMES];
  }

  /**
   * Enable debug overlay mode that shows skeleton on original camera image
   */
  enableDebugOverlay(videoElement: HTMLVideoElement, options: any = {}): any {
    console.log('🐛 Enabling debug skeleton overlay on video');
    
    // Import overlay dynamically to avoid circular dependencies
    return import('../renderers/SkeletonVideoOverlay').then(({ createVideoSkeletonOverlay }) => {
      return createVideoSkeletonOverlay(videoElement, this, {
        jointSize: 6,
        boneThickness: 2,
        jointColor: '#FF0040',
        boneColor: '#00FF40',
        showJointLabels: false, // Keep labels off by default for cleaner view
        showConfidence: true,
        ...options
      });
    });
  }

  dispose(): void {
    this.stopLiveDetection();
    this.callbacks.clear();
    this.holisticLandmarker = null;
  }
}
