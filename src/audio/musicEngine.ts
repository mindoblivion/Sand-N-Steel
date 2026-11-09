import { MUSIC_TRACKS } from '../data/musicTracks';

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private musicGainNode: GainNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  /**
   * The element whose play() promise has not settled yet. Android can background
   * the WebView during that await, before currentAudioElement is assigned.
   */
  private pendingAudioElement: HTMLAudioElement | null = null;
  private currentSource: MediaElementAudioSourceNode | null = null;
  private currentTrackId: string | null = null;
  private isMuted: boolean = false;
  /**
   * C-8.70B §SET-1 — the designed default level: 0.8, the settings record's own
   * `musicVolume` default.  It is what plays when no settings record exists yet.
   */
  private volume: number = 0.8;

  public init(audioContext: AudioContext) {
    this.ctx = audioContext;
    this.musicGainNode = this.ctx.createGain();
    this.musicGainNode.gain.value = this.isMuted ? 0 : this.volume;
    this.musicGainNode.connect(this.ctx.destination);
  }

  public async play(trackId: string, options: { fadeMs?: number } = { fadeMs: 2000 }) {
    if (!this.ctx || !this.musicGainNode) return;
    if (this.currentTrackId === trackId) return;

    const track = MUSIC_TRACKS[trackId];
    if (!track) {
      console.warn(`MusicEngine: Track ${trackId} not found`);
      return;
    }

    // Stop current track with fade
    await this.stop(options.fadeMs);

    this.currentTrackId = trackId;

    // Load track
    const audio = new Audio(track.src);
    audio.loop = track.loop;
    // Register before awaiting play(): visibilitychange may fire while the
    // browser is still resolving the promise, and pause() must be able to reach it.
    this.pendingAudioElement = audio;

    try {
        await audio.play();
        if (this.pendingAudioElement !== audio) {
          // A newer playback attempt superseded this one while it was pending.
          audio.pause();
          return;
        }
        this.pendingAudioElement = null;
        this.currentAudioElement = audio;
        this.currentSource = this.ctx.createMediaElementSource(audio);
        this.currentSource.connect(this.musicGainNode);

        this.fadeIn(options.fadeMs || 2000);
    } catch (e) {
        if (this.pendingAudioElement === audio) this.pendingAudioElement = null;
        // Browsers commonly reject autoplay before the first user gesture. Keep that
        // expected state distinct from a missing or unsupported audio asset.
        const errorName = e instanceof DOMException ? e.name : '';
        if (errorName === 'NotAllowedError') {
          console.info(`MusicEngine: Waiting for user gesture before playing ${trackId}`);
        } else {
          console.warn(`MusicEngine: Skipping track ${trackId} (file not found or unsupported)`);
        }
        if (this.currentTrackId === trackId) this.currentTrackId = null;
    }
  }

  public pause() {
    if (this.currentAudioElement) this.currentAudioElement.pause();
    // Also stop an in-flight play() attempt: currentAudioElement is assigned only
    // after that promise resolves, which is too late for Android backgrounding.
    if (this.pendingAudioElement) this.pendingAudioElement.pause();
  }

  public resume() {
    if (this.currentAudioElement) {
      // A WebView may still reject playback after an interruption; the next
      // foreground/gesture cycle can retry without an unhandled rejection.
      void this.currentAudioElement.play().catch(() => {});
    }
  }

  public async stop(fadeOutMs: number = 1000) {
    if (!this.ctx || !this.musicGainNode || !this.currentAudioElement) return;

    // Fade out
    this.fadeOut(fadeOutMs);

    return new Promise<void>((resolve) => {
        setTimeout(() => {
            if (this.currentAudioElement) {
                this.currentAudioElement.pause();
                this.currentAudioElement.src = ''; // Clean up
                this.currentAudioElement = null;
            }
            if (this.currentSource) {
                this.currentSource.disconnect();
                this.currentSource = null;
            }
            this.currentTrackId = null;
            resolve();
        }, fadeOutMs);
    });
  }

  private fadeIn(ms: number) {
      if (!this.musicGainNode || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(0, now);
      this.musicGainNode.gain.linearRampToValueAtTime(this.isMuted ? 0 : this.volume, now + ms / 1000);
  }

  private fadeOut(ms: number) {
      if (!this.musicGainNode || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(0, now + ms / 1000);
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.musicGainNode && !this.isMuted) {
      this.musicGainNode.gain.value = this.volume;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.musicGainNode) {
      this.musicGainNode.gain.value = muted ? 0 : this.volume;
    }
  }

  public getVolume(): number { return this.volume; }
  public isMusicMuted(): boolean { return this.isMuted; }
  public getCurrentTrack(): string | null { return this.currentTrackId; }
}

export const music = new MusicEngine();
