// Web Audio API Procedural Sound Engine for Gladiator Combat & Atmosphere
type AmbientType = 'center' | 'north' | 'east' | 'west' | 'south' | null;

/**
 * CF-3 — the crowd noise bed's fixed shape. Everything is generated at
 * runtime: a 2 s looping brown-noise buffer through a 500 Hz lowpass, so the
 * bed costs no asset, no download and no dependency.
 *
 * `CROWD_BED_GAINS` is indexed by the hype tier (LOW 0 / HIGH 1 / MAX 2) and is
 * the level the bed ramps to over `CROWD_BED_RAMP_SECONDS`; the swell multiplies
 * the whole bed by `CROWD_SWELL_MULTIPLIER` and returns to the level by
 * `CROWD_SWELL_HOLD_SECONDS`.
 */
const CROWD_BED_BUFFER_SECONDS = 2;
const CROWD_BED_FILTER_HZ = 500;
const CROWD_BED_RAMP_SECONDS = 0.4;
export const CROWD_BED_GAINS = [0.015, 0.04, 0.075] as const;
export type CrowdBedLevel = 0 | 1 | 2;
const CROWD_SWELL_MULTIPLIER = 1.8;
const CROWD_SWELL_RISE_SECONDS = 0.12;
const CROWD_SWELL_HOLD_SECONDS = 0.35;

export class SoundFXEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  private ambientNodes: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private currentAmbient: AmbientType = null;

  /**
   * CF-3 — the crowd bed's live graph. `levelGain` carries the hype tier's
   * gain; `swellGain` carries the swell MULTIPLIER and sits after it, so a
   * 0.4 s tier ramp and a 350 ms swell never cancel each other's automation.
   */
  private crowdBed: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    levelGain: GainNode;
    swellGain: GainNode;
  } | null = null;
  private crowdLevel: CrowdBedLevel = 0;
  /** Whether a duel has asked for the bed, so unmuting restores it. */
  private crowdBedWanted = false;

  public getAudioContext(): AudioContext {
    this.init();
    return this.ctx!;
  }

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAmbient();
      // CF-3 — muting must silence the crowd too: the bed is torn down (its
      // fade runs, then the source stops) but stays "wanted", so unmuting
      // brings it back for the rest of the duel.
      this.teardownCrowdBed();
    } else {
      if (this.currentAmbient) this.playAmbientLoop(this.currentAmbient);
      if (this.crowdBedWanted) this.startCrowdBed();
    }
    return this.isMuted;
  }

  /**
   * C-8.70B §SET-1 — the persisted "All sound" setting, applied on boot and on
   * every change: the same effect as `toggleMute`, without the flip.  An
   * unchanged value is a no-op, so it never restarts the ambient loop.
   */
  public setMuted(muted: boolean): void {
    const next = Boolean(muted);
    if (next === this.isMuted) return;
    this.toggleMute();
  }

  public playAmbientLoop(type: AmbientType) {
    if (this.isMuted || !type || this.currentAmbient === type) return;
    this.stopAmbient();
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Procedural ambient noise based on district
    try { osc.type = 'sawtooth'; } catch {} 
    
    // Low-pass filter effect
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'north' ? 100 : 300, now);

    osc.frequency.setValueAtTime(type === 'center' ? 50 : 20, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 2); // Fade in

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    this.ambientNodes = { oscillator: osc, gain };
    this.currentAmbient = type;
  }

  public stopAmbient() {
    if (!this.ambientNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.ambientNodes.gain.gain.linearRampToValueAtTime(0, now + 1); // Fade out
    this.ambientNodes.oscillator.stop(now + 1);
    this.ambientNodes = null;
    this.currentAmbient = null;
  }

  // ── CF-3 — the crowd noise bed ────────────────────────────────────────────
  // One looping 2 s brown-noise buffer through a 500 Hz lowpass. The tier's
  // gain and the swell's multiplier are separate nodes in the same chain, so a
  // crossing can ramp the level while its own swell plays over the top.

  private createCrowdNoiseBuffer(bufferSeconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const { ctx } = this;
    const length = Math.max(1, Math.floor(ctx.sampleRate * bufferSeconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown noise: an integrated white signal, renormalised so it stays inside
    // ±1. It is the low, rounded rumble a crowd produces — white noise through
    // the lowpass below reads as wind, this reads as a filled arena.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /**
   * Start the bed at the level currently held. Idempotent: a second call while
   * it runs does nothing, which is what makes React's double-mounted effects
   * safe. Muted, or without an AudioContext, it does nothing at all.
   */
  public startCrowdBed(): void {
    this.crowdBedWanted = true;
    if (this.isMuted || this.crowdBed) return;
    this.init();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const buffer = this.createCrowdNoiseBuffer(CROWD_BED_BUFFER_SECONDS);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(CROWD_BED_FILTER_HZ, ctx.currentTime);

    const levelGain = ctx.createGain();
    const swellGain = ctx.createGain();
    const now = ctx.currentTime;
    levelGain.gain.setValueAtTime(0, now);
    levelGain.gain.linearRampToValueAtTime(CROWD_BED_GAINS[this.crowdLevel], now + CROWD_BED_RAMP_SECONDS);
    swellGain.gain.setValueAtTime(1, now);

    source.connect(filter);
    filter.connect(levelGain);
    levelGain.connect(swellGain);
    swellGain.connect(ctx.destination);

    source.start(now);
    this.crowdBed = { source, filter, levelGain, swellGain };
  }

  /** Ramp the bed to a hype tier's gain (0.015 / 0.04 / 0.075) over 0.4 s. */
  public setCrowdLevel(level: CrowdBedLevel): void {
    // Saturates to the nearest tier, so a stray 7 means MAX and a -3 means LOW
    // rather than both collapsing to LOW.
    this.crowdLevel = level >= 2 ? 2 : level >= 1 ? 1 : 0;
    if (this.isMuted || !this.crowdBed || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.crowdBed.levelGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(CROWD_BED_GAINS[this.crowdLevel], now + CROWD_BED_RAMP_SECONDS);
  }

  /**
   * A short surge: 1.8× the bed for 350 ms, then straight back to its level.
   * Skipped when the bed is not running (or muted) — there is nothing to swell.
   */
  public playCrowdSwell(): void {
    if (this.isMuted || !this.crowdBed || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.crowdBed.swellGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(1, now);
    gain.linearRampToValueAtTime(CROWD_SWELL_MULTIPLIER, now + CROWD_SWELL_RISE_SECONDS);
    gain.linearRampToValueAtTime(1, now + CROWD_SWELL_HOLD_SECONDS);
  }

  /** Fade the bed out and stop its source. Safe to call when it is not running. */
  public stopCrowdBed(): void {
    this.crowdBedWanted = false;
    this.teardownCrowdBed();
  }

  /**
   * The teardown without forgetting that the bed is wanted — what muting needs,
   * so unmuting can restore it. Private: `stopCrowdBed` is the public stop.
   */
  private teardownCrowdBed(): void {
    if (!this.crowdBed || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { source, levelGain } = this.crowdBed;
    levelGain.gain.cancelScheduledValues(now);
    levelGain.gain.setValueAtTime(levelGain.gain.value, now);
    levelGain.gain.linearRampToValueAtTime(0, now + CROWD_BED_RAMP_SECONDS);
    try {
      source.stop(now + CROWD_BED_RAMP_SECONDS);
    } catch {
      // A source that was never started (or was already stopped) throws here;
      // there is nothing left to silence in that case.
    }
    this.crowdBed = null;
  }

  // Sword / Weapon Slash
  public playSlash() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.14);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Heavy Attack Impact
  public playHeavyImpact() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.28);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Shield Block / Metal Clang
  public playBlock() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Dodge Whoosh
  public playDodge() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // Coin Clink
  public playCoin() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.setValueAtTime(1800, now + 0.06);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Victory Trumpet Fanfare
  public playVictory() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    });
  }

  // UI Button Click
  public playClick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }
}

export const sounds = new SoundFXEngine();
