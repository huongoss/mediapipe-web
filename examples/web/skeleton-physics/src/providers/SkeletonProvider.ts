export interface SkeletonJoint {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  worldPosition: { x: number; y: number; z: number };
  visibility: number;
  connections: number[];
}

export interface SkeletonData {
  joints: SkeletonJoint[];
  timestamp: number;
  confidence: number;
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

  async initialize(modelPath: string): Promise<void> {
    console.log('🔧 SkeletonProvider: Starting initialization...');
    console.log('📁 Model path:', modelPath);
    
    try {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      console.log('✅ MediaPipe modules imported successfully');
      
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      console.log('✅ Vision fileset resolver created');

      // Create PoseLandmarker with VIDEO running mode for live video processing
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false
      });
      console.log('✅ PoseLandmarker created with VIDEO mode');
      console.log('⚙️ Configuration:', {
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    } catch (error) {
      console.error('❌ SkeletonProvider initialization failed:', error);
      throw error;
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
   * Process a single image for skeleton detection
   */
  async detectFromImage(image: HTMLImageElement | ImageData): Promise<SkeletonData | null> {
    if (!this.poseLandmarker) return null;

    try {
      const result = this.poseLandmarker.detect(image);
      return this.convertResultToSkeleton(result);
    } catch (error) {
      console.error('Skeleton detection failed:', error);
      return null;
    }
  }

  private async processVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.isProcessing || !this.poseLandmarker) return;

    const currentTime = video.currentTime;
    if (currentTime !== this.lastFrameTime) {
      this.lastFrameTime = currentTime;

      try {
        const timestamp = performance.now();
        console.log('🔍 Processing video frame at timestamp:', timestamp);
        
        const result = this.poseLandmarker.detectForVideo(video, timestamp);
        console.log('📊 Detection result:', {
          hasLandmarks: !!result.landmarks,
          landmarkCount: result.landmarks?.length || 0,
          hasWorldLandmarks: !!result.worldLandmarks,
          worldLandmarkCount: result.worldLandmarks?.length || 0
        });
        
        const skeleton = this.convertResultToSkeleton(result);
        
        if (skeleton) {
          console.log('💀 Skeleton created:', {
            jointCount: skeleton.joints.length,
            confidence: skeleton.confidence,
            timestamp: skeleton.timestamp
          });
          
          // Log some key joints for debugging
          const nose = skeleton.joints[0];
          const leftWrist = skeleton.joints[15];
          const rightWrist = skeleton.joints[16];
          console.log('🔍 Key joints:', {
            nose: { visibility: nose.visibility, position: nose.worldPosition },
            leftWrist: { visibility: leftWrist.visibility, position: leftWrist.worldPosition },
            rightWrist: { visibility: rightWrist.visibility, position: rightWrist.worldPosition }
          });
        } else {
          console.log('⚠️ No skeleton detected in this frame');
        }
        
        // Notify all subscribers
        console.log(`📢 Notifying ${this.callbacks.size} subscribers`);
        this.callbacks.forEach(callback => callback(skeleton));
      } catch (error) {
        console.error('❌ Video frame processing failed:', error);
        this.callbacks.forEach(callback => callback(null));
      }
    }

    // Continue processing
    if (this.isProcessing) {
      requestAnimationFrame(() => this.processVideoFrame(video));
    }
  }

  private convertResultToSkeleton(result: any): SkeletonData | null {
    console.log('🔄 Converting MediaPipe result to skeleton data');
    
    if (!result.landmarks || result.landmarks.length === 0) {
      console.log('❌ No landmarks in result');
      return null;
    }

    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0];

    console.log('📍 Landmarks found:', {
      landmarkCount: landmarks.length,
      hasWorldLandmarks: !!worldLandmarks,
      worldLandmarkCount: worldLandmarks?.length || 0
    });

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

    // Calculate overall confidence based on visibility
    const avgVisibility = joints.reduce((sum, joint) => sum + joint.visibility, 0) / joints.length;

    console.log('✅ Skeleton conversion complete:', {
      jointCount: joints.length,
      avgVisibility: avgVisibility.toFixed(3),
      visibleJoints: joints.filter(j => j.visibility > 0.5).length
    });

    return {
      joints,
      timestamp: performance.now(),
      confidence: avgVisibility
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

  dispose(): void {
    this.stopLiveDetection();
    this.callbacks.clear();
    this.poseLandmarker = null;
  }
}