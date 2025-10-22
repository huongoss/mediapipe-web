
import { SkeletonData, SkeletonJoint, SkeletonProvider } from '../providers/SkeletonProvider';

export interface SkeletonOverlayOptions {
  jointSize?: number;
  boneThickness?: number;
  jointColor?: string;
  boneColor?: string;
  showJointLabels?: boolean;
  showConfidence?: boolean;
  backgroundColor?: string;
  width?: number;
  height?: number;
}

/**
 * Canvas-based skeleton overlay renderer for development and debugging
 * Draws skeleton directly on top of camera video for pose validation
 */
export class SkeletonVideoOverlay {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private options: Required<SkeletonOverlayOptions>;
  private lastSkeletonData: SkeletonData | null = null;
  private isMouseHovered: boolean = false;
  private isPaused: boolean = false;

  constructor(options: SkeletonOverlayOptions = {}) {
    this.options = {
      jointSize: 8,
      boneThickness: 3,
      jointColor: '#FF0000',
      boneColor: '#00FF00',
      showJointLabels: true,
      showConfidence: true,
      backgroundColor: 'transparent',
      width: 640,
      height: 480,
      ...options
    };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';


    this.canvas.parentElement?.addEventListener('mouseenter', () => {
        this.isMouseHovered = true;
      })
    this.canvas.parentElement?.addEventListener('mouseleave', () => {
        this.isMouseHovered = false;
      })

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.context = context;

    console.log('✅ SkeletonVideoOverlay initialized with options:', this.options);
  }

  /**
   * Get the canvas element to append to DOM
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Set canvas size to match video dimensions
   */
  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.options.width = width;
    this.options.height = height;
    console.log(`🔧 Canvas resized to: ${width}x${height}`);
  }

  /**
   * Update skeleton overlay with new data
   */
  updateSkeleton(skeletonData: SkeletonData | null): void {
    this.lastSkeletonData = skeletonData;
    this.render();
  }

  /**
   * Render skeleton overlay on canvas
   */
  private render(): void {
    if (this.isPaused) return;

    // Clear canvas
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.options.backgroundColor !== 'transparent') {
      this.context.fillStyle = this.options.backgroundColor;
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (!this.lastSkeletonData) {
      this.drawNoDataMessage();
      return;
    }

    const { joints } = this.lastSkeletonData;
    
    // Draw bones first (so joints appear on top)
    this.drawBones(joints);
    
    // Draw joints
    this.drawJoints(joints);
    
    // Draw labels if enabled
    if (this.options.showJointLabels && this.isMouseHovered) {
      this.drawJointLabels(joints);
    }

    // Draw confidence info if enabled
    if (this.options.showConfidence && this.isMouseHovered) {
      this.drawConfidenceInfo();
    }

    if (this.options.showConfidence && this.isMouseHovered) {
      // Draw pose connections info
      this.drawPoseInfo();
    }
  }

  /**
   * Draw skeleton joints as circles
   */
  private drawJoints(joints: SkeletonJoint[]): void {
    joints.forEach(joint => {
      if (joint.visibility < 0.3) return; // Skip very low confidence joints

      // Convert normalized coordinates to canvas coordinates
      const x = joint.position.x * this.canvas.width;
      const y = joint.position.y * this.canvas.height;

      // Calculate opacity based on visibility
      const opacity = Math.max(0.3, joint.visibility);
      
      // Draw joint circle
      this.context.globalAlpha = opacity;
      this.context.fillStyle = this.options.jointColor;
      this.context.beginPath();
      this.context.arc(x, y, this.options.jointSize, 0, 2 * Math.PI);
      this.context.fill();

      // Draw joint outline for better visibility
      this.context.strokeStyle = '#FFFFFF';
      this.context.lineWidth = 2;
      this.context.stroke();

      this.context.globalAlpha = 1.0;
    });
  }

  /**
   * Draw skeleton bones as lines
   */
  private drawBones(joints: SkeletonJoint[]): void {
    this.context.strokeStyle = this.options.boneColor;
    this.context.lineWidth = this.options.boneThickness;
    this.context.lineCap = 'round';

    joints.forEach(joint => {
      if (joint.visibility < 0.3) return;

      joint.connections.forEach(targetId => {
        const targetJoint = joints[targetId];
        if (!targetJoint || targetJoint.visibility < 0.3) return;

        // Convert normalized coordinates to canvas coordinates
        const x1 = joint.position.x * this.canvas.width;
        const y1 = joint.position.y * this.canvas.height;
        const x2 = targetJoint.position.x * this.canvas.width;
        const y2 = targetJoint.position.y * this.canvas.height;

        // Calculate opacity based on average visibility
        const avgVisibility = (joint.visibility + targetJoint.visibility) / 2;
        this.context.globalAlpha = Math.max(0.3, avgVisibility);

        // Draw bone line
        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.stroke();
      });
    });

    this.context.globalAlpha = 1.0;
  }

  /**
   * Draw joint labels
   */
  private drawJointLabels(joints: SkeletonJoint[]): void {
    this.context.font = '12px Arial';
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';

    joints.forEach(joint => {
      if (joint.visibility < 0.5) return; // Only label high-confidence joints

      const x = joint.position.x * this.canvas.width;
      const y = joint.position.y * this.canvas.height;

      // Draw text background
      const text = joint.name;
      const metrics = this.context.measureText(text);
      const padding = 4;
      
      this.context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.context.fillRect(
        x - metrics.width / 2 - padding,
        y - 8 - padding,
        metrics.width + padding * 2,
        16 + padding * 2
      );

      // Draw text
      this.context.fillStyle = '#FFFFFF';
      this.context.fillText(text, x, y);
    });
  }

  /**
   * Draw confidence information
   */
  private drawConfidenceInfo(): void {
    if (!this.lastSkeletonData) return;

    const { confidence, joints } = this.lastSkeletonData;
    const visibleJoints = joints.filter(j => j.visibility > 0.5).length;

    // Draw info panel
    const panelX = 10;
    const panelY = 10;
    const panelWidth = 200;
    const panelHeight = 80;

    this.context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.context.fillRect(panelX, panelY, panelWidth, panelHeight);

    this.context.fillStyle = '#FFFFFF';
    this.context.font = '7px Arial'; // Reduced from 14px to 7px
    this.context.textAlign = 'left';
    this.context.textBaseline = 'top';

    this.context.fillText(`Overall Confidence: ${(confidence * 100).toFixed(1)}%`, panelX + 10, panelY + 10);
    this.context.fillText(`Visible Joints: ${visibleJoints}/${joints.length}`, panelX + 10, panelY + 30);
    this.context.fillText(`Timestamp: ${this.lastSkeletonData.timestamp.toFixed(0)}`, panelX + 10, panelY + 50);
  }

  /**
   * Draw pose information
   */
  private drawPoseInfo(): void {
    if (!this.lastSkeletonData) return;

    const { joints } = this.lastSkeletonData;

    // Draw key joint visibility in the corner
    const infoX = this.canvas.width - 150;
    const infoY = 10;
    const infoWidth = 140;
    const infoHeight = 120;

    this.context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.context.fillRect(infoX, infoY, infoWidth, infoHeight);

    this.context.fillStyle = '#FFFFFF';
    this.context.font = '6px Arial'; // Reduced from 12px to 6px
    this.context.textAlign = 'left';
    this.context.textBaseline = 'top';

    const keyJoints = [
      { id: 0, name: 'Nose' },
      { id: 11, name: 'L Shoulder' },
      { id: 12, name: 'R Shoulder' },
      { id: 15, name: 'L Wrist' },
      { id: 16, name: 'R Wrist' },
      { id: 23, name: 'L Hip' },
      { id: 24, name: 'R Hip' }
    ];

    this.context.fillText('Key Joints:', infoX + 5, infoY + 5);

    keyJoints.forEach((keyJoint, index) => {
      const joint = joints[keyJoint.id];
      if (joint) {
        const confidence = (joint.visibility * 100).toFixed(0);
        const color = joint.visibility > 0.7 ? '#00FF00' : joint.visibility > 0.4 ? '#FFAA00' : '#FF0000';
        
        this.context.fillStyle = color;
        this.context.fillText(`${keyJoint.name}: ${confidence}%`, infoX + 5, infoY + 25 + index * 14);
      }
    });

    this.context.fillStyle = '#FFFFFF';
  }

  /**
   * Draw message when no skeleton data is available
   */
  private drawNoDataMessage(): void {
    this.context.fillStyle = 'rgba(255, 0, 0, 0.8)';
    this.context.fillRect(10, 10, 200, 50);

    this.context.fillStyle = '#FFFFFF';
    this.context.font = '16px Arial';
    this.context.textAlign = 'left';
    this.context.textBaseline = 'top';
    this.context.fillText('No Skeleton Data', 20, 25);
  }

  /**
   * Update rendering options
   */
  updateOptions(newOptions: Partial<SkeletonOverlayOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.render(); // Re-render with new options
  }

  /**
   * Take a screenshot of the current overlay
   */
  screenshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Clear the overlay
   */
  clear(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clear();
    this.lastSkeletonData = null;
  }

  /**
   * Pause rendering updates
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume rendering updates
   */
  resume(): void {
    this.isPaused = false;
    this.render(); // Re-render when resuming
  }
}

/**
 * Helper function to create and manage skeleton overlay on video element
 */
export function createVideoSkeletonOverlay(
  videoElement: HTMLVideoElement,
  skeletonProvider: SkeletonProvider,
  options: SkeletonOverlayOptions = {}
): SkeletonVideoOverlay {
  console.log('🎬 Creating video skeleton overlay');

  // Create overlay
  const overlay = new SkeletonVideoOverlay(options);
  
  // Position overlay on top of video
  const canvas = overlay.getCanvas();
  const videoContainer = videoElement.parentElement;
  
  if (videoContainer) {
    // Ensure container has relative positioning
    if (getComputedStyle(videoContainer).position === 'static') {
      videoContainer.style.position = 'relative';
    }
    
    // Add canvas to video container
    videoContainer.appendChild(canvas);
    
    // Update canvas size when video loads
    const updateSize = () => {
      if (videoElement.videoWidth && videoElement.videoHeight) {
        const rect = videoElement.getBoundingClientRect();
        overlay.setSize(rect.width, rect.height);
        
        // Update canvas position to match video
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        console.log(`📐 Overlay sized to match video: ${rect.width}x${rect.height}`);
      }
    };
    
    // Listen for video size changes
    videoElement.addEventListener('loadedmetadata', updateSize);
    videoElement.addEventListener('resize', updateSize);
    window.addEventListener('resize', updateSize);

    
    // Initial size update
    updateSize();
    
    // Subscribe to skeleton updates
    const unsubscribe = skeletonProvider.subscribe((skeletonData) => {
      overlay.updateSkeleton(skeletonData);
    });
    
    console.log('✅ Video skeleton overlay created and connected');
    
    const cleanup = () => {
      videoElement.removeEventListener('loadedmetadata', updateSize);
      videoElement.removeEventListener('resize', updateSize);
      window.removeEventListener('resize', updateSize);
      unsubscribe();
    };

    const originalDispose = overlay.dispose.bind(overlay);
    overlay.dispose = () => {
      cleanup();
      originalDispose();
    };

    return overlay;
  } else {
    throw new Error('Video element must have a parent container');
  }
}
