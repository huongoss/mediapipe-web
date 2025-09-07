import { FPSCounter } from './fps';
import { isVideoReady } from './canvas';
import { WebGLRenderer } from './webgl';

/**
 * Video Processor for handling MediaPipe model processing
 */
export class VideoProcessor {
  private segmenter: any = null;
  private renderer: WebGLRenderer | null = null;
  private inputFPS: FPSCounter;
  private outputFPS: FPSCounter;
  private frameCallbackId: number | null = null;
  private lastFrameTime = 0;

  constructor() {
    this.inputFPS = new FPSCounter();
    this.outputFPS = new FPSCounter();
  }

  setSegmenter(segmenter: any): void {
    this.segmenter = segmenter;
  }

  setRenderer(renderer: WebGLRenderer): void {
    this.renderer = renderer;
  }

  startProcessing(video: HTMLVideoElement): void {
    if (!this.segmenter || !this.renderer) return;
    
    const processFrame = async (_now: number, metadata: any) => {
      if (!this.segmenter || !this.renderer) return;

      //const frameStart = performance.now();

      // Check if video is ready and not duplicate frame
      if (!isVideoReady(video, metadata.mediaTime) || this.lastFrameTime >= metadata.mediaTime) {
        this.requestNextFrame(video, processFrame);
        return;
      }
      
      // Count input frames
      this.inputFPS.update();

      // Run segmentation
      const startTime = performance.now();
      const result = await this.segmenter.segmentForVideo(video, metadata.mediaTime);
      const segmentTime = performance.now() - startTime;
      this.lastFrameTime = metadata.mediaTime;
      
      // Log performance if segmentation takes too long
      if (segmentTime > 50) {
        console.log(`Segmentation took ${segmentTime.toFixed(1)}ms`);
      }

      // Process with WebGL if we have a mask
      if (result && result.categoryMask) {
        const mask = result.categoryMask;
        const maskTexture = mask.getAsWebGLTexture();
        
        // Render using WebGL
        const renderStart = performance.now();
        this.renderer.render(video, maskTexture);
        const renderTime = performance.now() - renderStart;
        
        // Log render time if it's slow
        if (renderTime > 16) {
          console.log(`Render took ${renderTime.toFixed(1)}ms`);
        }
        
        // Clean up
        mask.close();
        result.close();
      } else {
        // Even if segmentation fails, we should still render something
        console.log('Segmentation failed, no mask available');
      }
      
      // Count output frames (always update, regardless of segmentation success)
      this.outputFPS.update();

      //const totalFrameTime = performance.now() - frameStart;
      // if (totalFrameTime > 33) { // More than 30fps threshold
      //   console.log(`Total frame time: ${totalFrameTime.toFixed(1)}ms (${(1000/totalFrameTime).toFixed(1)}fps)`);
      // }

      // Request next frame
      this.requestNextFrame(video, processFrame);
    };

    this.frameCallbackId = video.requestVideoFrameCallback(processFrame);
  }

  stopProcessing(): void {
    if (this.frameCallbackId) {
      // Note: cancelVideoFrameCallback is not available in all browsers
      // The callback will naturally stop when video is paused/stopped
      this.frameCallbackId = null;
    }
  }

  getInputFPS(): number {
    return this.inputFPS.getFPS();
  }

  getOutputFPS(): number {
    return this.outputFPS.getFPS();
  }

  private requestNextFrame(video: HTMLVideoElement, callback: (now: number, metadata: any) => void): void {
    this.frameCallbackId = video.requestVideoFrameCallback(callback);
  }
}

/**
 * Generic video processor for any MediaPipe model
 */
export class GenericVideoProcessor {
  private model: any = null;
  private inputFPS: FPSCounter;
  private outputFPS: FPSCounter;
  private frameCallbackId: number | null = null;
  private lastFrameTime = 0;
  private processCallback: ((video: HTMLVideoElement, result: any) => void) | null = null;

  constructor() {
    this.inputFPS = new FPSCounter();
    this.outputFPS = new FPSCounter();
  }

  setModel(model: any): void {
    this.model = model;
  }

  setProcessCallback(callback: (video: HTMLVideoElement, result: any) => void): void {
    this.processCallback = callback;
  }

  startProcessing(video: HTMLVideoElement, processMethod: string = 'processForVideo'): void {
    if (!this.model) return;
    
    const processFrame = async (_now: number, metadata: any) => {
      if (!this.model) return;

      //const frameStart = performance.now();

      // Check if video is ready and not duplicate frame
      if (!isVideoReady(video, metadata.mediaTime) || this.lastFrameTime >= metadata.mediaTime) {
        this.requestNextFrame(video, processFrame);
        return;
      }
      
      // Count input frames
      this.inputFPS.update();

      try {
        // Run model processing
        const startTime = performance.now();
        const result = await this.model[processMethod](video, metadata.mediaTime);
        const processTime = performance.now() - startTime;
        this.lastFrameTime = metadata.mediaTime;
        
        // Log performance if processing takes too long
        if (processTime > 50) {
          console.log(`Processing took ${processTime.toFixed(1)}ms`);
        }

        // Process result with callback
        if (this.processCallback && result) {
          this.processCallback(video, result);
        }
        
      } catch (error) {
        console.error('Model processing failed:', error);
      }
      
      // Count output frames
      this.outputFPS.update();

      //const totalFrameTime = performance.now() - frameStart;
      // if (totalFrameTime > 33) { // More than 30fps threshold
      //   console.log(`Total frame time: ${totalFrameTime.toFixed(1)}ms (${(1000/totalFrameTime).toFixed(1)}fps)`);
      // }

      // Request next frame
      this.requestNextFrame(video, processFrame);
    };

    this.frameCallbackId = video.requestVideoFrameCallback(processFrame);
  }

  stopProcessing(): void {
    if (this.frameCallbackId) {
      this.frameCallbackId = null;
    }
  }

  getInputFPS(): number {
    return this.inputFPS.getFPS();
  }

  getOutputFPS(): number {
    return this.outputFPS.getFPS();
  }

  private requestNextFrame(video: HTMLVideoElement, callback: (now: number, metadata: any) => void): void {
    this.frameCallbackId = video.requestVideoFrameCallback(callback);
  }
} 