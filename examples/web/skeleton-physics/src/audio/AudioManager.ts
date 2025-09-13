export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pannerSupported = false;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.pannerSupported = typeof (this.ctx as any).createStereoPanner === 'function';
  }

  async resume() {
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended') {
      try { await this.ctx!.resume(); } catch {}
    }
  }

  setVolume(v: number) {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  dispose() {
    try { this.ctx?.close(); } catch {}
    this.ctx = null;
    this.master = null;
  }

  // Public API
  playCollision(pan: number = 0, intensity: number = 1) {
    // Short downward blip; intensity scales envelope gain
    const g = Math.max(0, Math.min(1, intensity));
    this.blip({ startFreq: 900, endFreq: 200, duration: 0.08, gain: 0.6 * g, pan });
  }

  playBounceFast(pan: number = 0, intensity: number = 1) {
    // Brighter, two-tone blip; intensity scales both hits
    const g = Math.max(0, Math.min(1, intensity));
    this.blip({ startFreq: 1400, endFreq: 900, duration: 0.06, gain: 0.7 * g, pan });
    setTimeout(() => this.blip({ startFreq: 1800, endFreq: 1200, duration: 0.05, gain: 0.5 * g, pan }), 10);
  }

  // Internals
  private blip(opts: { startFreq: number; endFreq: number; duration: number; gain: number; pan?: number }) {
    if (!this.ctx || !this.master) return;
    const { startFreq, endFreq, duration, gain, pan = 0 } = opts;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (this.pannerSupported) {
      const panner: StereoPannerNode = (this.ctx as any).createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(env);
      env.connect(panner);
      panner.connect(this.master);
      
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, endFreq), now + duration);
      
      osc.start(now);
      osc.stop(now + duration + 0.01);
      
      osc.onended = () => {
        try { osc.disconnect(); } catch {}
        try { env.disconnect(); } catch {}
        try { panner.disconnect(); } catch {}
      };
    } else {
      osc.connect(env);
      env.connect(this.master);
      
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, endFreq), now + duration);
      
      osc.start(now);
      osc.stop(now + duration + 0.01);
      
      osc.onended = () => {
        try { osc.disconnect(); } catch {}
        try { env.disconnect(); } catch {}
      };
    }
  }
}
