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
}

export type SkeletonUpdateCallback = (skeleton: SkeletonData | null) => void;

/**
 * Human skeleton provider using MediaPipe Pose Landmarker
 * Provides live skeleton data that can be consumed by any renderer
 */
export class SkeletonProvider {
  private poseLandmarker: any = null;
  private callbacks: Set<SkeletonUpdateCallback> = new Set();
  private isProcessing = false;
  private isPaused = false;
  private lastFrameTime = 0;

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
    console.log('🔧 SkeletonProvider: Starting initialization...');
    console.log('📁 Model path:', modelPath);
    
    try {
      // Ensure we're running in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('SkeletonProvider requires a browser environment');
      }

      // Check for WebGL2 support
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) {
        throw new Error('WebGL2 is not supported. Please use a modern browser.');
      }
      console.log('✅ WebGL2 support confirmed');

      // Import MediaPipe with better error handling
      let vision, PoseLandmarker;
      try {
        const mediapipeModule = await import('@mediapipe/tasks-vision');
        PoseLandmarker = mediapipeModule.PoseLandmarker;
        const FilesetResolver = mediapipeModule.FilesetResolver;
        
        console.log('✅ MediaPipe modules imported successfully');
        
        // Create vision fileset resolver with proper WASM path
        vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        console.log('✅ Vision fileset resolver created');
      } catch (importError) {
        console.error('❌ Failed to import MediaPipe modules:', importError);
        throw new Error(`MediaPipe import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
      }

      // Validate model path
      if (!modelPath || typeof modelPath !== 'string') {
        throw new Error('Invalid model path provided');
      }

      // Create PoseLandmarker with robust configuration
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU' // Try GPU first, will fallback to CPU if needed
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3, // Lower threshold for better detection
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
          outputSegmentationMasks: false
        });
        console.log('✅ PoseLandmarker created with VIDEO mode');
        console.log('⚙️ Configuration:', {
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });
      } catch (createError) {
        console.error('❌ Failed to create PoseLandmarker:', createError);
        // Try with CPU delegate as fallback
        console.log('🔄 Retrying with CPU delegate...');
        try {
          this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.3,
            minPosePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
            outputSegmentationMasks: false
          });
          console.log('✅ PoseLandmarker created with CPU delegate');
        } catch (fallbackError) {
          console.error('❌ CPU fallback also failed:', fallbackError);
          throw new Error(`PoseLandmarker creation failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
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
    
    if (!this.poseLandmarker) {
      console.error('❌ PoseLandmarker not initialized');
      return;
    }
    
    if (this.isProcessing) {
      console.warn('⚠️ Already processing video frames');
      return;
    }
    
    console.log('✅ Starting video frame processing...');
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
    if (!this.isProcessing || !this.poseLandmarker || this.isPaused) return;

    const currentTime = video.currentTime;
    if (currentTime !== this.lastFrameTime) {
      this.lastFrameTime = currentTime;

      try {
        const timestamp = performance.now();
        //console.log('🔍 Processing video frame at timestamp:', timestamp);
        
        const result = this.poseLandmarker.detectForVideo(video, timestamp);
        // console.log('📊 Detection result:', {
        //   hasLandmarks: !!result.landmarks,
        //   landmarkCount: result.landmarks?.length || 0,
        //   hasWorldLandmarks: !!result.worldLandmarks,
        //   worldLandmarkCount: result.worldLandmarks?.length || 0
        // });
        
        const skeleton = this.convertResultToSkeleton(result);
        
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
        this.callbacks.forEach(callback => {
          try {
            callback(skeleton);
          } catch (callbackError) {
            console.error('❌ Subscriber callback failed:', callbackError);
          }
        });
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

  private convertResultToSkeleton(result: any): SkeletonData | null {
    //console.log('🔄 Converting MediaPipe result to skeleton data');
    
    if (!result.landmarks || result.landmarks.length === 0) {
      console.log('❌ No landmarks in result');
      return null;
    }

    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0];

    // console.log('📍 Landmarks found:', {
    //   landmarkCount: landmarks.length,
    //   hasWorldLandmarks: !!worldLandmarks,
    //   worldLandmarkCount: worldLandmarks?.length || 0
    // });

    if (!landmarks || landmarks.length < 33) {
      console.log('❌ Insufficient landmarks:', landmarks.length);
      return null;
    }

    const joints: SkeletonJoint[] = landmarks.map((landmark: any, index: number) => {
      const worldLandmark = worldLandmarks?.[index];
      const connections = this.getConnectionsForJoint(index);

      return {
        id: index,
        name: SkeletonProvider.JOINT_NAMES[index] || `joint_${index}`,
        position: {
          x: landmark.x,
          y: landmark.y,
          z: landmark.z || 0
        },
        worldPosition: worldLandmark ? {
          x: worldLandmark.x,
          y: worldLandmark.y,
          z: worldLandmark.z
        } : {
          x: landmark.x,
          y: landmark.y,
          z: landmark.z || 0
        },
        visibility: landmark.visibility || 1.0,
        connections
      };
    });

    // Update movement bounds tracking
    this.updateMovementBounds(joints);

    // Calculate overall confidence based on visibility
    const avgVisibility = joints.reduce((sum, joint) => sum + joint.visibility, 0) / joints.length;

    // console.log('✅ Skeleton conversion complete:', {
    //   jointCount: joints.length,
    //   avgVisibility: avgVisibility.toFixed(3),
    //   visibleJoints: joints.filter(j => j.visibility > 0.5).length
    // });

    //const movementRange = this.getMovementRange();
    // if (movementRange) {
    //   console.log('📏 Movement range:', {
    //     size: movementRange.size,
    //     center: movementRange.center,
    //     samples: this.boundsSampleCount
    //   });
    // }

    return {
      joints,
      timestamp: performance.now(),
      confidence: avgVisibility,
      //movementRange: movementRange || undefined
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
    this.poseLandmarker = null;
  }
}