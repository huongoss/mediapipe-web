/**
 * Global focus management system for pausing/resuming rendering and processing
 * when the tab/window loses focus for performance optimization
 */
class FocusManager {
  private static instance: FocusManager | null = null;
  private pausableComponents: Set<PausableComponent> = new Set();
  private isDocumentHidden = false;

  private constructor() {
    this.setupEventListeners();
  }

  static getInstance(): FocusManager {
    if (!FocusManager.instance) {
      FocusManager.instance = new FocusManager();
    }
    return FocusManager.instance;
  }

  private setupEventListeners(): void {
    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('🔇 Tab/window lost focus - pausing all rendering and processing');
        this.pauseAll();
      } else {
        console.log('🔊 Tab/window gained focus - resuming all rendering and processing');
        this.resumeAll();
      }
    });

    // Handle window blur/focus (window switching)
    window.addEventListener('blur', () => {
      console.log('🔇 Window lost focus - pausing all rendering and processing');
      this.pauseAll();
    });

    window.addEventListener('focus', () => {
      console.log('🔊 Window gained focus - resuming all rendering and processing');
      this.resumeAll();
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      this.pauseAll();
    });
  }

  register(component: PausableComponent): void {
    this.pausableComponents.add(component);
    console.log(`📝 Registered component for focus management. Total: ${this.pausableComponents.size}`);
  }

  unregister(component: PausableComponent): void {
    this.pausableComponents.delete(component);
    console.log(`📝 Unregistered component from focus management. Total: ${this.pausableComponents.size}`);
  }

  private pauseAll(): void {
    this.isDocumentHidden = true;
    this.pausableComponents.forEach(component => {
      try {
        component.pause();
      } catch (error) {
        console.error('❌ Error pausing component:', error);
      }
    });
  }

  private resumeAll(): void {
    this.isDocumentHidden = false;
    this.pausableComponents.forEach(component => {
      try {
        component.resume();
      } catch (error) {
        console.error('❌ Error resuming component:', error);
      }
    });
  }

  isHidden(): boolean {
    return this.isDocumentHidden;
  }
}

interface PausableComponent {
  pause(): void;
  resume(): void;
}

export { FocusManager, type PausableComponent };