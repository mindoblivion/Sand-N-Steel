import { MUSIC_TRACKS } from '../data/musicTracks';

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private musicGainNode: GainNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private currentSource: MediaElementAudioSourceNode | null = null;
  private currentTrackId: string | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;

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
    
    try {
        await audio.play();
        this.currentAudioElement = audio;
        this.currentSource = this.ctx.createMediaElementSource(audio);
        this.currentSource.connect(this.musicGainNode);
        
        this.fadeIn(options.fadeMs || 2000);
    } catch (e) {
        // Assets may be missing during development; log as a warning rather than a critical error
        console.warn(`MusicEngine: Skipping track ${trackId} (file not found or unsupported)`);
        this.currentTrackId = null;
    }
  }

  public pause() {
    if (this.currentAudioElement) this.currentAudioElement.pause();
  }

  public resume() {
    if (this.currentAudioElement) this.currentAudioElement.play();
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
